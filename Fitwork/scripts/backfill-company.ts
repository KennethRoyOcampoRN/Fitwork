/**
 * One-time backfill for the Company model's new isPrimary/isActive fields
 * and for employees with no company assigned. Run with:
 *   npm run backfill-company
 *
 * Employee.companyId has been a relation onto Company since the original
 * "Company + religion" phase — it was never free text on Employee itself,
 * so there's no per-employee text value to parse or normalize here. What
 * this script actually does:
 *
 *   1. Dedupe pass: merge any existing Company rows whose names are the
 *      same once trimmed and lowercased (defensive — resolveOrCreateCompany
 *      has enforced this on every write path since that phase, so this
 *      should normally find nothing, but a migration is the right place to
 *      double-check rather than assume).
 *   2. Resolve the primary company from the current admin-configured app
 *      name (ClinicSettings.appName, falling back to the same default the
 *      branding UI uses) — creating it if no company by that name exists
 *      yet, or marking an existing match primary otherwise. Exactly one
 *      company ends up isPrimary=true.
 *   3. Assign every employee with no companyId to the primary company.
 *      Employees who already reference a company are left untouched.
 *
 * Logs, per affected employee: employee code, prior company (or "None"),
 * assigned company, so the whole run can be reviewed before/after. Also
 * logs the dedupe pass's merges, if any.
 *
 * Idempotent — safe to re-run.
 */
import "../server/src/env";
import { PrismaClient } from "@prisma/client";
import { DEFAULT_APP_NAME } from "../server/src/services/appSettings";

const prisma = new PrismaClient();

async function dedupeCompanies() {
  const companies = await prisma.company.findMany({ orderBy: { createdAt: "asc" } });
  const byNormalizedName = new Map<string, typeof companies>();
  for (const c of companies) {
    const key = c.name.trim().toLowerCase();
    const group = byNormalizedName.get(key) ?? [];
    group.push(c);
    byNormalizedName.set(key, group);
  }

  let mergedCount = 0;
  for (const group of byNormalizedName.values()) {
    if (group.length < 2) continue;
    const [canonical, ...duplicates] = group; // oldest wins as canonical
    for (const dup of duplicates) {
      const moved = await prisma.employee.updateMany({ where: { companyId: dup.id }, data: { companyId: canonical.id } });
      await prisma.company.delete({ where: { id: dup.id } });
      mergedCount++;
      console.log(`Dedupe: merged "${dup.name}" (${dup.id}) into "${canonical.name}" (${canonical.id}) — moved ${moved.count} employee(s).`);
    }
  }
  if (mergedCount === 0) console.log("Dedupe: no duplicate company names found.");
  return mergedCount;
}

async function resolvePrimaryCompany(): Promise<{ id: string; name: string }> {
  const settings = await prisma.clinicSettings.findUnique({ where: { id: "singleton" } });
  const primaryName = (settings?.appName || DEFAULT_APP_NAME).trim();
  const normalized = primaryName.toLowerCase();

  const existing = await prisma.company.findFirst({ where: { name: { equals: primaryName } } });
  const match = existing ?? (await prisma.company.findMany()).find((c) => c.name.trim().toLowerCase() === normalized);

  // Make sure no OTHER company is left marked primary before assigning it.
  await prisma.company.updateMany({ where: { isPrimary: true }, data: { isPrimary: false } });

  if (match) {
    const updated = await prisma.company.update({ where: { id: match.id }, data: { isPrimary: true } });
    console.log(`Primary company: matched existing "${updated.name}" (${updated.id}) — marked isPrimary.`);
    return updated;
  }

  const created = await prisma.company.create({ data: { name: primaryName, isPrimary: true } });
  console.log(`Primary company: no match for "${primaryName}" — created new company (${created.id}) and marked isPrimary.`);
  return created;
}

async function backfillUnassignedEmployees(primary: { id: string; name: string }) {
  const unassigned = await prisma.employee.findMany({
    where: { companyId: null },
    select: { id: true, employeeCode: true, lastName: true, firstName: true },
  });

  for (const emp of unassigned) {
    await prisma.employee.update({ where: { id: emp.id }, data: { companyId: primary.id } });
    console.log(`${emp.employeeCode} (${emp.lastName}, ${emp.firstName}): None -> ${primary.name}`);
  }
  return unassigned.length;
}

async function main() {
  console.log("--- Company dedupe pass ---");
  await dedupeCompanies();

  console.log("\n--- Resolving primary company ---");
  const primary = await resolvePrimaryCompany();

  console.log("\n--- Backfilling employees with no company assigned ---");
  const backfilledCount = await backfillUnassignedEmployees(primary);

  const [totalCount, assignedCount, primaryCount] = await Promise.all([
    prisma.employee.count(),
    prisma.employee.count({ where: { companyId: { not: null } } }),
    prisma.company.count({ where: { isPrimary: true } }),
  ]);

  console.log(`\nBackfilled ${backfilledCount} employee(s) to the primary company ("${primary.name}").`);
  console.log(`Final counts: total employees=${totalCount}, with a company assigned=${assignedCount}, companies marked primary=${primaryCount}.`);
  if (assignedCount !== totalCount) {
    console.warn("WARNING: not every employee has a company assigned — investigate.");
  }
  if (primaryCount !== 1) {
    console.warn(`WARNING: expected exactly 1 primary company, found ${primaryCount} — investigate.`);
  }

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
