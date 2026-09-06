import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";
import ExcelJS from "exceljs";
import { prisma } from "../lib/prisma";
import { requireAuth, requireRole } from "../middleware/auth";
import { writeAudit } from "../services/audit";
import { config } from "../config";
import { FieldDef, FieldDataType, StampError, generateWorkbook, readWorkbookMeta, parseDataSheet, ParsedRow } from "../services/excelEngine";
import { CORE_COLUMN_NAMES } from "../services/apeCatalog";
import { FIXED_FIELDS_BY_TYPE, FixedImportType, FIXED_IMPORT_TYPES } from "../services/fixedImportFields";
import { resolveOrCreateCompany } from "../services/companies";

export const importsRouter = Router();
importsRouter.use(requireAuth, requireRole("ADMIN"));

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: config.maxUploadBytes } });

// ── Generate a stamped workbook for the 3 fixed (non-APE) import types ──
const generateFixedSchema = z.object({
  department: z.string().optional(),
  rosterFill: z.boolean().default(true),
});

importsRouter.post("/:importType/generate", async (req, res) => {
  const importType = req.params.importType as FixedImportType;
  if (!FIXED_IMPORT_TYPES.includes(importType)) {
    return res.status(400).json({ error: `Unknown import type. Use one of: ${FIXED_IMPORT_TYPES.join(", ")}` });
  }
  const parsed = generateFixedSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const fields = FIXED_FIELDS_BY_TYPE[importType];

  const roster = parsed.data.rosterFill
    ? (await prisma.employee.findMany({
        where: importType === "EMPLOYEES" ? {} : { isActive: true, ...(parsed.data.department ? { department: parsed.data.department } : {}) },
        orderBy: { lastName: "asc" },
        select: { employeeCode: true, firstName: true, lastName: true, middleName: true },
      })).map((e) => ({ employeeCode: e.employeeCode, lastName: e.lastName, firstName: e.firstName, middleName: e.middleName ?? "" }))
    : [];

  const workbook = generateWorkbook({
    fields,
    meta: {
      templateId: `SYSTEM:${importType}`,
      templateVersion: 1,
      importType,
      generatedAt: new Date().toISOString(),
      generatedBy: req.currentUser!.fullName,
    },
    roster,
    templateName: `FITWORK ${importType.replace(/_/g, " ")} import`,
  });

  await writeAudit({ req, userId: req.currentUser!.id, action: "IMPORT_RUN", entityType: "ImportBatch", details: { action: "workbook_generated", importType } });

  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="${importType}-import-template.xlsx"`);
  await workbook.xlsx.write(res);
  res.end();
});

// ── Resolve which FieldDef[] a stamped file's templateId/version refers to ──
async function resolveFields(importType: string, templateId: string, templateVersion: number): Promise<FieldDef[]> {
  if (templateId.startsWith("SYSTEM:")) {
    const type = templateId.slice("SYSTEM:".length) as FixedImportType;
    if (!FIXED_FIELDS_BY_TYPE[type]) throw new StampError("Unrecognized system template stamp.");
    return FIXED_FIELDS_BY_TYPE[type];
  }
  const template = await prisma.aPETemplate.findUnique({ where: { id: templateId }, include: { fields: true } });
  if (!template || template.version !== templateVersion) {
    throw new StampError("This file's template version no longer exists. Please download a fresh template.");
  }
  return template.fields.map((f) => ({
    key: f.key,
    label: f.label,
    dataType: f.dataType as FieldDataType,
    options: f.optionsJson ? JSON.parse(f.optionsJson) : undefined,
    unit: f.unit ?? undefined,
    isRequired: f.isRequired,
    section: f.section ?? undefined,
    mapsToCoreColumn: f.mapsToCoreColumn ?? undefined,
  }));
}

interface FieldChange {
  key: string;
  label: string;
  oldValue: string;
  newValue: string;
}

interface RowOutcome {
  rowNumber: number;
  employeeCode: string;
  employeeNameInFile: string;
  status: "NEW" | "UPDATE" | "ERROR" | "SKIPPED";
  errors: string[];
  // Non-blocking — surfaced in the dry-run preview but don't stop a commit
  // (e.g. the file's name columns don't match who this code currently
  // belongs to — a likely mistyped code, but the admin may know better).
  warnings: string[];
  // Old→new per field that will actually change on commit. Empty for NEW
  // rows (nothing to diff against) and for SKIPPED rows (matched an
  // existing record but every value already agrees with the file).
  changes: FieldChange[];
  data: Record<string, unknown>;
}

// Cells the file leaves blank always parse to `null` (see excelEngine's
// parseCellValue), never `undefined` — there is no way for a fixed-column
// Excel template to distinguish "this row doesn't care about this field"
// from "explicitly clear this field", so blank is always treated as the
// former. Every write path in this file must check for null, not just
// undefined, or a partial update silently nulls out real data — this was
// found live: an EMPLOYEES update row that left `last_name` blank crashed
// the whole import (and, since nothing here catches the resulting
// unhandled rejection, the whole server process) on the NOT NULL
// constraint, and would have silently wiped every other blank nullable
// column had the row not happened to touch a required one first.
function hasValue(v: unknown): boolean {
  return v !== null && v !== undefined;
}

function formatValue(v: unknown): string {
  if (!hasValue(v) || v === "") return "—";
  if (v instanceof Date) return v.toLocaleDateString();
  if (typeof v === "boolean") return v ? "Yes" : "No";
  return String(v);
}

// Old→new per field this row will actually touch — i.e. every field key in
// `fields` whose incoming value is present (blank cells are skipped
// entirely: per hasValue's note above, they never touch existing data, so
// they must never appear as a "change" either). `existing` is null for a
// brand-new record, in which case nothing is diffable and this always
// returns [].
function diffFields(
  fields: { key: string; label: string }[],
  existing: Record<string, unknown> | null,
  incoming: Record<string, unknown>
): FieldChange[] {
  if (!existing) return [];
  const changes: FieldChange[] = [];
  for (const f of fields) {
    if (!hasValue(incoming[f.key])) continue;
    const oldStr = formatValue(existing[f.key]);
    const newStr = formatValue(incoming[f.key]);
    if (oldStr !== newStr) changes.push({ key: f.key, label: f.label, oldValue: oldStr, newValue: newStr });
  }
  return changes;
}

// Builds only the {schemaColumn: value} pairs this row actually provides —
// the safe replacement for `row.data[key] !== undefined` checks, which
// missed the fact that a blank cell is `null` (defined), not `undefined`.
function presentColumns(columnMap: Record<string, string>, data: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [fileKey, column] of Object.entries(columnMap)) {
    if (hasValue(data[fileKey])) out[column] = data[fileKey];
  }
  return out;
}

function employeeDisplayName(e: { lastName: string; firstName: string; middleName: string | null }): string {
  return [e.lastName, [e.firstName, e.middleName].filter(Boolean).join(" ")].filter(Boolean).join(", ");
}

// Every importer resolves a row to an employee by code alone — the name
// columns are read-only, roster-generated "does this look right?" copy
// (see excelEngine's generateWorkbook), never used for matching. This
// closes the gap where a mistyped/stale code silently attaches a clinical
// record to the wrong person: if the file's name doesn't match who that
// code currently belongs to, warn (don't block — the admin may know the
// employee's name changed, or be intentionally correcting it).
function checkNameMismatch(employeeCode: string, existing: { lastName: string; firstName: string; middleName: string | null }, fileNameDisplay: string): string | null {
  if (!fileNameDisplay.trim()) return null;
  const existingDisplay = employeeDisplayName(existing);
  if (existingDisplay.trim().toLowerCase() === fileNameDisplay.trim().toLowerCase()) return null;
  return `Code ${employeeCode} currently belongs to "${existingDisplay}", but this row says "${fileNameDisplay}".`;
}

const EMPLOYEE_FIELD_COLUMN_MAP: Record<string, string> = {
  last_name: "lastName", first_name: "firstName", middle_name: "middleName", suffix: "suffix",
  date_of_birth: "dateOfBirth", sex: "sex", civil_status: "civilStatus", blood_type: "bloodType",
  religion: "religion",
  department: "department", position: "position", employment_status: "employmentStatus",
  date_hired: "dateHired", mobile_number: "mobileNumber", address: "address",
  emergency_contact_name: "emergencyContactName", emergency_contact_relation: "emergencyContactRelation",
  emergency_contact_number: "emergencyContactNumber", known_allergies: "knownAllergies", chronic_conditions: "chronicConditions",
};

function employeeSnapshot(e: Record<string, unknown> & { company?: { name: string } | null }): Record<string, unknown> {
  const snapshot: Record<string, unknown> = { company_name: e.company?.name ?? null };
  for (const [fileKey, column] of Object.entries(EMPLOYEE_FIELD_COLUMN_MAP)) {
    snapshot[fileKey] = e[column];
  }
  return snapshot;
}

const DRUG_TEST_FIELD_COLUMN_MAP: Record<string, string> = {
  test_date: "testDate", result: "result", specimen_type: "specimenType", lab_name: "labName", remarks: "remarks",
};

const PRE_EMPLOYMENT_FIELD_COLUMN_MAP: Record<string, string> = {
  exam_date: "examDate", provider: "provider", height_cm: "heightCm", weight_kg: "weightKg",
  blood_pressure: "bloodPressure", vision_od: "visionOD", vision_os: "visionOS", hearing: "hearing",
  cbc_result: "cbcResult", urinalysis_result: "urinalysisResult", fecalysis_result: "fecalysisResult",
  chest_xray_result: "chestXrayResult", ecg_result: "ecgResult", drug_test_result: "drugTestResult",
  pregnancy_test_result: "pregnancyTestResult", medical_history: "medicalHistory", physical_exam_findings: "physicalExamFindings",
  other_findings: "otherFindings", significant_findings: "significantFindings", recommendations: "recommendations",
  fitness_classification: "fitnessClassification",
};

function recordSnapshot(columnMap: Record<string, string>, record: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!record) return null;
  const snapshot: Record<string, unknown> = {};
  for (const [fileKey, column] of Object.entries(columnMap)) snapshot[fileKey] = record[column];
  return snapshot;
}

// Company assignment is resolved separately from the rest of a row's fields
// (see resolveRowCompany) — free text OR a file-level default, never a
// plain scalar column — so it needs its own diff entry rather than falling
// out of diffFields. Returns null when the row carries no company info at
// all (existing assignment stays untouched, nothing to show).
function companyChange(
  existingCompanyName: string | null,
  resolution: { companyName?: string; companyId?: string },
  companiesById: Map<string, string>
): FieldChange | null {
  let newName: string | undefined;
  if (resolution.companyName) newName = resolution.companyName;
  else if (resolution.companyId) newName = companiesById.get(resolution.companyId);
  if (newName === undefined) return null;
  const oldStr = formatValue(existingCompanyName);
  const newStr = formatValue(newName);
  if (oldStr === newStr) return null;
  return { key: "company_name", label: "Company/Agency", oldValue: oldStr, newValue: newStr };
}

// APE, Drug Test, and Pre-Employment imports must record which company each
// imported record's employee currently belongs to. Drug Test/Pre-Employment's
// fixed-column templates carry an optional per-row company_name column (for
// mixed-company batches — free text, matched case-insensitively/trimmed
// against the admin-managed Company list, auto-creating a new company if
// it's genuinely new, same as the EMPLOYEES import's own company_name
// column); APE's admin-customizable template has no clean way to inject an
// Employee-level field into its AnnualPhysicalExam-column-mapping system, so
// APE rows always fall through to the file-level default company chosen at
// upload time (a real, already-existing Company selected from the
// admin-managed list — never free text, so a typo at upload time can't
// create a stray company). Whichever wins is threaded through to commit
// time via the row's `data` so the referenced employee's company gets
// updated alongside the exam/test record itself.
const COMPANY_SCOPED_IMPORT_TYPES = new Set(["APE", "DRUG_TEST", "PRE_EMPLOYMENT"]);

function resolveRowCompany(
  data: Record<string, unknown>,
  defaultCompanyId?: string
): { companyName?: string; companyId?: string } {
  const rowCompanyName = data.company_name ? String(data.company_name).trim() : undefined;
  if (rowCompanyName) return { companyName: rowCompanyName };
  if (defaultCompanyId) return { companyId: defaultCompanyId };
  return {};
}

function extractFieldValue(fv: { valueText: string | null; valueNumber: number | null; valueDate: Date | null; valueBool: boolean | null }): unknown {
  if (fv.valueText !== null) return fv.valueText;
  if (fv.valueNumber !== null) return fv.valueNumber;
  if (fv.valueDate !== null) return fv.valueDate;
  if (fv.valueBool !== null) return fv.valueBool;
  return null;
}

// Fields the generic diff loop should never touch — resolved separately
// (company) or purely internal bookkeeping (nothing here yet, but keeps the
// exclusion in one place for whichever COMPANY_SCOPED type is diffing).
const NON_DIFFABLE_FIELD_KEYS = new Set(["company_name"]);

async function evaluateRows(
  importType: string, templateId: string, rows: ParsedRow[], fields: FieldDef[], examYear?: number,
  defaultCompanyId?: string
): Promise<RowOutcome[]> {
  const outcomes: RowOutcome[] = [];
  const diffableFields = fields.filter((f) => !NON_DIFFABLE_FIELD_KEYS.has(f.key));
  const companiesById = new Map((await prisma.company.findMany({ select: { id: true, name: true } })).map((c) => [c.id, c.name]));

  // Two-pass for EMPLOYEES: a code duplicated within the same file is
  // ambiguous (which row should win?) and must be flagged before we try to
  // create/update anything, not silently resolved by "last row wins".
  const codeCounts = new Map<string, number>();
  if (importType === "EMPLOYEES") {
    for (const row of rows) {
      if (row.isBlank || !row.employeeCode) continue;
      codeCounts.set(row.employeeCode, (codeCounts.get(row.employeeCode) ?? 0) + 1);
    }
  }

  for (const row of rows) {
    const errors: string[] = [];
    const warnings: string[] = [];
    const data: Record<string, unknown> = {};

    for (const [key, v] of Object.entries(row.values)) {
      if (v.error) errors.push(`${key}: ${v.error}`);
      else data[key] = v.raw;
    }

    if (row.isBlank) {
      outcomes.push({ rowNumber: row.rowNumber, employeeCode: "", employeeNameInFile: "", status: "SKIPPED", errors: [], warnings: [], changes: [], data: {} });
      continue;
    }

    if (!row.employeeCode) {
      outcomes.push({ rowNumber: row.rowNumber, employeeCode: "", employeeNameInFile: row.employeeNameInFile, status: "ERROR", errors: ["Missing employee_code"], warnings: [], changes: [], data });
      continue;
    }

    const employee = await prisma.employee.findUnique({ where: { employeeCode: row.employeeCode }, include: { company: true } });

    if (importType === "EMPLOYEES") {
      if ((codeCounts.get(row.employeeCode) ?? 0) > 1) {
        errors.push(`Duplicate employee_code "${row.employeeCode}" appears more than once in this file`);
      }
      // Required fields only matter for brand-new employees — an UPDATE row
      // legitimately leaves untouched columns blank (see PATCH /employees/:id).
      if (!employee) {
        for (const f of fields) {
          if (f.isRequired && !hasValue(data[f.key])) errors.push(`${f.label} is required`);
        }
      }
      const hasAnyData = Object.values(data).some(hasValue);
      if (!hasAnyData) {
        outcomes.push({ rowNumber: row.rowNumber, employeeCode: row.employeeCode, employeeNameInFile: row.employeeNameInFile, status: "SKIPPED", errors: ["Nothing to import"], warnings: [], changes: [], data });
        continue;
      }
      if (employee && row.employeeNameInFile) {
        const warning = checkNameMismatch(row.employeeCode, employee, row.employeeNameInFile);
        if (warning) warnings.push(warning);
      }
      const snapshot = employee ? employeeSnapshot(employee) : null;
      const changes = errors.length ? [] : diffFields(diffableFields, snapshot, data);
      const status = errors.length ? "ERROR" : !employee ? "NEW" : changes.length ? "UPDATE" : "SKIPPED";
      outcomes.push({ rowNumber: row.rowNumber, employeeCode: row.employeeCode, employeeNameInFile: row.employeeNameInFile, status, errors, warnings, changes, data });
      continue;
    }

    if (!employee) {
      outcomes.push({ rowNumber: row.rowNumber, employeeCode: row.employeeCode, employeeNameInFile: row.employeeNameInFile, status: "ERROR", errors: [`Unknown or inactive employee code: ${row.employeeCode}`], warnings: [], changes: [], data });
      continue;
    }
    if (!employee.isActive) {
      outcomes.push({ rowNumber: row.rowNumber, employeeCode: row.employeeCode, employeeNameInFile: row.employeeNameInFile, status: "ERROR", errors: [`Employee ${row.employeeCode} is not active`], warnings: [], changes: [], data });
      continue;
    }

    const hasAnyData = Object.values(data).some(hasValue);
    if (!hasAnyData) {
      outcomes.push({ rowNumber: row.rowNumber, employeeCode: row.employeeCode, employeeNameInFile: row.employeeNameInFile, status: "SKIPPED", errors: ["Nothing to import"], warnings: [], changes: [], data });
      continue;
    }

    if (errors.length) {
      outcomes.push({ rowNumber: row.rowNumber, employeeCode: row.employeeCode, employeeNameInFile: row.employeeNameInFile, status: "ERROR", errors, warnings: [], changes: [], data });
      continue;
    }

    if (row.employeeNameInFile) {
      const warning = checkNameMismatch(row.employeeCode, employee, row.employeeNameInFile);
      if (warning) warnings.push(warning);
    }

    const companyAssignment = COMPANY_SCOPED_IMPORT_TYPES.has(importType)
      ? resolveRowCompany(data, defaultCompanyId)
      : {};
    const existingCompanyName = employee.company?.name ?? null;

    if (importType === "APE") {
      const existingApe = examYear ? await prisma.annualPhysicalExam.findUnique({ where: { employeeId_examYear: { employeeId: employee.id, examYear } } }) : null;
      const existingFieldValues = existingApe
        ? Object.fromEntries((await prisma.aPEFieldValue.findMany({ where: { apeId: existingApe.id } })).map((fv) => [fv.fieldKey, extractFieldValue(fv)]))
        : {};
      const snapshot: Record<string, unknown> | null = existingApe
        ? Object.fromEntries(diffableFields.map((f) => [f.key, f.mapsToCoreColumn ? (existingApe as unknown as Record<string, unknown>)[f.mapsToCoreColumn] : existingFieldValues[f.key]]))
        : null;
      const changes = diffFields(diffableFields, snapshot, data);
      const companyDiff = companyChange(existingCompanyName, companyAssignment, companiesById);
      if (companyDiff) changes.push(companyDiff);
      const status = existingApe ? (changes.length ? "UPDATE" : "SKIPPED") : "NEW";
      outcomes.push({ rowNumber: row.rowNumber, employeeCode: row.employeeCode, employeeNameInFile: row.employeeNameInFile, status, errors: [], warnings, changes, data: { ...data, employeeId: employee.id, ...companyAssignment } });
      continue;
    }

    // Drug Test / Pre-Employment — append-only by design (see schema
    // comments), so re-importing must not just always create another row.
    // Dedup key is (employeeId, the row's own date column) scoped to
    // sourceType "IMPORT" only: a manually-charted result from a nurse is a
    // deliberate, distinct clinical entry and must never be silently
    // overwritten by a later bulk import that happens to share a date.
    const columnMap = importType === "DRUG_TEST" ? DRUG_TEST_FIELD_COLUMN_MAP : PRE_EMPLOYMENT_FIELD_COLUMN_MAP;
    const dateKey = importType === "DRUG_TEST" ? "test_date" : "exam_date";
    const dateValue = data[dateKey] as Date | null | undefined;
    const existingRecord = hasValue(dateValue)
      ? importType === "DRUG_TEST"
        ? await prisma.drugTestResult.findFirst({ where: { employeeId: employee.id, testDate: dateValue as Date, sourceType: "IMPORT" }, orderBy: { createdAt: "desc" } })
        : await prisma.preEmploymentExam.findFirst({ where: { employeeId: employee.id, examDate: dateValue as Date, sourceType: "IMPORT" }, orderBy: { createdAt: "desc" } })
      : null;
    const snapshot = recordSnapshot(columnMap, existingRecord);
    const changes = diffFields(diffableFields, snapshot, data);
    const companyDiff = companyChange(existingCompanyName, companyAssignment, companiesById);
    if (companyDiff) changes.push(companyDiff);
    const status = existingRecord ? (changes.length ? "UPDATE" : "SKIPPED") : "NEW";
    outcomes.push({
      rowNumber: row.rowNumber, employeeCode: row.employeeCode, employeeNameInFile: row.employeeNameInFile, status, errors: [], warnings, changes,
      data: { ...data, employeeId: employee.id, ...companyAssignment, existingRecordId: existingRecord?.id },
    });
  }

  return outcomes;
}

const IMPORTS_DIR = () => path.join(config.storageDir, "_imports");

importsRouter.post("/dry-run", upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file provided" });
  const examYear = req.body.examYear ? Number(req.body.examYear) : undefined;
  // Fallback company (an existing Company id, selected from the
  // admin-managed list) for any row that has no company_name column of its
  // own — see COMPANY_SCOPED_IMPORT_TYPES.
  const defaultCompanyId: string | undefined = req.body.defaultCompanyId || undefined;

  try {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(req.file.buffer as unknown as ExcelJS.Buffer);

    const meta = await readWorkbookMeta(workbook);
    const resolvedExamYear = meta.examYear ?? examYear;
    const fields = await resolveFields(meta.importType, meta.templateId, meta.templateVersion);
    const rows = parseDataSheet(workbook, fields);
    const outcomes = await evaluateRows(meta.importType, meta.templateId, rows, fields, resolvedExamYear, defaultCompanyId);

    fs.mkdirSync(IMPORTS_DIR(), { recursive: true });
    const storedPath = path.join(IMPORTS_DIR(), `${uuidv4()}-${req.file.originalname}`);
    fs.writeFileSync(storedPath, req.file.buffer);

    const batch = await prisma.importBatch.create({
      data: {
        filename: req.file.originalname,
        storedPath,
        importType: meta.importType,
        importedById: req.currentUser!.id,
        status: "DRY_RUN",
        totalRows: outcomes.length,
        createdCount: outcomes.filter((o) => o.status === "NEW").length,
        updatedCount: outcomes.filter((o) => o.status === "UPDATE").length,
        errorCount: outcomes.filter((o) => o.status === "ERROR").length,
        errorLogJson: JSON.stringify({ examYear: resolvedExamYear, rows: outcomes }),
        templateId: meta.templateId.startsWith("SYSTEM:") ? null : meta.templateId,
        templateVersion: meta.templateVersion,
      },
    });

    res.json({
      batchId: batch.id,
      importType: meta.importType,
      examYear: resolvedExamYear,
      summary: {
        total: outcomes.length,
        new: outcomes.filter((o) => o.status === "NEW").length,
        update: outcomes.filter((o) => o.status === "UPDATE").length,
        error: outcomes.filter((o) => o.status === "ERROR").length,
        skipped: outcomes.filter((o) => o.status === "SKIPPED").length,
      },
      rows: outcomes,
    });
  } catch (err) {
    if (err instanceof StampError) return res.status(400).json({ error: err.message });
    throw err;
  }
});

// Updates the referenced employee's company from a row's resolved company
// assignment — see resolveRowCompany/COMPANY_SCOPED_IMPORT_TYPES above. A
// no-op when the row carries no company info (no column and no default was
// selected at upload time).
async function applyRowCompany(tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0], data: Record<string, unknown>): Promise<void> {
  const employeeId = data.employeeId as string;
  const companyName = data.companyName as string | undefined;
  if (companyName) {
    const company = await resolveOrCreateCompany(tx, companyName);
    await tx.employee.update({ where: { id: employeeId }, data: { companyId: company.id } });
    return;
  }
  const companyId = data.companyId as string | undefined;
  if (companyId) {
    await tx.employee.update({ where: { id: employeeId }, data: { companyId } });
  }
}

importsRouter.post("/:batchId/commit", async (req, res) => {
  const batch = await prisma.importBatch.findUnique({ where: { id: req.params.batchId } });
  if (!batch) return res.status(404).json({ error: "Import batch not found" });
  if (batch.status !== "DRY_RUN") return res.status(400).json({ error: "This batch has already been committed" });
  if (!batch.errorLogJson) return res.status(400).json({ error: "No dry-run data found for this batch" });

  const stored: { examYear?: number; rows: RowOutcome[] } = JSON.parse(batch.errorLogJson);
  const outcomes = stored.rows;
  const actionable = outcomes.filter((o) => o.status === "NEW" || o.status === "UPDATE");

  // Per-record audit entries (EMPLOYEES rows, APE rows) are collected here
  // and written after the transaction commits, not from inside it —
  // writeAudit() uses the top-level `prisma` client rather than `tx`, and
  // calling it from inside the interactive transaction contends with `tx`'s
  // own SQLite lock, which reliably blew the 5s transaction timeout in
  // testing. Deferring also means a row whose write actually rolled back
  // never gets a misleading audit entry.
  const pendingRecordAudits: {
    employeeId: string;
    action: "IMPORT_CREATE_EMPLOYEE" | "IMPORT_UPDATE_EMPLOYEE" | "IMPORT_CREATE_APE" | "IMPORT_UPDATE_APE";
    entityType: string;
    entityId: string;
    details: Record<string, unknown>;
  }[] = [];

  try {
    await prisma.$transaction(async (tx) => {
      for (const row of actionable) {
        if (batch.importType === "EMPLOYEES") {
          const employeeData = presentColumns(EMPLOYEE_FIELD_COLUMN_MAP, row.data);

          // company_name is a free-text column in the workbook but a real FK
          // on Employee — resolve (or lazily create) the matching Company row
          // rather than passing the name straight to Prisma. Matched
          // case-insensitively/trimmed via resolveOrCreateCompany so re-typed
          // agency names (different casing) never fork into duplicate rows.
          // A blank cell leaves the existing assignment untouched, same as
          // every other field here — it is not a way to unassign a company.
          if (hasValue(row.data.company_name)) {
            const companyName = String(row.data.company_name).trim();
            if (companyName) {
              const company = await resolveOrCreateCompany(tx, companyName);
              employeeData.companyId = company.id;
            }
          }
          const employee = await tx.employee.upsert({
            where: { employeeCode: row.employeeCode },
            create: { employeeCode: row.employeeCode, lastName: String(row.data.last_name || row.employeeNameInFile || row.employeeCode), firstName: String(row.data.first_name || ""), ...employeeData },
            update: employeeData,
          });

          // Per-employee audit entry, distinct from the batch-level IMPORT_RUN
          // entry below and from a manual edit's UPDATE_EMPLOYEE — an import
          // that touches 50 employees must leave 50 individually-findable
          // entries on those employees' Audit tabs, not just one opaque
          // batch-level line that shows on none of them. Queued here, written
          // after the transaction commits (see pendingRecordAudits above).
          pendingRecordAudits.push({
            employeeId: employee.id,
            action: row.status === "NEW" ? "IMPORT_CREATE_EMPLOYEE" : "IMPORT_UPDATE_EMPLOYEE",
            entityType: "Employee", entityId: employee.id,
            details: row.status === "NEW"
              ? { importBatchId: batch.id, filename: batch.filename, fields: employeeData }
              : { importBatchId: batch.id, filename: batch.filename, changes: row.changes },
          });
        } else if (batch.importType === "MEDICATIONS") {
          await tx.medicationLog.create({
            data: {
              employeeId: row.data.employeeId as string,
              dispensedAt: (row.data.dispensed_at as Date) ?? new Date(),
              dispensedById: req.currentUser!.id,
              drugName: String(row.data.drug_name),
              strength: row.data.strength as string | undefined,
              dosageForm: row.data.dosage_form as string | undefined,
              route: row.data.route as string | undefined,
              frequency: row.data.frequency as string | undefined,
              quantityDispensed: row.data.quantity_dispensed as string | undefined,
              indication: row.data.indication as string | undefined,
              remarks: row.data.remarks as string | undefined,
            },
          });
        } else if (batch.importType === "HISTORICAL_NOTES") {
          await tx.clinicalNote.create({
            data: {
              employeeId: row.data.employeeId as string,
              authorId: req.currentUser!.id,
              authorNameSnapshot: row.data.legacy_author_name
                ? String(row.data.legacy_author_name)
                : req.currentUser!.fullName,
              noteType: String(row.data.note_type),
              visitDateTime: (row.data.visit_date as Date) ?? new Date(),
              chiefComplaint: row.data.chief_complaint as string | undefined,
              assessment: row.data.assessment as string | undefined,
              diagnosis: row.data.diagnosis as string | undefined,
              treatment: row.data.treatment as string | undefined,
              recommendation: row.data.recommendation as string | undefined,
              nursingDiagnosis: row.data.nursing_diagnosis as string | undefined,
              plan: row.data.plan as string | undefined,
              intervention: row.data.intervention as string | undefined,
              evaluation: row.data.evaluation as string | undefined,
              disposition: row.data.disposition as string | undefined,
              isWorkRelated: Boolean(row.data.is_work_related),
              status: "FINAL",
              sourceType: "IMPORT",
              legacyAuthorName: String(row.data.legacy_author_name || "Unknown (legacy)"),
              editableUntil: null,
            },
          });
        } else if (batch.importType === "DRUG_TEST") {
          await applyRowCompany(tx, row.data);
          const fieldData = presentColumns(DRUG_TEST_FIELD_COLUMN_MAP, row.data);
          const existingRecordId = row.data.existingRecordId as string | undefined;
          if (existingRecordId) {
            // Matched an existing IMPORT-sourced row for this employee/date
            // (see evaluateRows) — update it in place, same partial-merge
            // semantics as every other importer, rather than creating a
            // duplicate. importBatchId moves to this batch so the record
            // traces back to whichever import last touched it.
            await tx.drugTestResult.update({ where: { id: existingRecordId }, data: { ...fieldData, importBatchId: batch.id } });
          } else {
            await tx.drugTestResult.create({
              data: {
                employeeId: row.data.employeeId as string,
                testDate: (row.data.test_date as Date) ?? new Date(),
                result: String(row.data.result),
                specimenType: row.data.specimen_type as string | undefined,
                labName: row.data.lab_name as string | undefined,
                remarks: row.data.remarks as string | undefined,
                sourceType: "IMPORT",
                importBatchId: batch.id,
              },
            });
          }
        } else if (batch.importType === "PRE_EMPLOYMENT") {
          await applyRowCompany(tx, row.data);
          const fieldData = presentColumns(PRE_EMPLOYMENT_FIELD_COLUMN_MAP, row.data);
          const existingRecordId = row.data.existingRecordId as string | undefined;
          if (existingRecordId) {
            const existing = await tx.preEmploymentExam.findUnique({ where: { id: existingRecordId } });
            const effectiveHeightCm = (fieldData.heightCm as number | undefined) ?? existing?.heightCm ?? undefined;
            const effectiveWeightKg = (fieldData.weightKg as number | undefined) ?? existing?.weightKg ?? undefined;
            if (effectiveHeightCm && effectiveWeightKg) {
              const h = effectiveHeightCm / 100;
              fieldData.bmi = Math.round((effectiveWeightKg / (h * h)) * 10) / 10;
            }
            await tx.preEmploymentExam.update({ where: { id: existingRecordId }, data: { ...fieldData, importBatchId: batch.id } });
          } else {
            const heightCm = fieldData.heightCm as number | undefined;
            const weightKg = fieldData.weightKg as number | undefined;
            const bmi = heightCm && weightKg ? Math.round((weightKg / ((heightCm / 100) ** 2)) * 10) / 10 : undefined;
            await tx.preEmploymentExam.create({
              data: {
                employeeId: row.data.employeeId as string,
                sourceType: "IMPORT",
                importBatchId: batch.id,
                ...fieldData,
                bmi,
              },
            });
          }
        } else if (batch.importType === "APE") {
          await applyRowCompany(tx, row.data);
          const examYear = stored.examYear;
          if (!examYear) throw new Error("examYear is required to commit an APE import");

          const coreData: Record<string, unknown> = {};
          const fieldValues: { fieldKey: string; templateVersion: number; valueText?: string; valueNumber?: number; valueDate?: Date; valueBool?: boolean }[] = [];

          const template = batch.templateId
            ? await tx.aPETemplate.findUnique({ where: { id: batch.templateId }, include: { fields: true } })
            : null;

          // Synthetic keys injected in evaluateRows alongside the real
          // template field values — never real APE field keys, so they must
          // never fall into the custom-field "else" branch below and end up
          // as a bogus APEFieldValue row.
          const SYNTHETIC_KEYS = new Set(["employeeId", "companyId", "companyName"]);

          for (const [key, value] of Object.entries(row.data)) {
            if (SYNTHETIC_KEYS.has(key)) continue;
            if (!hasValue(value)) continue; // blank cell — leave whatever's already there alone
            const fieldDef = template?.fields.find((f) => f.key === key);
            if (fieldDef?.mapsToCoreColumn && CORE_COLUMN_NAMES.has(fieldDef.mapsToCoreColumn)) {
              coreData[fieldDef.mapsToCoreColumn] = value;
            } else {
              const entry: typeof fieldValues[number] = { fieldKey: key, templateVersion: batch.templateVersion ?? 1 };
              if (typeof value === "number") entry.valueNumber = value;
              else if (value instanceof Date) entry.valueDate = value;
              else if (typeof value === "boolean") entry.valueBool = value;
              else entry.valueText = String(value);
              fieldValues.push(entry);
            }
          }

          // BMI must reflect this row's height/weight combined with whatever
          // is already on the existing record — not just values present in
          // this particular import row (otherwise updating only one of the
          // two leaves a stale BMI computed against the old value of the other).
          const existingApeForBmi = await tx.annualPhysicalExam.findUnique({
            where: { employeeId_examYear: { employeeId: row.data.employeeId as string, examYear } },
          });
          const effectiveHeightCm = (coreData.heightCm as number | undefined) ?? existingApeForBmi?.heightCm ?? undefined;
          const effectiveWeightKg = (coreData.weightKg as number | undefined) ?? existingApeForBmi?.weightKg ?? undefined;
          if (effectiveHeightCm && effectiveWeightKg) {
            const h = effectiveHeightCm / 100;
            coreData.bmi = Math.round((effectiveWeightKg / (h * h)) * 10) / 10;
          }

          const ape = await tx.annualPhysicalExam.upsert({
            where: { employeeId_examYear: { employeeId: row.data.employeeId as string, examYear } },
            create: { employeeId: row.data.employeeId as string, examYear, sourceType: "IMPORT", importBatchId: batch.id, ...coreData },
            update: { sourceType: "IMPORT", importBatchId: batch.id, ...coreData },
          });

          // Partial merge, same as every other field here: only the custom
          // fields this row actually provides get replaced — a re-import
          // that omits a custom field previously set must not delete it.
          // (Genuinely clearing a custom field is not something a bulk
          // import can express — do that through the APE record directly.)
          if (fieldValues.length) {
            await tx.aPEFieldValue.deleteMany({ where: { apeId: ape.id, fieldKey: { in: fieldValues.map((fv) => fv.fieldKey) } } });
            await tx.aPEFieldValue.createMany({ data: fieldValues.map((fv) => ({ apeId: ape.id, ...fv })) });
          }

          // Same per-record audit gap as EMPLOYEES imports: a re-import that
          // only touches clinical fields (BP, BMI, etc.) and never the exam
          // date itself leaves no other trace that the record was updated —
          // nothing tracks "last modified" separately from examYear. Queued
          // here, written after the transaction commits (see
          // pendingRecordAudits above).
          pendingRecordAudits.push({
            employeeId: row.data.employeeId as string,
            action: row.status === "NEW" ? "IMPORT_CREATE_APE" : "IMPORT_UPDATE_APE",
            entityType: "AnnualPhysicalExam", entityId: ape.id,
            details: { importBatchId: batch.id, filename: batch.filename, examYear, changes: row.changes },
          });
        }
      }

      // Lock the template on first successful commit (§8.1 — "versioned and locked on first use")
      if (batch.importType === "APE" && batch.templateId) {
        await tx.aPETemplate.update({ where: { id: batch.templateId }, data: { isLocked: true } });
      }

      await tx.importBatch.update({
        where: { id: batch.id },
        data: { status: "COMMITTED", finishedAt: new Date() },
      });
    });

    await writeAudit({ req, userId: req.currentUser!.id, action: "IMPORT_RUN", entityType: "ImportBatch", entityId: batch.id, details: { importType: batch.importType, committed: true, rows: actionable.length } });
    for (const pending of pendingRecordAudits) {
      await writeAudit({ req, userId: req.currentUser!.id, action: pending.action, entityType: pending.entityType, entityId: pending.entityId, employeeId: pending.employeeId, details: pending.details });
    }

    const updated = await prisma.importBatch.findUnique({ where: { id: batch.id } });
    res.json(updated);
  } catch (err) {
    await prisma.importBatch.update({ where: { id: batch.id }, data: { status: "FAILED", finishedAt: new Date() } });
    throw err;
  }
});

importsRouter.get("/", async (_req, res) => {
  const batches = await prisma.importBatch.findMany({
    orderBy: { startedAt: "desc" },
    take: 100,
    include: { importedBy: { select: { fullName: true } } },
  });
  res.json(batches.map((b) => ({ ...b, errorLogJson: undefined })));
});

importsRouter.get("/:batchId/report", async (req, res) => {
  const batch = await prisma.importBatch.findUnique({ where: { id: req.params.batchId } });
  if (!batch || !batch.errorLogJson) return res.status(404).json({ error: "Import batch not found" });

  const stored: { examYear?: number; rows: RowOutcome[] } = JSON.parse(batch.errorLogJson);
  const outcomes = stored.rows;
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Import Result");
  sheet.columns = [
    { header: "Row", key: "rowNumber", width: 8 },
    { header: "Employee Code", key: "employeeCode", width: 16 },
    { header: "Status", key: "status", width: 12 },
    { header: "Errors", key: "errors", width: 60 },
  ];
  sheet.getRow(1).font = { bold: true };
  outcomes.forEach((o) => sheet.addRow({ rowNumber: o.rowNumber, employeeCode: o.employeeCode, status: o.status, errors: o.errors.join("; ") }));

  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="import-result-${batch.id}.xlsx"`);
  await workbook.xlsx.write(res);
  res.end();
});
