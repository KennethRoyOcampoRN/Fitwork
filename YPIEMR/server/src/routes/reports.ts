import { Router } from "express";
import { z } from "zod";
import { Paragraph, Table } from "docx";
import { prisma } from "../lib/prisma";
import { requireAuth, requireRole } from "../middleware/auth";
import { writeAudit } from "../services/audit";
import { getAppBranding, docHeader, sectionHeading, subHeading, emptyMessage, dataTable, sendDocx } from "../services/reportDocx";
import { createReportWorkbook, addDataSheet, sendXlsx } from "../services/reportExcel";
import { resolveReportScope, assertScopeHasEmployees, ScopeError, sanitizeForFilename } from "../services/reportScope";
import { ILLNESS_CATEGORIES } from "../services/illnessCategories";
import { buildReportPdf, pickVitalsForNote, ReportSection, ReportNote, ReportMedication, ReportApe, ReportVitalsRecord, ReportDrugTest, ReportPreEmployment } from "../services/reportPdf";
import { getAppName } from "../services/appSettings";

export const reportsRouter = Router();
reportsRouter.use(requireAuth);

// Every report in this file is a company-wide/multi-employee reporting tool
// (as opposed to a single employee's own chart), so Nurse and Admin only —
// same convention as employees.ts's requireNurseOrAdmin.
const requireNurseOrAdmin = requireRole("NURSE", "ADMIN");

function handleScopeError(res: import("express").Response, err: unknown): boolean {
  if (err instanceof ScopeError) {
    res.status(400).json({ error: err.message });
    return true;
  }
  return false;
}

// ── Distinct departments (for report filter dropdowns) ─────────────────
reportsRouter.get("/departments", async (_req, res) => {
  const rows = await prisma.employee.findMany({
    where: { department: { not: null } },
    distinct: ["department"],
    select: { department: true },
    orderBy: { department: "asc" },
  });
  res.json(rows.map((r) => r.department).filter((d): d is string => !!d));
});

// ── APE Summary report (Word + Excel, year-over-year) ───────────────────
// Split from the old single combined APE report into two independent
// reports (Summary, Detailed) per an explicit product decision, applied
// consistently to Dental below for the same reason.
const FITNESS_CLASSES = ["CLASS_A", "CLASS_B", "CLASS_C", "CLASS_D", "PENDING"] as const;

const apeReportSchema = z.object({
  examYear: z.coerce.number().int().min(2000).max(2100),
  department: z.string().optional(),
  compareYears: z.coerce.number().int().min(0).max(5).default(0),
  scope: z.enum(["primary", "nonPrimary", "company", "all"]).default("primary"),
  companyId: z.string().uuid().optional(),
});

async function fetchApeYear(examYear: number, employeeWhere: Record<string, unknown>, department?: string) {
  return prisma.annualPhysicalExam.findMany({
    where: {
      examYear,
      employee: { ...(department ? { department } : {}), ...employeeWhere },
    },
    orderBy: [{ employee: { lastName: "asc" } }],
    include: { employee: { select: { employeeCode: true, firstName: true, lastName: true, department: true } } },
  });
}

function apeSummaryRows(apes: Awaited<ReturnType<typeof fetchApeYear>>, year: number): (string | number)[][] {
  const byDept = new Map<string, Record<string, number>>();
  for (const a of apes) {
    const dept = a.employee.department || "(No department)";
    if (!byDept.has(dept)) byDept.set(dept, Object.fromEntries(FITNESS_CLASSES.map((c) => [c, 0])));
    const counts = byDept.get(dept)!;
    const cls = a.fitnessClassification && (FITNESS_CLASSES as readonly string[]).includes(a.fitnessClassification) ? a.fitnessClassification : "PENDING";
    counts[cls] = (counts[cls] || 0) + 1;
  }
  return Array.from(byDept.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([dept, counts]) => {
      const total = FITNESS_CLASSES.reduce((sum, c) => sum + counts[c], 0);
      return [year, dept, ...FITNESS_CLASSES.map((c) => counts[c]), total];
    });
}

function apeSummaryTable(apes: Awaited<ReturnType<typeof fetchApeYear>>): Table {
  const rows = apeSummaryRows(apes, 0).map((r) => r.slice(1).map(String)); // drop the Excel-only Year column for the Word table
  return dataTable(["Department", "Class A", "Class B", "Class C", "Class D", "Pending", "Total"], rows);
}

function apeDetailRows(apes: Awaited<ReturnType<typeof fetchApeYear>>, year: number): (string | number)[][] {
  return apes.map((a) => [
    year,
    a.employee.employeeCode,
    `${a.employee.lastName}, ${a.employee.firstName}`,
    a.employee.department || "—",
    a.examDate ? new Date(a.examDate).toLocaleDateString() : "—",
    a.heightCm ?? "—",
    a.weightKg ?? "—",
    a.bmi ?? "—",
    a.bloodPressure || "—",
    a.fitnessClassification ? a.fitnessClassification.replace(/_/g, " ") : "—",
    a.significantFindings || "—",
  ]);
}

function apeDetailTable(apes: Awaited<ReturnType<typeof fetchApeYear>>): Table {
  const rows = apeDetailRows(apes, 0).map((r) => r.slice(1).map(String));
  return dataTable(
    ["Code", "Name", "Department", "Exam Date", "Ht (cm)", "Wt (kg)", "BMI", "BP", "Fitness Class", "Significant Findings"],
    rows,
  );
}

function apeYoyLine(years: number[], compareYears: number, yearsWithData: Set<number>): string {
  if (compareYears === 0) return `Exam year: ${years[0]}`;
  const missing = years.slice(1).filter((y) => !yearsWithData.has(y));
  const base = `Exam year: ${years[0]} (compared against ${compareYears} prior year${compareYears > 1 ? "s" : ""})`;
  if (missing.length === 0) return base;
  return `${base} — no data on file for ${missing.join(", ")} under this scope; those years are omitted below`;
}

reportsRouter.get("/ape-summary/word", requireNurseOrAdmin, async (req, res) => {
  const parsed = apeReportSchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const { examYear, department, compareYears } = parsed.data;

  try {
    const resolved = await resolveReportScope(req.query);
    await assertScopeHasEmployees({ ...resolved.employeeWhere, ...(department ? { department } : {}) });

    const years = Array.from({ length: compareYears + 1 }, (_, i) => examYear - i);
    const yearData = await Promise.all(years.map((y) => fetchApeYear(y, resolved.employeeWhere, department)));
    const yearsWithData = new Set(years.filter((_, i) => yearData[i].length > 0));
    const branding = await getAppBranding();

    const children: (Paragraph | Table)[] = docHeader(branding, "Annual Physical Exam — Summary Report", [
      apeYoyLine(years, compareYears, yearsWithData),
      `Scope: ${resolved.scopeLabel}`,
      `Department: ${department || "All departments"}`,
      `Generated by ${req.currentUser!.fullName} on ${new Date().toLocaleString()}`,
    ]);

    let totalRecords = 0;
    years.forEach((year, i) => {
      const apes = yearData[i];
      totalRecords += apes.length;
      children.push(subHeading(`Exam Year ${year}`));
      children.push(apes.length === 0 ? emptyMessage("No APE records for this year under this scope.") : apeSummaryTable(apes));
    });

    await writeAudit({
      req, userId: req.currentUser!.id, action: "DOWNLOAD_DOC", entityType: "ApeSummaryReport",
      details: { examYear, department, compareYears, scope: resolved.scopeLabel, recordCount: totalRecords },
    });

    await sendDocx(res, `ape-summary-${examYear}-${resolved.filenameToken}.docx`, children);
  } catch (err) {
    if (!handleScopeError(res, err)) throw err;
  }
});

reportsRouter.get("/ape-summary/excel", requireNurseOrAdmin, async (req, res) => {
  const parsed = apeReportSchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const { examYear, department, compareYears } = parsed.data;

  try {
    const resolved = await resolveReportScope(req.query);
    await assertScopeHasEmployees({ ...resolved.employeeWhere, ...(department ? { department } : {}) });

    const years = Array.from({ length: compareYears + 1 }, (_, i) => examYear - i);
    const yearData = await Promise.all(years.map((y) => fetchApeYear(y, resolved.employeeWhere, department)));
    const rows = years.flatMap((year, i) => apeSummaryRows(yearData[i], year));

    const workbook = createReportWorkbook({
      reportType: "APE Summary", scopeLabel: resolved.scopeLabel,
      period: years.length > 1 ? `${years[years.length - 1]}–${years[0]}` : String(examYear),
      generatedBy: req.currentUser!.fullName, generatedAt: new Date(),
    });
    addDataSheet(workbook, "APE Summary", ["Year", "Department", "Class A", "Class B", "Class C", "Class D", "Pending", "Total"], rows);

    await writeAudit({ req, userId: req.currentUser!.id, action: "DOWNLOAD_DOC", entityType: "ApeSummaryReport", details: { examYear, department, compareYears, scope: resolved.scopeLabel, format: "xlsx" } });
    await sendXlsx(res, `ape-summary-${examYear}-${resolved.filenameToken}.xlsx`, workbook);
  } catch (err) {
    if (!handleScopeError(res, err)) throw err;
  }
});

// ── APE Detailed report (Word + Excel, year-over-year) ──────────────────
reportsRouter.get("/ape-detailed/word", requireNurseOrAdmin, async (req, res) => {
  const parsed = apeReportSchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const { examYear, department, compareYears } = parsed.data;

  try {
    const resolved = await resolveReportScope(req.query);
    await assertScopeHasEmployees({ ...resolved.employeeWhere, ...(department ? { department } : {}) });

    const years = Array.from({ length: compareYears + 1 }, (_, i) => examYear - i);
    const yearData = await Promise.all(years.map((y) => fetchApeYear(y, resolved.employeeWhere, department)));
    const yearsWithData = new Set(years.filter((_, i) => yearData[i].length > 0));
    const branding = await getAppBranding();

    const children: (Paragraph | Table)[] = docHeader(branding, "Annual Physical Exam — Detailed Report", [
      apeYoyLine(years, compareYears, yearsWithData),
      `Scope: ${resolved.scopeLabel}`,
      `Department: ${department || "All departments"}`,
      `Generated by ${req.currentUser!.fullName} on ${new Date().toLocaleString()}`,
    ]);

    let totalRecords = 0;
    years.forEach((year, i) => {
      const apes = yearData[i];
      totalRecords += apes.length;
      children.push(subHeading(`Exam Year ${year}`));
      children.push(apes.length === 0 ? emptyMessage("No APE records for this year under this scope.") : apeDetailTable(apes));
    });

    await writeAudit({
      req, userId: req.currentUser!.id, action: "DOWNLOAD_DOC", entityType: "ApeDetailedReport",
      details: { examYear, department, compareYears, scope: resolved.scopeLabel, recordCount: totalRecords },
    });

    await sendDocx(res, `ape-detailed-${examYear}-${resolved.filenameToken}.docx`, children);
  } catch (err) {
    if (!handleScopeError(res, err)) throw err;
  }
});

reportsRouter.get("/ape-detailed/excel", requireNurseOrAdmin, async (req, res) => {
  const parsed = apeReportSchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const { examYear, department, compareYears } = parsed.data;

  try {
    const resolved = await resolveReportScope(req.query);
    await assertScopeHasEmployees({ ...resolved.employeeWhere, ...(department ? { department } : {}) });

    const years = Array.from({ length: compareYears + 1 }, (_, i) => examYear - i);
    const yearData = await Promise.all(years.map((y) => fetchApeYear(y, resolved.employeeWhere, department)));
    const rows = years.flatMap((year, i) => apeDetailRows(yearData[i], year));

    const workbook = createReportWorkbook({
      reportType: "APE Detailed", scopeLabel: resolved.scopeLabel,
      period: years.length > 1 ? `${years[years.length - 1]}–${years[0]}` : String(examYear),
      generatedBy: req.currentUser!.fullName, generatedAt: new Date(),
    });
    addDataSheet(workbook, "APE Detailed", ["Year", "Code", "Name", "Department", "Exam Date", "Ht (cm)", "Wt (kg)", "BMI", "BP", "Fitness Class", "Significant Findings"], rows);

    await writeAudit({ req, userId: req.currentUser!.id, action: "DOWNLOAD_DOC", entityType: "ApeDetailedReport", details: { examYear, department, compareYears, scope: resolved.scopeLabel, format: "xlsx" } });
    await sendXlsx(res, `ape-detailed-${examYear}-${resolved.filenameToken}.xlsx`, workbook);
  } catch (err) {
    if (!handleScopeError(res, err)) throw err;
  }
});

// ── Dental Summary & Detailed reports (Word + Excel, year-over-year) ────
// Sourced from dentist visit notes (ClinicalNote noteType=DENTIST), which
// have a real date dimension for year-over-year comparison — ToothRecord
// (the tooth chart) is current-state-only with no history, so it's appended
// to the Detailed report only (per-employee granularity fits it better than
// the aggregate Summary report).
const DISPOSITIONS = ["RETURN_TO_WORK", "LIGHT_DUTY", "SENT_HOME", "REFERRED", "OBSERVATION"] as const;

const dentalReportSchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
  department: z.string().optional(),
  compareYears: z.coerce.number().int().min(0).max(5).default(0),
  scope: z.enum(["primary", "nonPrimary", "company", "all"]).default("primary"),
  companyId: z.string().uuid().optional(),
});

async function fetchDentalYear(year: number, employeeWhere: Record<string, unknown>, department?: string) {
  const from = new Date(year, 0, 1);
  const to = new Date(year, 11, 31, 23, 59, 59, 999);
  return prisma.clinicalNote.findMany({
    where: {
      noteType: "DENTIST",
      visitDateTime: { gte: from, lte: to },
      employee: { ...(department ? { department } : {}), ...employeeWhere },
    },
    orderBy: [{ visitDateTime: "asc" }],
    include: { employee: { select: { employeeCode: true, firstName: true, lastName: true, department: true } } },
  });
}

function dentalSummaryRows(notes: Awaited<ReturnType<typeof fetchDentalYear>>, year: number): (string | number)[][] {
  const byDept = new Map<string, Record<string, number>>();
  const dispositionKeys = [...DISPOSITIONS, "UNSPECIFIED"];
  for (const n of notes) {
    const dept = n.employee.department || "(No department)";
    if (!byDept.has(dept)) byDept.set(dept, Object.fromEntries(dispositionKeys.map((c) => [c, 0])));
    const counts = byDept.get(dept)!;
    const key = n.disposition && (DISPOSITIONS as readonly string[]).includes(n.disposition) ? n.disposition : "UNSPECIFIED";
    counts[key] = (counts[key] || 0) + 1;
  }
  return Array.from(byDept.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([dept, counts]) => {
      const total = dispositionKeys.reduce((sum, c) => sum + counts[c], 0);
      return [year, dept, ...dispositionKeys.map((c) => counts[c]), total];
    });
}

function dentalSummaryTable(notes: Awaited<ReturnType<typeof fetchDentalYear>>): Table {
  const rows = dentalSummaryRows(notes, 0).map((r) => r.slice(1).map(String));
  return dataTable(["Department", ...DISPOSITIONS.map((d) => d.replace(/_/g, " ")), "Unspecified", "Total"], rows);
}

function dentalDetailRows(notes: Awaited<ReturnType<typeof fetchDentalYear>>, year: number): (string | number)[][] {
  return notes.map((n) => [
    year,
    n.employee.employeeCode,
    `${n.employee.lastName}, ${n.employee.firstName}`,
    n.employee.department || "—",
    new Date(n.visitDateTime).toLocaleDateString(),
    n.chiefComplaint || "—",
    n.diagnosis || "—",
    n.treatment || "—",
    n.disposition ? n.disposition.replace(/_/g, " ") : "—",
  ]);
}

function dentalDetailTable(notes: Awaited<ReturnType<typeof fetchDentalYear>>): Table {
  const rows = dentalDetailRows(notes, 0).map((r) => r.slice(1).map(String));
  return dataTable(
    ["Code", "Name", "Department", "Visit Date", "Chief Complaint", "Diagnosis", "Treatment", "Disposition"],
    rows,
  );
}

async function toothChartSnapshotRows(employeeWhere: Record<string, unknown>, department?: string): Promise<(string | number)[][]> {
  const employees = await prisma.employee.findMany({
    where: { isActive: true, ...(department ? { department } : {}), ...employeeWhere },
    orderBy: { lastName: "asc" },
    select: { employeeCode: true, firstName: true, lastName: true, toothRecords: { select: { status: true } } },
  });

  const TOTAL_TEETH = 32;
  return employees.map((e) => {
    const missing = e.toothRecords.filter((t) => t.status === "MISSING").length;
    const caries = e.toothRecords.filter((t) => t.status === "CARIES").length;
    const healthy = TOTAL_TEETH - missing - caries;
    return [e.employeeCode, `${e.lastName}, ${e.firstName}`, healthy, missing, caries];
  });
}

async function toothChartSnapshotTable(employeeWhere: Record<string, unknown>, department?: string): Promise<Table> {
  const rows = (await toothChartSnapshotRows(employeeWhere, department)).map((r) => r.map(String));
  return dataTable(["Code", "Name", "Healthy", "Missing", "Caries"], rows);
}

reportsRouter.get("/dental-summary/word", requireNurseOrAdmin, async (req, res) => {
  const parsed = dentalReportSchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const { year, department, compareYears } = parsed.data;

  try {
    const resolved = await resolveReportScope(req.query);
    await assertScopeHasEmployees({ ...resolved.employeeWhere, ...(department ? { department } : {}) });

    const years = Array.from({ length: compareYears + 1 }, (_, i) => year - i);
    const branding = await getAppBranding();

    const children: (Paragraph | Table)[] = docHeader(branding, "Dental Health — Summary Report", [
      `Year: ${year}${compareYears > 0 ? ` (compared against ${compareYears} prior year${compareYears > 1 ? "s" : ""})` : ""}`,
      `Scope: ${resolved.scopeLabel}`,
      `Department: ${department || "All departments"}`,
      "Year-over-year figures are sourced from dentist visit notes (dated records).",
      `Generated by ${req.currentUser!.fullName} on ${new Date().toLocaleString()}`,
    ]);

    let totalVisits = 0;
    for (const y of years) {
      const notes = await fetchDentalYear(y, resolved.employeeWhere, department);
      totalVisits += notes.length;
      children.push(subHeading(`Year ${y}`));
      children.push(notes.length === 0 ? emptyMessage("No dentist visit notes for this year under this scope.") : dentalSummaryTable(notes));
    }

    await writeAudit({
      req, userId: req.currentUser!.id, action: "DOWNLOAD_DOC", entityType: "DentalSummaryReport",
      details: { year, department, compareYears, scope: resolved.scopeLabel, visitCount: totalVisits },
    });

    await sendDocx(res, `dental-summary-${year}-${resolved.filenameToken}.docx`, children);
  } catch (err) {
    if (!handleScopeError(res, err)) throw err;
  }
});

reportsRouter.get("/dental-summary/excel", requireNurseOrAdmin, async (req, res) => {
  const parsed = dentalReportSchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const { year, department, compareYears } = parsed.data;

  try {
    const resolved = await resolveReportScope(req.query);
    await assertScopeHasEmployees({ ...resolved.employeeWhere, ...(department ? { department } : {}) });

    const years = Array.from({ length: compareYears + 1 }, (_, i) => year - i);
    const rows: (string | number)[][] = [];
    for (const y of years) rows.push(...dentalSummaryRows(await fetchDentalYear(y, resolved.employeeWhere, department), y));

    const workbook = createReportWorkbook({
      reportType: "Dental Summary", scopeLabel: resolved.scopeLabel,
      period: years.length > 1 ? `${years[years.length - 1]}–${years[0]}` : String(year),
      generatedBy: req.currentUser!.fullName, generatedAt: new Date(),
    });
    addDataSheet(workbook, "Dental Summary", ["Year", "Department", ...DISPOSITIONS.map((d) => d.replace(/_/g, " ")), "Unspecified", "Total"], rows);

    await writeAudit({ req, userId: req.currentUser!.id, action: "DOWNLOAD_DOC", entityType: "DentalSummaryReport", details: { year, department, compareYears, scope: resolved.scopeLabel, format: "xlsx" } });
    await sendXlsx(res, `dental-summary-${year}-${resolved.filenameToken}.xlsx`, workbook);
  } catch (err) {
    if (!handleScopeError(res, err)) throw err;
  }
});

reportsRouter.get("/dental-detailed/word", requireNurseOrAdmin, async (req, res) => {
  const parsed = dentalReportSchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const { year, department, compareYears } = parsed.data;

  try {
    const resolved = await resolveReportScope(req.query);
    await assertScopeHasEmployees({ ...resolved.employeeWhere, ...(department ? { department } : {}) });

    const years = Array.from({ length: compareYears + 1 }, (_, i) => year - i);
    const branding = await getAppBranding();

    const children: (Paragraph | Table)[] = docHeader(branding, "Dental Health — Detailed Report", [
      `Year: ${year}${compareYears > 0 ? ` (compared against ${compareYears} prior year${compareYears > 1 ? "s" : ""})` : ""}`,
      `Scope: ${resolved.scopeLabel}`,
      `Department: ${department || "All departments"}`,
      "Year-over-year figures are sourced from dentist visit notes (dated records); the tooth chart appendix below reflects only the CURRENT chart, with no history behind it.",
      `Generated by ${req.currentUser!.fullName} on ${new Date().toLocaleString()}`,
    ]);

    let totalVisits = 0;
    for (const y of years) {
      const notes = await fetchDentalYear(y, resolved.employeeWhere, department);
      totalVisits += notes.length;
      children.push(subHeading(`Year ${y}`));
      children.push(notes.length === 0 ? emptyMessage("No dentist visit notes for this year under this scope.") : dentalDetailTable(notes));
    }

    children.push(sectionHeading("Current Tooth Chart Snapshot (reference only, no history)"));
    children.push(await toothChartSnapshotTable(resolved.employeeWhere, department));

    await writeAudit({
      req, userId: req.currentUser!.id, action: "DOWNLOAD_DOC", entityType: "DentalDetailedReport",
      details: { year, department, compareYears, scope: resolved.scopeLabel, visitCount: totalVisits },
    });

    await sendDocx(res, `dental-detailed-${year}-${resolved.filenameToken}.docx`, children);
  } catch (err) {
    if (!handleScopeError(res, err)) throw err;
  }
});

reportsRouter.get("/dental-detailed/excel", requireNurseOrAdmin, async (req, res) => {
  const parsed = dentalReportSchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const { year, department, compareYears } = parsed.data;

  try {
    const resolved = await resolveReportScope(req.query);
    await assertScopeHasEmployees({ ...resolved.employeeWhere, ...(department ? { department } : {}) });

    const years = Array.from({ length: compareYears + 1 }, (_, i) => year - i);
    const visitRows: (string | number)[][] = [];
    for (const y of years) visitRows.push(...dentalDetailRows(await fetchDentalYear(y, resolved.employeeWhere, department), y));
    const toothRows = await toothChartSnapshotRows(resolved.employeeWhere, department);

    const workbook = createReportWorkbook({
      reportType: "Dental Detailed", scopeLabel: resolved.scopeLabel,
      period: years.length > 1 ? `${years[years.length - 1]}–${years[0]}` : String(year),
      generatedBy: req.currentUser!.fullName, generatedAt: new Date(),
    });
    // Two sheets, not one — the visit-detail rows and the tooth-chart
    // snapshot are structurally different tables (different columns
    // entirely), not just a multi-year repeat of the same shape, so they
    // don't belong crammed into a single sheet the way the year-over-year
    // Summary/Detailed data does.
    addDataSheet(workbook, "Visit Detail", ["Year", "Code", "Name", "Department", "Visit Date", "Chief Complaint", "Diagnosis", "Treatment", "Disposition"], visitRows);
    addDataSheet(workbook, "Tooth Chart Snapshot", ["Code", "Name", "Healthy", "Missing", "Caries"], toothRows);

    await writeAudit({ req, userId: req.currentUser!.id, action: "DOWNLOAD_DOC", entityType: "DentalDetailedReport", details: { year, department, compareYears, scope: resolved.scopeLabel, format: "xlsx" } });
    await sendXlsx(res, `dental-detailed-${year}-${resolved.filenameToken}.xlsx`, workbook);
  } catch (err) {
    if (!handleScopeError(res, err)) throw err;
  }
});

// ── Illness/Complaint reports (department + age) ────────────────────────
const CATEGORY_LABEL: Record<string, string> = Object.fromEntries(ILLNESS_CATEGORIES.map((c) => [c.key, c.label]));
const UNCATEGORIZED = "Uncategorized";

function parseDateRange(from: string, to: string): { fromDate: Date; toDate: Date } | null {
  const fromDate = new Date(from);
  const toDate = new Date(to);
  toDate.setHours(23, 59, 59, 999);
  if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) return null;
  return { fromDate, toDate };
}

async function fetchIllnessNotes(fromDate: Date, toDate: Date, employeeWhere: Record<string, unknown>, department?: string) {
  return prisma.clinicalNote.findMany({
    where: {
      visitDateTime: { gte: fromDate, lte: toDate },
      status: "FINAL",
      employee: { ...(department ? { department } : {}), ...employeeWhere },
    },
    select: {
      id: true, illnessCategory: true, visitDateTime: true,
      employee: { select: { department: true, dateOfBirth: true } },
    },
  });
}

const illnessByDeptSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  department: z.string().optional(),
  scope: z.enum(["primary", "nonPrimary", "company", "all"]).default("primary"),
  companyId: z.string().uuid().optional(),
});

async function buildIllnessByDepartment(notes: Awaited<ReturnType<typeof fetchIllnessNotes>>) {
  const overall = new Map<string, number>();
  const byDept = new Map<string, Map<string, number>>();
  for (const n of notes) {
    const category = n.illnessCategory ? (CATEGORY_LABEL[n.illnessCategory] || n.illnessCategory) : UNCATEGORIZED;
    overall.set(category, (overall.get(category) || 0) + 1);
    const dept = n.employee.department || "(No department)";
    if (!byDept.has(dept)) byDept.set(dept, new Map());
    const deptCounts = byDept.get(dept)!;
    deptCounts.set(category, (deptCounts.get(category) || 0) + 1);
  }
  return { overall, byDept };
}

reportsRouter.get("/illness-by-department/word", requireNurseOrAdmin, async (req, res) => {
  const parsed = illnessByDeptSchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: "A from and to date are both required" });
  const range = parseDateRange(parsed.data.from, parsed.data.to);
  if (!range) return res.status(400).json({ error: "Invalid from/to date" });
  const { department } = parsed.data;

  try {
    const resolved = await resolveReportScope(req.query);
    await assertScopeHasEmployees({ ...resolved.employeeWhere, ...(department ? { department } : {}) });

    const notes = await fetchIllnessNotes(range.fromDate, range.toDate, resolved.employeeWhere, department);
    const { overall, byDept } = await buildIllnessByDepartment(notes);

    function toTable(counts: Map<string, number>): Table {
      const rows = Array.from(counts.entries()).sort(([, a], [, b]) => b - a).map(([cat, n]) => [cat, String(n)]);
      return dataTable(["Category", "Count"], rows);
    }

    const branding = await getAppBranding();
    const children: (Paragraph | Table)[] = docHeader(branding, "Illness / Complaint Summary by Department", [
      `Period: ${parsed.data.from} to ${parsed.data.to}`,
      `Scope: ${resolved.scopeLabel}`,
      `Department: ${department || "All departments"}`,
      `Generated by ${req.currentUser!.fullName} on ${new Date().toLocaleString()}`,
    ]);

    children.push(sectionHeading("All Departments — Combined"));
    children.push(notes.length === 0 ? emptyMessage("No notes in this period under this scope.") : toTable(overall));

    children.push(sectionHeading("By Department"));
    const sortedDepts = Array.from(byDept.keys()).sort((a, b) => a.localeCompare(b));
    if (sortedDepts.length === 0) children.push(emptyMessage("No notes in this period under this scope."));
    for (const dept of sortedDepts) {
      children.push(subHeading(dept));
      children.push(toTable(byDept.get(dept)!));
    }

    await writeAudit({
      req, userId: req.currentUser!.id, action: "DOWNLOAD_DOC", entityType: "IllnessByDepartmentReport",
      details: { from: parsed.data.from, to: parsed.data.to, department, scope: resolved.scopeLabel, noteCount: notes.length },
    });

    await sendDocx(res, `illness-by-department-${parsed.data.from}_to_${parsed.data.to}-${resolved.filenameToken}.docx`, children);
  } catch (err) {
    if (!handleScopeError(res, err)) throw err;
  }
});

reportsRouter.get("/illness-by-department/excel", requireNurseOrAdmin, async (req, res) => {
  const parsed = illnessByDeptSchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: "A from and to date are both required" });
  const range = parseDateRange(parsed.data.from, parsed.data.to);
  if (!range) return res.status(400).json({ error: "Invalid from/to date" });
  const { department } = parsed.data;

  try {
    const resolved = await resolveReportScope(req.query);
    await assertScopeHasEmployees({ ...resolved.employeeWhere, ...(department ? { department } : {}) });

    const notes = await fetchIllnessNotes(range.fromDate, range.toDate, resolved.employeeWhere, department);
    const { overall, byDept } = await buildIllnessByDepartment(notes);

    const rows: (string | number)[][] = [];
    for (const [cat, n] of Array.from(overall.entries()).sort(([, a], [, b]) => b - a)) rows.push(["All Departments (Combined)", cat, n]);
    for (const dept of Array.from(byDept.keys()).sort((a, b) => a.localeCompare(b))) {
      for (const [cat, n] of Array.from(byDept.get(dept)!.entries()).sort(([, a], [, b]) => b - a)) rows.push([dept, cat, n]);
    }

    const workbook = createReportWorkbook({
      reportType: "Illness/Complaint by Department", scopeLabel: resolved.scopeLabel,
      period: `${parsed.data.from} to ${parsed.data.to}`, generatedBy: req.currentUser!.fullName, generatedAt: new Date(),
    });
    addDataSheet(workbook, "By Department", ["Department", "Category", "Count"], rows);

    await writeAudit({ req, userId: req.currentUser!.id, action: "DOWNLOAD_DOC", entityType: "IllnessByDepartmentReport", details: { from: parsed.data.from, to: parsed.data.to, department, scope: resolved.scopeLabel, format: "xlsx" } });
    await sendXlsx(res, `illness-by-department-${parsed.data.from}_to_${parsed.data.to}-${resolved.filenameToken}.xlsx`, workbook);
  } catch (err) {
    if (!handleScopeError(res, err)) throw err;
  }
});

// ── Illness/Condition report by age ──────────────────────────────────────
const AGE_BRACKETS: [string, number, number][] = [
  ["Under 20", 0, 19],
  ["20-29", 20, 29],
  ["30-39", 30, 39],
  ["40-49", 40, 49],
  ["50-59", 50, 59],
  ["60+", 60, 999],
];

function ageOn(dateOfBirth: Date, asOf: Date): number {
  let age = asOf.getFullYear() - dateOfBirth.getFullYear();
  const hadBirthdayThisYear =
    asOf.getMonth() > dateOfBirth.getMonth() ||
    (asOf.getMonth() === dateOfBirth.getMonth() && asOf.getDate() >= dateOfBirth.getDate());
  if (!hadBirthdayThisYear) age--;
  return age;
}

function bracketFor(age: number): string {
  const bracket = AGE_BRACKETS.find(([, min, max]) => age >= min && age <= max);
  return bracket ? bracket[0] : "Unknown";
}

const illnessByAgeSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  department: z.string().optional(),
  exactAge: z.coerce.number().int().min(0).max(120).optional(),
  scope: z.enum(["primary", "nonPrimary", "company", "all"]).default("primary"),
  companyId: z.string().uuid().optional(),
});

interface AgeRow { bracket: string; age: number | null; category: string }

function buildIllnessByAgeRows(notes: Awaited<ReturnType<typeof fetchIllnessNotes>>, exactAge?: number): AgeRow[] {
  return notes
    .filter((n) => n.employee.dateOfBirth)
    .map((n) => {
      const age = ageOn(new Date(n.employee.dateOfBirth!), n.visitDateTime);
      return { bracket: bracketFor(age), age, category: n.illnessCategory ? (CATEGORY_LABEL[n.illnessCategory] || n.illnessCategory) : UNCATEGORIZED };
    })
    .filter((r) => exactAge === undefined || r.age === exactAge);
}

reportsRouter.get("/illness-by-age/word", requireNurseOrAdmin, async (req, res) => {
  const parsed = illnessByAgeSchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: "A from and to date are both required" });
  const range = parseDateRange(parsed.data.from, parsed.data.to);
  if (!range) return res.status(400).json({ error: "Invalid from/to date" });
  const { department, exactAge } = parsed.data;

  try {
    const resolved = await resolveReportScope(req.query);
    await assertScopeHasEmployees({ ...resolved.employeeWhere, ...(department ? { department } : {}) });

    const notes = await fetchIllnessNotes(range.fromDate, range.toDate, resolved.employeeWhere, department);
    const rows = buildIllnessByAgeRows(notes, exactAge);

    const byBracket = new Map<string, Map<string, number>>();
    for (const r of rows) {
      if (!byBracket.has(r.bracket)) byBracket.set(r.bracket, new Map());
      const m = byBracket.get(r.bracket)!;
      m.set(r.category, (m.get(r.category) || 0) + 1);
    }

    const branding = await getAppBranding();
    const children: (Paragraph | Table)[] = docHeader(branding, "Illness / Condition Report by Age", [
      `Period: ${parsed.data.from} to ${parsed.data.to}`,
      `Scope: ${resolved.scopeLabel}`,
      `Department: ${department || "All departments"}`,
      exactAge !== undefined ? `Exact age: ${exactAge}` : "Grouped by age bracket",
      `Generated by ${req.currentUser!.fullName} on ${new Date().toLocaleString()}`,
    ]);

    children.push(sectionHeading(exactAge !== undefined ? `Age ${exactAge}` : "By Age Bracket"));
    const bracketOrder = exactAge !== undefined ? Array.from(byBracket.keys()) : AGE_BRACKETS.map(([label]) => label).filter((b) => byBracket.has(b));
    if (rows.length === 0) {
      children.push(emptyMessage("No notes match this filter under this scope (or affected employees have no date of birth on file)."));
    }
    for (const bracket of bracketOrder) {
      children.push(subHeading(bracket));
      const counts = byBracket.get(bracket)!;
      const tableRows = Array.from(counts.entries()).sort(([, a], [, b]) => b - a).map(([cat, n]) => [cat, String(n)]);
      children.push(dataTable(["Category", "Count"], tableRows));
    }

    await writeAudit({
      req, userId: req.currentUser!.id, action: "DOWNLOAD_DOC", entityType: "IllnessByAgeReport",
      details: { from: parsed.data.from, to: parsed.data.to, department, exactAge, scope: resolved.scopeLabel, noteCount: rows.length },
    });

    await sendDocx(res, `illness-by-age-${parsed.data.from}_to_${parsed.data.to}-${resolved.filenameToken}.docx`, children);
  } catch (err) {
    if (!handleScopeError(res, err)) throw err;
  }
});

reportsRouter.get("/illness-by-age/excel", requireNurseOrAdmin, async (req, res) => {
  const parsed = illnessByAgeSchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: "A from and to date are both required" });
  const range = parseDateRange(parsed.data.from, parsed.data.to);
  if (!range) return res.status(400).json({ error: "Invalid from/to date" });
  const { department, exactAge } = parsed.data;

  try {
    const resolved = await resolveReportScope(req.query);
    await assertScopeHasEmployees({ ...resolved.employeeWhere, ...(department ? { department } : {}) });

    const notes = await fetchIllnessNotes(range.fromDate, range.toDate, resolved.employeeWhere, department);
    const ageRows = buildIllnessByAgeRows(notes, exactAge);
    const byBracket = new Map<string, Map<string, number>>();
    for (const r of ageRows) {
      if (!byBracket.has(r.bracket)) byBracket.set(r.bracket, new Map());
      const m = byBracket.get(r.bracket)!;
      m.set(r.category, (m.get(r.category) || 0) + 1);
    }
    const rows: (string | number)[][] = [];
    for (const bracket of byBracket.keys()) {
      for (const [cat, n] of byBracket.get(bracket)!.entries()) rows.push([bracket, cat, n]);
    }

    const workbook = createReportWorkbook({
      reportType: "Illness/Condition by Age", scopeLabel: resolved.scopeLabel,
      period: `${parsed.data.from} to ${parsed.data.to}`, generatedBy: req.currentUser!.fullName, generatedAt: new Date(),
    });
    addDataSheet(workbook, "By Age", ["Age Bracket", "Category", "Count"], rows);

    await writeAudit({ req, userId: req.currentUser!.id, action: "DOWNLOAD_DOC", entityType: "IllnessByAgeReport", details: { from: parsed.data.from, to: parsed.data.to, department, exactAge, scope: resolved.scopeLabel, format: "xlsx" } });
    await sendXlsx(res, `illness-by-age-${parsed.data.from}_to_${parsed.data.to}-${resolved.filenameToken}.xlsx`, workbook);
  } catch (err) {
    if (!handleScopeError(res, err)) throw err;
  }
});

// ── Custom Report Builder (checkbox-driven, company/department-wide) ────
// The aggregate/multi-employee counterpart to employees.ts's per-employee
// export — same categories, same section-based PDF builder, same checkbox
// spirit, but scoped by company/department/date range/specific employees
// instead of a single employee. Scope only applies when no specific
// employee list is given (same precedence as department already had).
const CUSTOM_CATEGORIES = ["DOCTOR", "NURSE", "DENTIST", "MEDICATIONS", "APE", "VITALS", "DRUG_TEST", "PRE_EMPLOYMENT"] as const;
type CustomCategory = (typeof CUSTOM_CATEGORIES)[number];
const CUSTOM_CATEGORY_LABEL: Record<CustomCategory, string> = {
  DOCTOR: "Doctor's Notes", NURSE: "Nurse's Notes", DENTIST: "Dentist's Notes",
  MEDICATIONS: "Medications", APE: "Annual Physical Exams", VITALS: "Vitals",
  DRUG_TEST: "Drug Test Results", PRE_EMPLOYMENT: "Pre-Employment Exams",
};

const customReportSchema = z.object({
  categories: z.string().min(1),
  department: z.string().optional(),
  employeeIds: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  scope: z.enum(["primary", "nonPrimary", "company", "all"]).default("primary"),
  companyId: z.string().uuid().optional(),
});

interface CustomReportData {
  employees: Awaited<ReturnType<typeof prisma.employee.findMany>>;
  sections: ReportSection[];
  scopeLabel: string;
}

async function fetchCustomReportData(parsed: z.infer<typeof customReportSchema>, categories: CustomCategory[]): Promise<CustomReportData> {
  const employeeIds = parsed.employeeIds ? parsed.employeeIds.split(",").map((s) => s.trim()).filter(Boolean) : undefined;

  let scopeLabel = "Selected employees";
  let scopeWhere: Record<string, unknown> = {};
  if (!employeeIds) {
    const resolved = await resolveReportScope(parsed);
    scopeLabel = resolved.scopeLabel;
    scopeWhere = resolved.employeeWhere;
    await assertScopeHasEmployees({ ...scopeWhere, ...(parsed.department ? { department: parsed.department } : {}) });
  }

  const employees = await prisma.employee.findMany({
    where: {
      isActive: true,
      ...(employeeIds ? { id: { in: employeeIds } } : { ...(parsed.department ? { department: parsed.department } : {}), ...scopeWhere }),
    },
    orderBy: { lastName: "asc" },
    include: { company: { select: { name: true } } },
  });
  if (employees.length === 0) throw new ScopeError("No employees match the selected filters");

  let fromDate: Date | null = null;
  let toDate: Date | null = null;
  if (parsed.from) {
    fromDate = new Date(parsed.from);
    if (Number.isNaN(fromDate.getTime())) throw new ScopeError("Invalid from date");
  }
  if (parsed.to) {
    toDate = new Date(parsed.to);
    if (Number.isNaN(toDate.getTime())) throw new ScopeError("Invalid to date");
    toDate.setHours(23, 59, 59, 999);
  }
  const dateRange = (fromDate || toDate) ? { ...(fromDate ? { gte: fromDate } : {}), ...(toDate ? { lte: toDate } : {}) } : undefined;

  const empIds = employees.map((e) => e.id);
  const empById = new Map(employees.map((e) => [e.id, e]));
  const sections: ReportSection[] = [];
  const noteTypesRequested = categories.filter((c): c is "DOCTOR" | "NURSE" | "DENTIST" => c === "DOCTOR" || c === "NURSE" || c === "DENTIST");

  let vitalsInRange: Awaited<ReturnType<typeof prisma.vitalsRecord.findMany>> = [];
  if (noteTypesRequested.length > 0) {
    vitalsInRange = await prisma.vitalsRecord.findMany({
      where: { employeeId: { in: empIds }, ...(dateRange ? { recordedAt: dateRange } : {}) },
    });
  }

  for (const nt of noteTypesRequested) {
    const notes = await prisma.clinicalNote.findMany({
      where: { employeeId: { in: empIds }, noteType: nt, ...(dateRange ? { visitDateTime: dateRange } : {}) },
      orderBy: { visitDateTime: "asc" },
      include: { author: { select: { fullName: true } } },
    });
    sections.push({
      kind: "NOTES",
      noteType: nt,
      notes: notes.map((n): ReportNote => {
        const e = empById.get(n.employeeId)!;
        return {
          noteType: n.noteType,
          visitDateTime: n.visitDateTime,
          employeeCode: e.employeeCode,
          employeeName: `${e.lastName}, ${e.firstName}`,
          department: e.department,
          companyName: e.company?.name ?? null,
          authorName: n.author.fullName,
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
          vitals: pickVitalsForNote(vitalsInRange, n.employeeId, n.visitDateTime),
        };
      }),
    });
  }

  if (categories.includes("MEDICATIONS")) {
    const meds = await prisma.medicationLog.findMany({
      where: { employeeId: { in: empIds }, ...(dateRange ? { dispensedAt: dateRange } : {}) },
      orderBy: { dispensedAt: "asc" },
      include: { dispensedBy: { select: { fullName: true } } },
    });
    const medications: ReportMedication[] = meds.map((m) => {
      const e = empById.get(m.employeeId)!;
      return {
        drugName: m.drugName, strength: m.strength, dosageForm: m.dosageForm, route: m.route,
        frequency: m.frequency, quantityDispensed: m.quantityDispensed, dispensedAt: m.dispensedAt,
        dispensedByName: m.dispensedBy.fullName, employeeCode: e.employeeCode, employeeName: `${e.lastName}, ${e.firstName}`, department: e.department,
      };
    });
    sections.push({ kind: "MEDICATIONS", medications });
  }

  if (categories.includes("APE")) {
    const apes = await prisma.annualPhysicalExam.findMany({
      where: { employeeId: { in: empIds }, ...(dateRange ? { examDate: dateRange } : {}) },
      orderBy: [{ employeeId: "asc" }, { examYear: "asc" }],
    });
    const reportApes: ReportApe[] = apes.map((a) => {
      const e = empById.get(a.employeeId)!;
      return {
        employeeCode: e.employeeCode, employeeName: `${e.lastName}, ${e.firstName}`, department: e.department,
        examYear: a.examYear, examDate: a.examDate, provider: a.provider, heightCm: a.heightCm, weightKg: a.weightKg, bmi: a.bmi,
        bloodPressure: a.bloodPressure, visionOD: a.visionOD, visionOS: a.visionOS, hearing: a.hearing, cbcResult: a.cbcResult,
        urinalysisResult: a.urinalysisResult, fecalysisResult: a.fecalysisResult, chestXrayResult: a.chestXrayResult,
        ecgResult: a.ecgResult, drugTestResult: a.drugTestResult, otherFindings: a.otherFindings,
        significantFindings: a.significantFindings, recommendations: a.recommendations, fitnessClassification: a.fitnessClassification,
      };
    });
    sections.push({ kind: "APE", apes: reportApes });
  }

  if (categories.includes("VITALS")) {
    const vitals = await prisma.vitalsRecord.findMany({
      where: { employeeId: { in: empIds }, ...(dateRange ? { recordedAt: dateRange } : {}) },
      orderBy: [{ employeeId: "asc" }, { recordedAt: "asc" }],
      include: { recordedBy: { select: { fullName: true } } },
    });
    const reportVitals: ReportVitalsRecord[] = vitals.map((v) => {
      const e = empById.get(v.employeeId)!;
      return {
        employeeCode: e.employeeCode, employeeName: `${e.lastName}, ${e.firstName}`, department: e.department,
        recordedAt: v.recordedAt, recordedByName: v.recordedBy.fullName, heightCm: v.heightCm, weightKg: v.weightKg, bmi: v.bmi,
        bmiCategory: v.bmiCategory, systolic: v.systolic, diastolic: v.diastolic, pulseRate: v.pulseRate,
        respiratoryRate: v.respiratoryRate, temperatureC: v.temperatureC, oxygenSaturation: v.oxygenSaturation, remarks: v.remarks,
      };
    });
    sections.push({ kind: "VITALS", vitals: reportVitals });
  }

  if (categories.includes("DRUG_TEST")) {
    const tests = await prisma.drugTestResult.findMany({
      where: { employeeId: { in: empIds }, ...(dateRange ? { testDate: dateRange } : {}) },
      orderBy: [{ employeeId: "asc" }, { testDate: "asc" }],
    });
    const reportTests: ReportDrugTest[] = tests.map((t) => {
      const e = empById.get(t.employeeId)!;
      return {
        employeeCode: e.employeeCode, employeeName: `${e.lastName}, ${e.firstName}`, department: e.department,
        testDate: t.testDate, result: t.result, specimenType: t.specimenType, labName: t.labName, remarks: t.remarks,
      };
    });
    sections.push({ kind: "DRUG_TEST", drugTests: reportTests });
  }

  if (categories.includes("PRE_EMPLOYMENT")) {
    const exams = await prisma.preEmploymentExam.findMany({
      where: { employeeId: { in: empIds }, ...(dateRange ? { examDate: dateRange } : {}) },
      orderBy: [{ employeeId: "asc" }, { createdAt: "asc" }],
    });
    const reportExams: ReportPreEmployment[] = exams.map((p) => {
      const e = empById.get(p.employeeId)!;
      return {
        employeeCode: e.employeeCode, employeeName: `${e.lastName}, ${e.firstName}`, department: e.department,
        examDate: p.examDate, provider: p.provider, heightCm: p.heightCm, weightKg: p.weightKg, bmi: p.bmi,
        bloodPressure: p.bloodPressure, visionOD: p.visionOD, visionOS: p.visionOS, hearing: p.hearing,
        cbcResult: p.cbcResult, urinalysisResult: p.urinalysisResult, fecalysisResult: p.fecalysisResult,
        chestXrayResult: p.chestXrayResult, ecgResult: p.ecgResult, drugTestResult: p.drugTestResult,
        pregnancyTestResult: p.pregnancyTestResult, medicalHistory: p.medicalHistory, physicalExamFindings: p.physicalExamFindings,
        otherFindings: p.otherFindings, significantFindings: p.significantFindings, recommendations: p.recommendations,
        fitnessClassification: p.fitnessClassification,
      };
    });
    sections.push({ kind: "PRE_EMPLOYMENT", preEmployments: reportExams });
  }

  return { employees, sections, scopeLabel };
}

reportsRouter.get("/custom/export", requireNurseOrAdmin, async (req, res) => {
  const parsed = customReportSchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: "At least one category is required" });

  const requested = parsed.data.categories.split(",").map((c) => c.trim().toUpperCase()).filter(Boolean);
  const categories = requested.filter((c): c is CustomCategory => (CUSTOM_CATEGORIES as readonly string[]).includes(c));
  if (categories.length === 0) return res.status(400).json({ error: "At least one valid category is required" });

  try {
    const { employees, sections, scopeLabel } = await fetchCustomReportData(parsed.data, categories);

    await writeAudit({
      req, userId: req.currentUser!.id, action: "DOWNLOAD_DOC", entityType: "CustomReport",
      details: { categories, department: parsed.data.department || null, scope: scopeLabel, employeeCount: employees.length, from: parsed.data.from || null, to: parsed.data.to || null },
    });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="custom-report-${new Date().toISOString().slice(0, 10)}-${sanitizeForFilename(scopeLabel)}.pdf"`);
    const appName = await getAppName();
    const doc = buildReportPdf({
      appName,
      title: "Custom Report",
      subtitleLines: [
        `Scope: ${parsed.data.employeeIds ? `${employees.length} selected employee(s)` : scopeLabel}`,
        `Period: ${parsed.data.from || "Full history"} to ${parsed.data.to || "present"}`,
        `Categories: ${categories.map((c) => CUSTOM_CATEGORY_LABEL[c]).join(", ")}`,
        `Generated by ${req.currentUser!.fullName} on ${new Date().toLocaleString()}`,
      ],
      sections,
    });
    doc.pipe(res);
  } catch (err) {
    if (!handleScopeError(res, err)) throw err;
  }
});

// ── Custom Report Builder — data-only Excel export ──────────────────────
// One sheet per included category — Custom Builder is inherently
// multi-section (like a Comprehensive report), so it follows that rule
// rather than the single-sheet rule Summary/Detailed reports use.
function noteRowsFor(section: Extract<ReportSection, { kind: "NOTES" }>): (string | number)[][] {
  return section.notes.map((n) => [
    n.employeeCode, n.employeeName, n.department || "—", new Date(n.visitDateTime).toLocaleDateString(),
    n.authorName, n.chiefComplaint || "—", n.diagnosis || n.nursingDiagnosis || "—",
    n.treatment || n.plan || "—", n.disposition || "—",
  ]);
}

reportsRouter.get("/custom/excel", requireNurseOrAdmin, async (req, res) => {
  const parsed = customReportSchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: "At least one category is required" });

  const requested = parsed.data.categories.split(",").map((c) => c.trim().toUpperCase()).filter(Boolean);
  const categories = requested.filter((c): c is CustomCategory => (CUSTOM_CATEGORIES as readonly string[]).includes(c));
  if (categories.length === 0) return res.status(400).json({ error: "At least one valid category is required" });

  try {
    const { employees, sections, scopeLabel } = await fetchCustomReportData(parsed.data, categories);

    const workbook = createReportWorkbook({
      reportType: "Custom Report", scopeLabel: parsed.data.employeeIds ? `${employees.length} selected employee(s)` : scopeLabel,
      period: `${parsed.data.from || "Full history"} to ${parsed.data.to || "present"}`,
      generatedBy: req.currentUser!.fullName, generatedAt: new Date(),
    });

    for (const section of sections) {
      if (section.kind === "NOTES") {
        addDataSheet(workbook, CUSTOM_CATEGORY_LABEL[section.noteType as CustomCategory], ["Code", "Name", "Department", "Visit Date", "Author", "Chief Complaint", "Diagnosis", "Treatment/Plan", "Disposition"], noteRowsFor(section));
      } else if (section.kind === "MEDICATIONS") {
        addDataSheet(workbook, "Medications", ["Code", "Name", "Department", "Date", "Drug", "Strength", "Route", "Frequency", "Qty"], section.medications.map((m) => [
          m.employeeCode, m.employeeName, m.department || "—", new Date(m.dispensedAt).toLocaleDateString(), m.drugName, m.strength || "—", m.route || "—", m.frequency || "—", m.quantityDispensed || "—",
        ]));
      } else if (section.kind === "APE") {
        addDataSheet(workbook, "Annual Physical Exams", ["Code", "Name", "Department", "Year", "Exam Date", "Ht", "Wt", "BMI", "BP", "Fitness Class"], section.apes.map((a) => [
          a.employeeCode, a.employeeName, a.department || "—", a.examYear, a.examDate ? new Date(a.examDate).toLocaleDateString() : "—", a.heightCm ?? "—", a.weightKg ?? "—", a.bmi ?? "—", a.bloodPressure || "—", a.fitnessClassification || "—",
        ]));
      } else if (section.kind === "VITALS") {
        addDataSheet(workbook, "Vitals", ["Code", "Name", "Department", "Recorded", "Ht", "Wt", "BMI", "BP Systolic", "BP Diastolic", "Pulse"], section.vitals.map((v) => [
          v.employeeCode, v.employeeName, v.department || "—", new Date(v.recordedAt).toLocaleDateString(), v.heightCm ?? "—", v.weightKg ?? "—", v.bmi ?? "—", v.systolic ?? "—", v.diastolic ?? "—", v.pulseRate ?? "—",
        ]));
      } else if (section.kind === "DRUG_TEST") {
        addDataSheet(workbook, "Drug Test Results", ["Code", "Name", "Department", "Test Date", "Result", "Specimen", "Lab"], section.drugTests.map((t) => [
          t.employeeCode, t.employeeName, t.department || "—", new Date(t.testDate).toLocaleDateString(), t.result, t.specimenType || "—", t.labName || "—",
        ]));
      } else if (section.kind === "PRE_EMPLOYMENT") {
        addDataSheet(workbook, "Pre-Employment Exams", ["Code", "Name", "Department", "Exam Date", "Ht", "Wt", "BMI", "Fitness Class"], section.preEmployments.map((p) => [
          p.employeeCode, p.employeeName, p.department || "—", p.examDate ? new Date(p.examDate).toLocaleDateString() : "—", p.heightCm ?? "—", p.weightKg ?? "—", p.bmi ?? "—", p.fitnessClassification || "—",
        ]));
      }
    }

    await writeAudit({
      req, userId: req.currentUser!.id, action: "DOWNLOAD_DOC", entityType: "CustomReport",
      details: { categories, department: parsed.data.department || null, scope: scopeLabel, employeeCount: employees.length, from: parsed.data.from || null, to: parsed.data.to || null, format: "xlsx" },
    });

    await sendXlsx(res, `custom-report-${new Date().toISOString().slice(0, 10)}-${sanitizeForFilename(scopeLabel)}.xlsx`, workbook);
  } catch (err) {
    if (!handleScopeError(res, err)) throw err;
  }
});
