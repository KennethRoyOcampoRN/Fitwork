import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { v4 as uuid } from "uuid";
import sharp from "sharp";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, requireRole } from "../middleware/auth";
import { writeAudit } from "../services/audit";
import { employeeDir } from "../lib/storage";
import { isAllowedUpload } from "../lib/magicBytes";
import { config } from "../config";
import { buildReportPdf, pickVitalsForNote, ReportSection, ReportNote, ReportMedication, ReportApe, ReportVitalsRecord, ReportDrugTest, ReportPreEmployment } from "../services/reportPdf";
import { mergeLatestVitals } from "../services/vitals";
import { getAppName } from "../services/appSettings";

export const employeesRouter = Router();
employeesRouter.use(requireAuth);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: config.maxUploadBytes } });

// ── Search ──────────────────────────────────────────────────────────────
employeesRouter.get("/search", async (req, res) => {
  const q = String(req.query.q || "").trim();
  if (!q) return res.json({ exactMatch: null, results: [] });

  // SQLite's LIKE (which Prisma's `contains`/`equals` compile to) is
  // case-insensitive for ASCII by default, so no `mode` option is needed
  // (and Prisma's sqlite provider does not support it).
  const exact = await prisma.employee.findFirst({
    where: { employeeCode: { equals: q }, isActive: true },
  });

  const results = await prisma.employee.findMany({
    where: {
      isActive: true,
      OR: [
        { employeeCode: { contains: q } },
        { firstName: { contains: q } },
        { lastName: { contains: q } },
        { department: { contains: q } },
      ],
    },
    take: 25,
    orderBy: { lastName: "asc" },
    include: { clinicalNotes: { orderBy: { visitDateTime: "desc" }, take: 1, select: { visitDateTime: true } } },
  });

  res.json({
    exactMatch: exact ? exact.id : null,
    results: results.map((e) => ({
      id: e.id,
      employeeCode: e.employeeCode,
      firstName: e.firstName,
      lastName: e.lastName,
      department: e.department,
      photoThumbPath: e.photoThumbPath,
      lastVisit: e.clinicalNotes[0]?.visitDateTime ?? null,
    })),
  });
});

// ── List / Create ──────────────────────────────────────────────────────
employeesRouter.get("/", async (req, res) => {
  const department = req.query.department ? String(req.query.department) : undefined;
  const employees = await prisma.employee.findMany({
    where: { isActive: true, ...(department ? { department } : {}) },
    orderBy: { lastName: "asc" },
    include: { company: { select: { id: true, name: true } } },
  });
  res.json(employees);
});

// Registered ahead of GET /:id so "archived" is never mistaken for an id.
employeesRouter.get("/archived", requireRole("ADMIN"), async (_req, res) => {
  const employees = await prisma.employee.findMany({
    where: { isActive: false },
    orderBy: { lastName: "asc" },
    include: { company: { select: { id: true, name: true } } },
  });
  res.json(employees);
});

// Company is admin-managed (Admin > Companies) — the employee form only
// ever selects from that list, it never creates a company on the fly. A
// company reference is validated (exists + active) at request time in both
// the create and update handlers below, rather than resolved/created here.
const employeeSchema = z.object({
  employeeCode: z.string().min(1),
  lastName: z.string().min(1),
  firstName: z.string().min(1),
  middleName: z.string().optional(),
  suffix: z.string().optional(),
  dateOfBirth: z.string().optional(),
  sex: z.enum(["MALE", "FEMALE"]).optional(),
  civilStatus: z.string().optional(),
  bloodType: z.string().optional(),
  religion: z.string().optional(),
  companyId: z.string().uuid().optional(),
  department: z.string().optional(),
  position: z.string().optional(),
  employmentStatus: z.string().optional(),
  dateHired: z.string().optional(),
  mobileNumber: z.string().optional(),
  address: z.string().optional(),
  emergencyContactName: z.string().optional(),
  emergencyContactRelation: z.string().optional(),
  emergencyContactNumber: z.string().optional(),
  knownAllergies: z.string().optional(),
  chronicConditions: z.string().optional(),
});

// Shared by create/update — a companyId must reference a real, active
// Company row (never silently accepted, never auto-created here).
async function validateCompanyId(companyId: string | null | undefined): Promise<string | null> {
  if (!companyId) return null;
  const company = await prisma.company.findUnique({ where: { id: companyId } });
  if (!company || !company.isActive) throw new CompanyValidationError();
  return companyId;
}
class CompanyValidationError extends Error {}

// Creating/editing employee demographics is restricted to NURSE and ADMIN.
// This overrides the spec's original §4 wording ("all clinical roles") per
// an explicit clarification: doctors and dentists are contracted/visiting
// clinicians, not regular company employees, and should not be able to
// create or edit employee records — read access (C7) is unaffected.
const requireNurseOrAdmin = requireRole("NURSE", "ADMIN");

employeesRouter.post("/", requireNurseOrAdmin, async (req, res) => {
  const parsed = employeeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const { companyId, ...data } = parsed.data;

  const existing = await prisma.employee.findUnique({ where: { employeeCode: data.employeeCode } });
  if (existing) return res.status(409).json({ error: "Employee code already exists" });

  let validatedCompanyId: string | null;
  try {
    validatedCompanyId = await validateCompanyId(companyId);
  } catch {
    return res.status(400).json({ error: "Unknown or inactive company" });
  }

  const employee = await prisma.employee.create({
    data: {
      ...data,
      companyId: validatedCompanyId,
      dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth) : null,
      dateHired: data.dateHired ? new Date(data.dateHired) : null,
    },
  });

  await writeAudit({ req, userId: req.currentUser!.id, action: "CREATE_EMPLOYEE", entityType: "Employee", entityId: employee.id, employeeId: employee.id });

  res.status(201).json(employee);
});

// employeeCode is the permanent key linking every other record to this
// employee — the edit endpoint never accepts it, so it can never drift
// even if a client sends it (it's simply not part of this schema).
//
// Unlike the create schema, every optional field here also accepts `null`:
// an edit form legitimately needs to let a nurse/admin clear a field back
// to blank, and the client sends `null` (not an omitted key) to mean that.
const nullableString = () => z.string().nullable().optional();
const employeeUpdateSchema = z.object({
  lastName: z.string().min(1).optional(),
  firstName: z.string().min(1).optional(),
  middleName: nullableString(),
  suffix: nullableString(),
  dateOfBirth: nullableString(),
  sex: z.enum(["MALE", "FEMALE"]).nullable().optional(),
  civilStatus: nullableString(),
  bloodType: nullableString(),
  religion: nullableString(),
  companyId: z.string().uuid().nullable().optional(),
  department: nullableString(),
  position: nullableString(),
  employmentStatus: nullableString(),
  dateHired: nullableString(),
  mobileNumber: nullableString(),
  address: nullableString(),
  emergencyContactName: nullableString(),
  emergencyContactRelation: nullableString(),
  emergencyContactNumber: nullableString(),
  knownAllergies: nullableString(),
  chronicConditions: nullableString(),
});

employeesRouter.patch("/:id", requireNurseOrAdmin, async (req, res) => {
  const parsed = employeeUpdateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const { companyId, ...data } = parsed.data;

  const target = await prisma.employee.findUnique({ where: { id: req.params.id } });
  if (!target) return res.status(404).json({ error: "Employee not found" });

  let validatedCompanyId: string | null | undefined;
  try {
    validatedCompanyId = companyId === undefined ? undefined : await validateCompanyId(companyId);
  } catch {
    return res.status(400).json({ error: "Unknown or inactive company" });
  }

  // Full before/after diff for the audit trail — only fields actually
  // present in this request, so unrelated fields don't clutter the record.
  const before: Record<string, unknown> = {};
  const after: Record<string, unknown> = {};
  for (const key of Object.keys(data) as (keyof typeof data)[]) {
    before[key] = (target as unknown as Record<string, unknown>)[key];
    after[key] = data[key];
  }
  if (validatedCompanyId !== undefined) {
    before.companyId = target.companyId;
    after.companyId = validatedCompanyId;
  }

  // Distinguish "field not sent" (undefined -> leave column untouched) from
  // "field sent blank/null" (-> actually clear the column to NULL) — a plain
  // `value ? new Date(value) : undefined` would silently ignore an
  // intentional clear, since falsy and "not sent" would look the same.
  const employee = await prisma.employee.update({
    where: { id: target.id },
    data: {
      ...data,
      companyId: validatedCompanyId,
      dateOfBirth: data.dateOfBirth === undefined ? undefined : (data.dateOfBirth ? new Date(data.dateOfBirth) : null),
      dateHired: data.dateHired === undefined ? undefined : (data.dateHired ? new Date(data.dateHired) : null),
    },
  });

  await writeAudit({
    req, userId: req.currentUser!.id, action: "UPDATE_EMPLOYEE",
    entityType: "Employee", entityId: employee.id, employeeId: employee.id,
    details: { before, after },
  });

  res.json(employee);
});

// ── Archive / restore (soft delete) ────────────────────────────────────
// Archiving never deletes the row — clinical history, notes, documents,
// and the audit trail all reference employeeId and must stay intact and
// recoverable. isActive:false just excludes the record from default
// search/list views until a nurse/admin restores it.
const archiveSchema = z.object({ reason: z.string().optional() });

employeesRouter.post("/:id/archive", requireNurseOrAdmin, async (req, res) => {
  const parsed = archiveSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const target = await prisma.employee.findUnique({ where: { id: req.params.id } });
  if (!target) return res.status(404).json({ error: "Employee not found" });
  if (!target.isActive) return res.status(400).json({ error: "Employee is already archived" });

  const employee = await prisma.employee.update({ where: { id: target.id }, data: { isActive: false } });

  await writeAudit({
    req, userId: req.currentUser!.id, action: "ARCHIVE_EMPLOYEE",
    entityType: "Employee", entityId: employee.id, employeeId: employee.id,
    details: { reason: parsed.data.reason },
  });

  res.json(employee);
});

employeesRouter.post("/:id/restore", requireNurseOrAdmin, async (req, res) => {
  const target = await prisma.employee.findUnique({ where: { id: req.params.id } });
  if (!target) return res.status(404).json({ error: "Employee not found" });
  if (target.isActive) return res.status(400).json({ error: "Employee is not archived" });

  const employee = await prisma.employee.update({ where: { id: target.id }, data: { isActive: true } });

  await writeAudit({
    req, userId: req.currentUser!.id, action: "RESTORE_EMPLOYEE",
    entityType: "Employee", entityId: employee.id, employeeId: employee.id,
  });

  res.json(employee);
});

// ── Permanent delete (admin-only, genuine mistakes only) ────────────────
// Unlike archive, this physically removes the row — reserved for correcting
// bad data entry (duplicate/mis-created records), never for real clinical
// history. The DB schema itself backstops this: VitalsRecord, ClinicalNote,
// MedicationLog, MedicalDocument, and AnnualPhysicalExam all reference
// employeeId with ON DELETE RESTRICT, so a delete would fail at the
// database level anyway if any exist — this check just turns that into a
// clear 409 instead of a raw constraint error, and covers all of them (the
// requesting feature named notes/medications/APE as examples of "clinical
// history", but documents and vitals are exactly the same kind of real
// medical data and must block a hard delete too).
const deleteConfirmSchema = z.object({ confirmText: z.string().min(1) });

employeesRouter.delete("/:id", requireRole("ADMIN"), async (req, res) => {
  const parsed = deleteConfirmSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Type the employee's name or code to confirm deletion" });

  const target = await prisma.employee.findUnique({ where: { id: req.params.id } });
  if (!target) return res.status(404).json({ error: "Employee not found" });

  const confirmText = parsed.data.confirmText.trim().toLowerCase();
  const validConfirmations = new Set([
    target.employeeCode.toLowerCase(),
    `${target.lastName}, ${target.firstName}`.toLowerCase(),
    `${target.firstName} ${target.lastName}`.toLowerCase(),
  ]);
  if (!validConfirmations.has(confirmText)) {
    return res.status(400).json({ error: "That doesn't match this employee's name or code — deletion cancelled" });
  }

  const [noteCount, medicationCount, apeCount, documentCount, vitalsCount] = await Promise.all([
    prisma.clinicalNote.count({ where: { employeeId: target.id } }),
    prisma.medicationLog.count({ where: { employeeId: target.id } }),
    prisma.annualPhysicalExam.count({ where: { employeeId: target.id } }),
    prisma.medicalDocument.count({ where: { employeeId: target.id } }),
    prisma.vitalsRecord.count({ where: { employeeId: target.id } }),
  ]);
  const historyCounts = { noteCount, medicationCount, apeCount, documentCount, vitalsCount };
  const hasHistory = Object.values(historyCounts).some((n) => n > 0);

  if (hasHistory) {
    // Employee row still exists at this point, so employeeId is safe to set.
    await writeAudit({
      req, userId: req.currentUser!.id, action: "DELETE_EMPLOYEE",
      entityType: "Employee", entityId: target.id, employeeId: target.id,
      details: { outcome: "blocked_has_clinical_history", employeeCode: target.employeeCode, ...historyCounts },
    });
    return res.status(409).json({
      error: "This employee has clinical notes, medications, documents, vitals, or APE records attached — archive instead of permanently deleting, to avoid losing real medical data.",
    });
  }

  await prisma.employee.delete({ where: { id: target.id } });

  // The employee row is gone now, so this entry must NOT set employeeId
  // (the FK would either reject it or, per schema, SET NULL anyway) —
  // identifying details are captured in the JSON payload instead.
  await writeAudit({
    req, userId: req.currentUser!.id, action: "DELETE_EMPLOYEE",
    entityType: "Employee", entityId: target.id,
    details: { outcome: "deleted", employeeCode: target.employeeCode, fullName: `${target.lastName}, ${target.firstName}` },
  });

  res.status(204).send();
});

// ── Profile (header + overview timeline) ───────────────────────────────
employeesRouter.get("/:id", async (req, res) => {
  const employee = await prisma.employee.findUnique({
    where: { id: req.params.id },
    include: { company: { select: { id: true, name: true } } },
  });
  if (!employee) return res.status(404).json({ error: "Employee not found" });

  // Merged per-field across history, not just the newest row - see
  // mergeLatestVitals's comment for why: a Weight-only check-in must not
  // make an earlier Blood Pressure reading disappear from the header.
  const vitalsHistory = await prisma.vitalsRecord.findMany({
    where: { employeeId: employee.id },
    orderBy: { recordedAt: "desc" },
  });
  const latestVitals = mergeLatestVitals(vitalsHistory);

  await writeAudit({ req, userId: req.currentUser!.id, action: "VIEW_RECORD", entityType: "Employee", entityId: employee.id, employeeId: employee.id });

  res.json({ ...employee, latestVitals });
});

employeesRouter.get("/:id/overview", async (req, res) => {
  const employeeId = req.params.id;
  const [notes, meds, docs, apes, drugTests, preEmployments] = await Promise.all([
    prisma.clinicalNote.findMany({ where: { employeeId }, orderBy: { visitDateTime: "desc" }, take: 10 }),
    prisma.medicationLog.findMany({ where: { employeeId }, orderBy: { dispensedAt: "desc" }, take: 10, include: { dispensedBy: { select: { fullName: true } } } }),
    prisma.medicalDocument.findMany({ where: { employeeId }, orderBy: { createdAt: "desc" }, take: 10, include: { uploadedBy: { select: { fullName: true } } } }),
    prisma.annualPhysicalExam.findMany({ where: { employeeId }, orderBy: { examYear: "desc" }, take: 3 }),
    prisma.drugTestResult.findMany({ where: { employeeId }, orderBy: { testDate: "desc" }, take: 3 }),
    prisma.preEmploymentExam.findMany({ where: { employeeId }, orderBy: { createdAt: "desc" }, take: 3 }),
  ]);

  // Each entry carries a `tab` so the client can navigate straight to the
  // record it summarizes (Overview -> the right sub-tab, focused on this id)
  // instead of just showing a date with nothing to click through to.
  const timeline = [
    ...notes.map((n) => ({
      type: "NOTE",
      date: n.visitDateTime,
      label: `${n.noteType.charAt(0)}${n.noteType.slice(1).toLowerCase()}'s note by ${n.authorNameSnapshot}${n.chiefComplaint ? ` — ${n.chiefComplaint}` : ""}${n.status === "VOIDED" ? " (voided)" : ""}`,
      id: n.id,
      tab: n.noteType.toLowerCase(),
    })),
    ...meds.map((m) => ({
      type: "MEDICATION",
      date: m.dispensedAt,
      label: `Dispensed ${m.drugName}${m.strength ? ` ${m.strength}` : ""} by ${m.dispensedBy.fullName}`,
      id: m.id,
      tab: "medications",
    })),
    ...docs.map((d) => ({
      type: "DOCUMENT",
      date: d.createdAt,
      label: `${d.category.replace(/_/g, " ")}: ${d.title} — uploaded by ${d.uploadedBy.fullName}`,
      id: d.id,
      tab: "documents",
    })),
    ...apes.map((a) => ({
      type: "APE",
      date: a.examDate ?? new Date(a.examYear, 0, 1),
      label: `Annual Physical Exam ${a.examYear}${a.fitnessClassification ? ` — ${a.fitnessClassification.replace(/_/g, " ")}` : ""}`,
      id: a.id,
      tab: "ape",
    })),
    ...drugTests.map((t) => ({
      type: "DRUG_TEST",
      date: t.testDate,
      label: `Drug test result — ${t.result}`,
      id: t.id,
      tab: "drugtest",
    })),
    ...preEmployments.map((p) => ({
      type: "PRE_EMPLOYMENT",
      date: p.examDate ?? p.createdAt,
      label: `Pre-employment exam${p.fitnessClassification ? ` — ${p.fitnessClassification.replace(/_/g, " ")}` : ""}`,
      id: p.id,
      tab: "preemployment",
    })),
  ]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 10);

  res.json({ timeline });
});

// ── Combined medical record export (Doctor's/Nurse's/Dentist's Notes,
// Medications, APE, Vitals) ────────────────────────────────────────────
// One employee, any subset of categories the caller selects, one combined
// PDF, optional date range (unlike the clinic-wide report in
// routes/notes.ts, a range is not required here — omitting it exports full
// history). Shares the section-based PDF builder with the clinic-wide
// report so both stay visually and structurally consistent.
const EXPORT_CATEGORIES = ["DOCTOR", "NURSE", "DENTIST", "MEDICATIONS", "APE", "VITALS", "DRUG_TEST", "PRE_EMPLOYMENT"] as const;
type ExportCategory = (typeof EXPORT_CATEGORIES)[number];
const EXPORT_CATEGORY_LABEL: Record<ExportCategory, string> = {
  DOCTOR: "Doctor's Notes", NURSE: "Nurse's Notes", DENTIST: "Dentist's Notes",
  MEDICATIONS: "Medications", APE: "Annual Physical Exams", VITALS: "Vitals",
  DRUG_TEST: "Drug Test Results", PRE_EMPLOYMENT: "Pre-Employment Exams",
};

const exportQuerySchema = z.object({
  categories: z.string().min(1),
  from: z.string().optional(),
  to: z.string().optional(),
});

employeesRouter.get("/:id/export", async (req, res) => {
  const parsed = exportQuerySchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: "At least one category is required" });

  const requested = parsed.data.categories.split(",").map((c) => c.trim().toUpperCase()).filter(Boolean);
  const categories = requested.filter((c): c is ExportCategory => (EXPORT_CATEGORIES as readonly string[]).includes(c));
  if (categories.length === 0) return res.status(400).json({ error: "At least one valid category is required" });

  const employee = await prisma.employee.findUnique({
    where: { id: req.params.id },
    include: { company: { select: { name: true } } },
  });
  if (!employee) return res.status(404).json({ error: "Employee not found" });

  let fromDate: Date | null = null;
  let toDate: Date | null = null;
  if (parsed.data.from) {
    fromDate = new Date(parsed.data.from);
    if (Number.isNaN(fromDate.getTime())) return res.status(400).json({ error: "Invalid from date" });
  }
  if (parsed.data.to) {
    toDate = new Date(parsed.data.to);
    if (Number.isNaN(toDate.getTime())) return res.status(400).json({ error: "Invalid to date" });
    toDate.setHours(23, 59, 59, 999);
  }
  const dateRange = (fromDate || toDate) ? { ...(fromDate ? { gte: fromDate } : {}), ...(toDate ? { lte: toDate } : {}) } : undefined;

  const employeeName = `${employee.lastName}, ${employee.firstName}`;
  const sections: ReportSection[] = [];
  const noteTypesRequested = categories.filter((c): c is "DOCTOR" | "NURSE" | "DENTIST" => c === "DOCTOR" || c === "NURSE" || c === "DENTIST");

  let vitalsInRange: Awaited<ReturnType<typeof prisma.vitalsRecord.findMany>> = [];
  if (noteTypesRequested.length > 0) {
    vitalsInRange = await prisma.vitalsRecord.findMany({
      where: { employeeId: employee.id, ...(dateRange ? { recordedAt: dateRange } : {}) },
    });
  }

  for (const nt of noteTypesRequested) {
    const notes = await prisma.clinicalNote.findMany({
      where: { employeeId: employee.id, noteType: nt, ...(dateRange ? { visitDateTime: dateRange } : {}) },
      orderBy: { visitDateTime: "asc" },
    });
    sections.push({
      kind: "NOTES",
      noteType: nt,
      notes: notes.map((n): ReportNote => ({
        noteType: n.noteType,
        visitDateTime: n.visitDateTime,
        employeeCode: employee.employeeCode,
        employeeName,
        department: employee.department,
        companyName: employee.company?.name ?? null,
        authorName: n.authorNameSnapshot,
        chiefComplaint: n.chiefComplaint,
        assessment: n.assessment,
        diagnosis: n.diagnosis,
        treatment: n.treatment,
        recommendation: n.recommendation,
        nursingDiagnosis: n.nursingDiagnosis,
        plan: n.plan,
        intervention: n.intervention,
        evaluation: n.evaluation,
        disposition: n.disposition,
        isWorkRelated: n.isWorkRelated,
        status: n.status,
        vitals: pickVitalsForNote(vitalsInRange, employee.id, n.visitDateTime),
      })),
    });
  }

  if (categories.includes("MEDICATIONS")) {
    const meds = await prisma.medicationLog.findMany({
      where: { employeeId: employee.id, ...(dateRange ? { dispensedAt: dateRange } : {}) },
      orderBy: { dispensedAt: "asc" },
      include: { dispensedBy: { select: { fullName: true } } },
    });
    const medications: ReportMedication[] = meds.map((m) => ({
      drugName: m.drugName, strength: m.strength, dosageForm: m.dosageForm, route: m.route,
      frequency: m.frequency, quantityDispensed: m.quantityDispensed, dispensedAt: m.dispensedAt,
      dispensedByName: m.dispensedBy.fullName, employeeCode: employee.employeeCode, employeeName, department: employee.department,
    }));
    sections.push({ kind: "MEDICATIONS", medications });
  }

  if (categories.includes("APE")) {
    const apes = await prisma.annualPhysicalExam.findMany({
      where: { employeeId: employee.id, ...(dateRange ? { examDate: dateRange } : {}) },
      orderBy: { examYear: "asc" },
    });
    const reportApes: ReportApe[] = apes.map((a) => ({
      employeeCode: employee.employeeCode, employeeName, department: employee.department,
      examYear: a.examYear, examDate: a.examDate, provider: a.provider, heightCm: a.heightCm, weightKg: a.weightKg, bmi: a.bmi,
      bloodPressure: a.bloodPressure, visionOD: a.visionOD, visionOS: a.visionOS, hearing: a.hearing, cbcResult: a.cbcResult,
      urinalysisResult: a.urinalysisResult, fecalysisResult: a.fecalysisResult, chestXrayResult: a.chestXrayResult,
      ecgResult: a.ecgResult, drugTestResult: a.drugTestResult, otherFindings: a.otherFindings,
      significantFindings: a.significantFindings, recommendations: a.recommendations, fitnessClassification: a.fitnessClassification,
    }));
    sections.push({ kind: "APE", apes: reportApes });
  }

  if (categories.includes("VITALS")) {
    const vitals = await prisma.vitalsRecord.findMany({
      where: { employeeId: employee.id, ...(dateRange ? { recordedAt: dateRange } : {}) },
      orderBy: { recordedAt: "asc" },
      include: { recordedBy: { select: { fullName: true } } },
    });
    const reportVitals: ReportVitalsRecord[] = vitals.map((v) => ({
      employeeCode: employee.employeeCode, employeeName, department: employee.department,
      recordedAt: v.recordedAt, recordedByName: v.recordedBy.fullName, heightCm: v.heightCm, weightKg: v.weightKg, bmi: v.bmi,
      bmiCategory: v.bmiCategory, systolic: v.systolic, diastolic: v.diastolic, pulseRate: v.pulseRate,
      respiratoryRate: v.respiratoryRate, temperatureC: v.temperatureC, oxygenSaturation: v.oxygenSaturation, remarks: v.remarks,
    }));
    sections.push({ kind: "VITALS", vitals: reportVitals });
  }

  if (categories.includes("DRUG_TEST")) {
    const tests = await prisma.drugTestResult.findMany({
      where: { employeeId: employee.id, ...(dateRange ? { testDate: dateRange } : {}) },
      orderBy: { testDate: "asc" },
    });
    const reportTests: ReportDrugTest[] = tests.map((t) => ({
      employeeCode: employee.employeeCode, employeeName, department: employee.department,
      testDate: t.testDate, result: t.result, specimenType: t.specimenType, labName: t.labName, remarks: t.remarks,
    }));
    sections.push({ kind: "DRUG_TEST", drugTests: reportTests });
  }

  if (categories.includes("PRE_EMPLOYMENT")) {
    const exams = await prisma.preEmploymentExam.findMany({
      where: { employeeId: employee.id, ...(dateRange ? { examDate: dateRange } : {}) },
      orderBy: { createdAt: "asc" },
    });
    const reportExams: ReportPreEmployment[] = exams.map((p) => ({
      employeeCode: employee.employeeCode, employeeName, department: employee.department,
      examDate: p.examDate, provider: p.provider, heightCm: p.heightCm, weightKg: p.weightKg, bmi: p.bmi,
      bloodPressure: p.bloodPressure, visionOD: p.visionOD, visionOS: p.visionOS, hearing: p.hearing,
      cbcResult: p.cbcResult, urinalysisResult: p.urinalysisResult, fecalysisResult: p.fecalysisResult,
      chestXrayResult: p.chestXrayResult, ecgResult: p.ecgResult, drugTestResult: p.drugTestResult,
      pregnancyTestResult: p.pregnancyTestResult, medicalHistory: p.medicalHistory, physicalExamFindings: p.physicalExamFindings,
      otherFindings: p.otherFindings, significantFindings: p.significantFindings, recommendations: p.recommendations,
      fitnessClassification: p.fitnessClassification,
    }));
    sections.push({ kind: "PRE_EMPLOYMENT", preEmployments: reportExams });
  }

  await writeAudit({
    req, userId: req.currentUser!.id, action: "DOWNLOAD_DOC", entityType: "EmployeeExport", entityId: employee.id, employeeId: employee.id,
    details: { categories, from: parsed.data.from || null, to: parsed.data.to || null },
  });

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${employee.employeeCode}-export-${new Date().toISOString().slice(0, 10)}.pdf"`);
  const appName = await getAppName();
  const doc = buildReportPdf({
    appName,
    title: `${employeeName} — Medical Record Export`,
    subtitleLines: [
      `Employee: ${employeeName} (#${employee.employeeCode})`,
      `Period: ${parsed.data.from || "Full history"} to ${parsed.data.to || "present"}`,
      `Categories: ${categories.map((c) => EXPORT_CATEGORY_LABEL[c]).join(", ")}`,
      `Generated by ${req.currentUser!.fullName} on ${new Date().toLocaleString()}`,
    ],
    sections,
  });
  doc.pipe(res);
});

// ── Photo (upload file or webcam capture) ──────────────────────────────
employeesRouter.post("/:id/photo", requireNurseOrAdmin, upload.single("photo"), async (req, res) => {
  const employee = await prisma.employee.findUnique({ where: { id: req.params.id } });
  if (!employee) return res.status(404).json({ error: "Employee not found" });
  if (!req.file) return res.status(400).json({ error: "No photo provided" });

  if (!isAllowedUpload(req.file.buffer, "jpg")) {
    return res.status(400).json({ error: "File does not appear to be a valid image" });
  }

  const dir = employeeDir(employee.employeeCode, "photo");
  const id = uuid();
  const fullPath = path.join(dir, `${id}.jpg`);
  const thumbPath = path.join(dir, `${id}-thumb.jpg`);

  await sharp(req.file.buffer).resize(600, 600, { fit: "cover" }).jpeg({ quality: 85 }).toFile(fullPath);
  await sharp(req.file.buffer).resize(120, 120, { fit: "cover" }).jpeg({ quality: 85 }).toFile(thumbPath);

  if (employee.photoPath) fs.rm(employee.photoPath, { force: true }, () => {});
  if (employee.photoThumbPath) fs.rm(employee.photoThumbPath, { force: true }, () => {});

  await prisma.employee.update({
    where: { id: employee.id },
    data: { photoPath: fullPath, photoThumbPath: thumbPath },
  });

  await writeAudit({ req, userId: req.currentUser!.id, action: "UPDATE_EMPLOYEE", entityType: "Employee", entityId: employee.id, employeeId: employee.id, details: { photoUpdated: true } });

  res.json({ ok: true });
});

employeesRouter.get("/:id/photo/:size", async (req, res) => {
  const employee = await prisma.employee.findUnique({ where: { id: req.params.id } });
  if (!employee) return res.status(404).json({ error: "Employee not found" });
  const filePath = req.params.size === "thumb" ? employee.photoThumbPath : employee.photoPath;
  if (!filePath || !fs.existsSync(filePath)) return res.status(404).json({ error: "No photo" });
  res.sendFile(filePath);
});
