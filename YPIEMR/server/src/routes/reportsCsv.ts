import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, requireRole } from "../middleware/auth";
import { writeAudit } from "../services/audit";
import { toCsv } from "../services/csv";
import { ILLNESS_CATEGORIES } from "../services/illnessCategories";

// Four month/year-filterable CSV reports (Illness by month, Illness by
// department, Medications by department, Lab/diagnostic tests by
// department) — a lighter-weight sibling to the Word/Excel report builders
// in reports.ts: single CSV download, no letterhead/branding, matching the
// existing text/csv export convention from routes/audit.ts's export.csv
// rather than reportDocx/reportExcel's heavier document builders.
export const reportsCsvRouter = Router();
reportsCsvRouter.use(requireAuth);

// Same convention as reports.ts: these are clinic-wide reporting tools, not
// a single employee's own chart, so Nurse and Admin only.
const requireNurseOrAdmin = requireRole("NURSE", "ADMIN");

const periodSchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
  month: z.coerce.number().int().min(1).max(12).optional(),
  department: z.string().optional(),
});

function resolveDateRange(year: number, month?: number): { start: Date; end: Date; label: string } {
  if (month) {
    return { start: new Date(year, month - 1, 1), end: new Date(year, month, 1), label: `${year}-${String(month).padStart(2, "0")}` };
  }
  return { start: new Date(year, 0, 1), end: new Date(year + 1, 0, 1), label: String(year) };
}

async function allDepartments(): Promise<string[]> {
  const rows = await prisma.employee.findMany({
    where: { department: { not: null } },
    distinct: ["department"],
    select: { department: true },
    orderBy: { department: "asc" },
  });
  return rows.map((r) => r.department).filter((d): d is string => !!d);
}

function sendCsv(res: import("express").Response, filename: string, csv: string) {
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(csv);
}

// ── 1. Illness per month/year, by illness/condition category ───────────
reportsCsvRouter.get("/illness-by-month/export.csv", requireNurseOrAdmin, async (req, res) => {
  const parsed = periodSchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const { year, month, department } = parsed.data;
  const { start, end, label } = resolveDateRange(year, month);

  const notes = await prisma.clinicalNote.findMany({
    where: {
      visitDateTime: { gte: start, lt: end },
      illnessCategory: { not: null },
      ...(department ? { employee: { department } } : {}),
    },
    select: { illnessCategory: true },
  });

  const counts = new Map<string, number>();
  for (const n of notes) counts.set(n.illnessCategory!, (counts.get(n.illnessCategory!) || 0) + 1);

  const rows = ILLNESS_CATEGORIES.map((c) => [c.label, counts.get(c.key) || 0]);
  const total = notes.length;
  rows.push(["Total", total]);

  await writeAudit({ req, userId: req.currentUser!.id, action: "DOWNLOAD_DOC", entityType: "IllnessByMonthReport", details: { period: label, department: department || null, rowCount: total } });

  sendCsv(res, `illness-by-month-${label}${department ? `-${department}` : ""}.csv`, toCsv(["Illness/Condition Category", "Count"], rows));
});

// ── 2. Illness per department per month/year, cross-tabbed ─────────────
reportsCsvRouter.get("/illness-by-department-month/export.csv", requireNurseOrAdmin, async (req, res) => {
  const parsed = periodSchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const { year, month, department } = parsed.data;
  const { start, end, label } = resolveDateRange(year, month);

  const notes = await prisma.clinicalNote.findMany({
    where: {
      visitDateTime: { gte: start, lt: end },
      illnessCategory: { not: null },
      ...(department ? { employee: { department } } : {}),
    },
    select: { illnessCategory: true, employee: { select: { department: true } } },
  });

  const departments = department ? [department] : await allDepartments();
  // Table[dept][categoryKey] = count
  const table = new Map<string, Map<string, number>>();
  for (const dept of departments) table.set(dept, new Map());
  let unspecifiedCount = 0;

  for (const n of notes) {
    const dept = n.employee.department;
    const cat = n.illnessCategory!;
    if (!dept) { unspecifiedCount++; continue; }
    if (!table.has(dept)) table.set(dept, new Map());
    const deptRow = table.get(dept)!;
    deptRow.set(cat, (deptRow.get(cat) || 0) + 1);
  }

  const header = ["Department", ...ILLNESS_CATEGORIES.map((c) => c.label), "Total"];
  const rows: (string | number)[][] = [];
  for (const [dept, catCounts] of table) {
    const counts = ILLNESS_CATEGORIES.map((c) => catCounts.get(c.key) || 0);
    rows.push([dept, ...counts, counts.reduce((a, b) => a + b, 0)]);
  }
  if (!department && unspecifiedCount > 0) rows.push(["(No department on file)", ...ILLNESS_CATEGORIES.map(() => ""), unspecifiedCount]);

  await writeAudit({ req, userId: req.currentUser!.id, action: "DOWNLOAD_DOC", entityType: "IllnessByDepartmentMonthReport", details: { period: label, department: department || null, rowCount: notes.length } });

  sendCsv(res, `illness-by-department-${label}${department ? `-${department}` : ""}.csv`, toCsv(header, rows));
});

// ── 3. Medications dispensed per department per month/year ─────────────
reportsCsvRouter.get("/medications-by-department/export.csv", requireNurseOrAdmin, async (req, res) => {
  const parsed = periodSchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const { year, month, department } = parsed.data;
  const { start, end, label } = resolveDateRange(year, month);

  const logs = await prisma.medicationLog.findMany({
    where: {
      dispensedAt: { gte: start, lt: end },
      isArchived: false,
      ...(department ? { employee: { department } } : {}),
    },
    select: { employee: { select: { department: true } } },
  });

  const counts = new Map<string, number>();
  let unspecifiedCount = 0;
  for (const l of logs) {
    const dept = l.employee.department;
    if (!dept) { unspecifiedCount++; continue; }
    counts.set(dept, (counts.get(dept) || 0) + 1);
  }

  const departments = department ? [department] : await allDepartments();
  const rows: (string | number)[][] = departments.map((d) => [d, counts.get(d) || 0]);
  if (!department && unspecifiedCount > 0) rows.push(["(No department on file)", unspecifiedCount]);
  rows.push(["Total", logs.length]);

  await writeAudit({ req, userId: req.currentUser!.id, action: "DOWNLOAD_DOC", entityType: "MedicationsByDepartmentReport", details: { period: label, department: department || null, rowCount: logs.length } });

  sendCsv(res, `medications-by-department-${label}${department ? `-${department}` : ""}.csv`, toCsv(["Department", "Medications Dispensed"], rows));
});

// ── 4. Lab/diagnostic tests per month/year/department, by test type ────
reportsCsvRouter.get("/lab-tests-by-department/export.csv", requireNurseOrAdmin, async (req, res) => {
  const parsed = periodSchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const { year, month, department } = parsed.data;
  const { start, end, label } = resolveDateRange(year, month);

  const tests = await prisma.labTestResult.findMany({
    where: {
      datePerformed: { gte: start, lt: end },
      ...(department ? { employee: { department } } : {}),
    },
    select: { testType: true, employee: { select: { department: true } } },
  });

  const departments = department ? [department] : await allDepartments();
  const testTypes = await prisma.labTestType.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { name: true } });
  // Include any test type actually used in this period even if since deactivated/renamed.
  const testTypeNames = Array.from(new Set([...testTypes.map((t) => t.name), ...tests.map((t) => t.testType)])).sort();

  // Table[testType][department] = count
  const table = new Map<string, Map<string, number>>();
  for (const tt of testTypeNames) table.set(tt, new Map());
  let unspecifiedCount = 0;

  for (const t of tests) {
    const dept = t.employee.department;
    const row = table.get(t.testType) || new Map();
    table.set(t.testType, row);
    if (!dept) { unspecifiedCount++; continue; }
    row.set(dept, (row.get(dept) || 0) + 1);
  }

  const header = ["Test Type", ...departments, "Total"];
  const rows: (string | number)[][] = [];
  for (const tt of testTypeNames) {
    const row = table.get(tt)!;
    const counts = departments.map((d) => row.get(d) || 0);
    rows.push([tt, ...counts, counts.reduce((a, b) => a + b, 0)]);
  }
  if (!department && unspecifiedCount > 0) rows.push(["(No department on file)", ...departments.map(() => ""), unspecifiedCount]);

  await writeAudit({ req, userId: req.currentUser!.id, action: "DOWNLOAD_DOC", entityType: "LabTestsByDepartmentReport", details: { period: label, department: department || null, rowCount: tests.length } });

  sendCsv(res, `lab-tests-by-department-${label}${department ? `-${department}` : ""}.csv`, toCsv(header, rows));
});
