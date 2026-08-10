import { z } from "zod";
import { prisma } from "../lib/prisma";

// Every report in reports.ts must be scoped by company at the query layer
// (never by building from all employees and filtering the rendered output)
// — see reports.ts's docHeader subtitle lines and the report handlers for
// how this plugs in. Four scopes, replacing the old employerType-based
// "FITWORK only / All agencies / a specific agency / All employees" split
// now that companies are admin-managed rather than a hardcoded enum:
//   - "primary": the current primary company only (the default)
//   - "nonPrimary": every employee whose company is set and is NOT the
//     primary company, combined — the direct analog of the old "all
//     agencies combined" (excludes both the primary company and any
//     company-less employees, same as the old enum never had a third
//     "no employer" bucket)
//   - "company": one specific company, by id
//   - "all": every employee, regardless of company (including company-less)
export const reportScopeSchema = z.object({
  scope: z.enum(["primary", "nonPrimary", "company", "all"]).default("primary"),
  companyId: z.string().uuid().optional(),
});

export interface ResolvedScope {
  // Prisma where-clause fragment for Employee — spread into every report
  // query's employee filter (merged with department/other filters via AND,
  // never applied by filtering an already-fetched result set).
  employeeWhere: Record<string, unknown>;
  scopeLabel: string; // e.g. "ABC Manpower Agency" — shown under the report title, never as the letterhead
  filenameToken: string; // sanitized for Windows filenames
}

export class ScopeError extends Error {}

export async function resolveReportScope(query: unknown): Promise<ResolvedScope> {
  const parsed = reportScopeSchema.safeParse(query);
  if (!parsed.success) throw new ScopeError("Invalid scope");
  const { scope, companyId } = parsed.data;

  if (scope === "all") {
    return { employeeWhere: {}, scopeLabel: "All employees", filenameToken: "all-employees" };
  }

  if (scope === "company") {
    if (!companyId) throw new ScopeError("A company must be selected for this scope");
    const company = await prisma.company.findUnique({ where: { id: companyId } });
    if (!company) throw new ScopeError("Unknown company");
    return { employeeWhere: { companyId: company.id }, scopeLabel: company.name, filenameToken: sanitizeForFilename(company.name) };
  }

  const primary = await prisma.company.findFirst({ where: { isPrimary: true } });
  if (!primary) throw new ScopeError("No primary company is configured yet — set one in Admin > Companies first");

  if (scope === "nonPrimary") {
    return {
      employeeWhere: { NOT: { OR: [{ companyId: null }, { companyId: primary.id }] } },
      scopeLabel: "All non-primary companies (combined)",
      filenameToken: "non-primary-companies",
    };
  }

  // scope === "primary"
  return { employeeWhere: { companyId: primary.id }, scopeLabel: primary.name, filenameToken: sanitizeForFilename(primary.name) };
}

// Windows forbids < > : " / \ | ? * and trailing dots/spaces in filenames.
export function sanitizeForFilename(text: string): string {
  return text.replace(/[<>:"/\\|?*]/g, "").replace(/\s+/g, "-").replace(/[. ]+$/, "").slice(0, 60) || "scope";
}

// Every report must refuse to generate an empty document when the selected
// scope matches zero employees — a clear message up front instead of a
// technically-valid-but-useless empty Word/Excel file. Callers pass the
// SAME employeeWhere (merged with any other filters like department) they're
// about to use for the report's real queries, so this reflects the exact
// population that would otherwise render as "no records."
export async function assertScopeHasEmployees(employeeWhere: Record<string, unknown>): Promise<void> {
  const count = await prisma.employee.count({ where: { isActive: true, ...employeeWhere } });
  if (count === 0) throw new ScopeError("No employees match the selected scope — nothing to report.");
}
