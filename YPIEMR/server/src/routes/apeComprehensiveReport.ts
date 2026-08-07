import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, requireRole } from "../middleware/auth";
import { writeAudit } from "../services/audit";
import { getAppBranding, sendDocx } from "../services/reportDocx";
import { resolveReportScope, assertScopeHasEmployees, ScopeError, sanitizeForFilename } from "../services/reportScope";
import {
  ApeExamRow, ScopedEmployee, ToothSummary, ApeComprehensiveStats, YearOverYearComponent, CompanyBreakdown,
  buildComponentStats, buildDemographics, buildFollowUps, buildCompleteness, buildDentalStat, tallyToSorted,
} from "../services/apeComprehensive/stats";
import { buildApeComprehensiveDoc } from "../services/apeComprehensive/docBuilder";
import { ChartBranding, DEFAULT_CHART_BRANDING } from "../services/apeComprehensive/charts";
import { CLASSIFIED_COMPONENT_KEYS } from "../services/apeComprehensive/classification";

export const apeComprehensiveRouter = Router();
apeComprehensiveRouter.use(requireAuth);
const requireNurseOrAdmin = requireRole("NURSE", "ADMIN");

const apeComprehensiveSchema = z.object({
  examYear: z.coerce.number().int().min(2000).max(2100),
  department: z.string().optional(),
  compareYears: z.coerce.number().int().min(0).max(5).default(0),
  scope: z.enum(["primary", "nonPrimary", "company", "all"]).default("primary"),
  companyId: z.string().uuid().optional(),
});

function toScopedEmployee(e: {
  id: string; employeeCode: string; lastName: string; firstName: string; dateOfBirth: Date | null;
  sex: string | null; department: string | null; dateHired: Date | null; companyId: string | null;
  company: { name: string } | null;
}): ScopedEmployee {
  return {
    id: e.id, employeeCode: e.employeeCode, lastName: e.lastName, firstName: e.firstName,
    dateOfBirth: e.dateOfBirth, sex: e.sex, department: e.department, dateHired: e.dateHired,
    companyId: e.companyId, companyName: e.company?.name ?? null,
  };
}

function toApeExamRow(a: {
  employeeId: string; examYear: number; heightCm: number | null; weightKg: number | null; bmi: number | null;
  bloodPressure: string | null; visionOD: string | null; visionOS: string | null; hearing: string | null;
  cbcResult: string | null; urinalysisResult: string | null; fecalysisResult: string | null;
  chestXrayResult: string | null; ecgResult: string | null; otherFindings: string | null;
  significantFindings: string | null; fitnessClassification: string | null;
}): ApeExamRow {
  return { ...a };
}

async function fetchScopedEmployees(employeeWhere: Record<string, unknown>, department?: string): Promise<ScopedEmployee[]> {
  const rows = await prisma.employee.findMany({
    where: { isActive: true, ...(department ? { department } : {}), ...employeeWhere },
    orderBy: { lastName: "asc" },
    include: { company: { select: { name: true } } },
  });
  return rows.map(toScopedEmployee);
}

async function fetchExamsForYear(employeeIds: string[], year: number): Promise<ApeExamRow[]> {
  if (employeeIds.length === 0) return [];
  const rows = await prisma.annualPhysicalExam.findMany({
    where: { employeeId: { in: employeeIds }, examYear: year },
  });
  return rows.map(toApeExamRow);
}

async function fetchToothByEmployee(employeeIds: string[]): Promise<Map<string, ToothSummary>> {
  if (employeeIds.length === 0) return new Map();
  const rows = await prisma.toothRecord.findMany({ where: { employeeId: { in: employeeIds } } });
  const byEmployee = new Map<string, { missing: number; caries: number }>();
  for (const r of rows) {
    const cur = byEmployee.get(r.employeeId) ?? { missing: 0, caries: 0 };
    if (r.status === "MISSING") cur.missing++;
    else if (r.status === "CARIES") cur.caries++;
    byEmployee.set(r.employeeId, cur);
  }
  const TOTAL_TEETH = 32;
  const result = new Map<string, ToothSummary>();
  for (const id of employeeIds) {
    const c = byEmployee.get(id) ?? { missing: 0, caries: 0 };
    result.set(id, { employeeId: id, missing: c.missing, caries: c.caries, healthy: TOTAL_TEETH - c.missing - c.caries });
  }
  return result;
}

async function buildStatsForPopulation(
  employees: ScopedEmployee[], year: number,
): Promise<ApeComprehensiveStats & { exams: ApeExamRow[] }> {
  const employeeIds = employees.map((e) => e.id);
  const exams = await fetchExamsForYear(employeeIds, year);
  const employeesById = new Map(employees.map((e) => [e.id, e]));
  const toothByEmployee = await fetchToothByEmployee(employeeIds);

  return {
    year,
    headcount: employees.length,
    examined: exams.length,
    demographics: buildDemographics(employees, new Date()),
    components: buildComponentStats(exams),
    dental: buildDentalStat(employees, toothByEmployee),
    followUps: buildFollowUps(exams, employeesById),
    completeness: buildCompleteness(exams),
    companyBreakdown: null,
    exams,
  };
}

async function buildYoyComponents(employees: ScopedEmployee[], years: number[]): Promise<YearOverYearComponent[]> {
  const employeeIds = employees.map((e) => e.id);
  const examsByYear = await Promise.all(years.map((y) => fetchExamsForYear(employeeIds, y)));
  const componentsByYear = examsByYear.map((exams) => buildComponentStats(exams));

  const keys = componentsByYear[0]?.map((c) => c.key) ?? [];
  return keys.map((key, idx) => {
    const label = componentsByYear[0][idx].label;
    return {
      key, label,
      years: years.map((year, yearIdx) => {
        const stat = componentsByYear[yearIdx].find((c) => c.key === key)!;
        return { year, hasData: examsByYear[yearIdx].length > 0, recordedCount: stat.recordedCount, tally: stat.tally };
      }),
    };
  });
}

function keyFindingsFor(components: ReturnType<typeof buildComponentStats>): string[] {
  const findings: string[] = [];
  for (const c of components) {
    if (!CLASSIFIED_COMPONENT_KEYS.has(c.key) || c.recordedCount < 5) continue;
    const nonNormal = c.tally.filter((t) => t.label !== "Normal").reduce((sum, t) => sum + t.count, 0);
    if (nonNormal / c.recordedCount >= 0.2) {
      findings.push(`${c.label}: ${nonNormal} of ${c.recordedCount} recorded are non-normal.`);
    }
  }
  return findings;
}

async function buildCompanyBreakdown(employees: ScopedEmployee[], year: number): Promise<CompanyBreakdown[]> {
  const byCompany = new Map<string, ScopedEmployee[]>();
  for (const e of employees) {
    const key = e.companyId ?? "__none__";
    if (!byCompany.has(key)) byCompany.set(key, []);
    byCompany.get(key)!.push(e);
  }

  const result: CompanyBreakdown[] = [];
  for (const [key, emps] of byCompany.entries()) {
    const exams = await fetchExamsForYear(emps.map((e) => e.id), year);
    const components = buildComponentStats(exams);
    result.push({
      companyId: key === "__none__" ? null : key,
      companyName: emps[0].companyName ?? "(No company)",
      headcount: emps.length,
      examined: exams.length,
      keyFindings: keyFindingsFor(components),
    });
  }
  return result.sort((a, b) => b.headcount - a.headcount);
}

async function resolveChartBranding(): Promise<ChartBranding> {
  const settings = await prisma.clinicSettings.findUnique({ where: { id: "singleton" } });
  return {
    primaryColor: settings?.primaryColor || DEFAULT_CHART_BRANDING.primaryColor,
    accentColor: settings?.accentColor || DEFAULT_CHART_BRANDING.accentColor,
  };
}

apeComprehensiveRouter.get("/ape-comprehensive/word", requireNurseOrAdmin, async (req, res) => {
  const parsed = apeComprehensiveSchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const { examYear, department, compareYears } = parsed.data;

  try {
    const resolved = await resolveReportScope(req.query);
    await assertScopeHasEmployees({ ...resolved.employeeWhere, ...(department ? { department } : {}) });

    const employees = await fetchScopedEmployees(resolved.employeeWhere, department);
    const stats = await buildStatsForPopulation(employees, examYear);

    const years = Array.from({ length: compareYears + 1 }, (_, i) => examYear - i);
    const yoyComponents = compareYears > 0 ? await buildYoyComponents(employees, years) : [];

    const includeCompanyBreakdown = parsed.data.scope === "all" || parsed.data.scope === "nonPrimary";
    const companyBreakdown = includeCompanyBreakdown ? await buildCompanyBreakdown(employees, examYear) : null;

    const [branding, chartBranding] = await Promise.all([getAppBranding(), resolveChartBranding()]);

    const children = buildApeComprehensiveDoc({
      branding, chartBranding,
      scopeLabel: resolved.scopeLabel, department, year: examYear, compareYears,
      generatedByFullName: req.currentUser!.fullName,
      stats, yoyComponents, companyBreakdown,
    });

    await writeAudit({
      req, userId: req.currentUser!.id, action: "DOWNLOAD_DOC", entityType: "ApeComprehensiveReport",
      details: { examYear, department, compareYears, scope: resolved.scopeLabel, headcount: stats.headcount, examined: stats.examined },
    });

    await sendDocx(res, `ape-comprehensive-${examYear}-${resolved.filenameToken}.docx`, children);
  } catch (err) {
    if (err instanceof ScopeError) return res.status(400).json({ error: err.message });
    throw err;
  }
});
