import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, requireRole } from "../middleware/auth";
import { writeAudit } from "../services/audit";

export const companiesRouter = Router();
companiesRouter.use(requireAuth);

// Every authenticated role can list companies (needed to populate the
// Company dropdown on the Add/Edit Employee form), but only ADMIN manages
// the master list — keeps company names canonical for later
// filtering/reporting instead of free-text drift. Inactive companies are
// included (callers that need active-only, like the employee form, filter
// client-side) so the admin Companies page can still show/reactivate them.
companiesRouter.get("/", async (_req, res) => {
  const companies = await prisma.company.findMany({
    orderBy: [{ isPrimary: "desc" }, { name: "asc" }],
    include: { _count: { select: { employees: true } } },
  });
  res.json(companies.map((c) => ({
    id: c.id, name: c.name, shortCode: c.shortCode, isPrimary: c.isPrimary, isActive: c.isActive,
    employeeCount: c._count.employees,
  })));
});

const createSchema = z.object({ name: z.string().min(1), shortCode: z.string().optional() });

// Finds a company by trimmed/case-insensitive name match — SQLite's UNIQUE
// index on name is case-sensitive, so "ABC Manpower" and "abc manpower"
// would otherwise both be accepted as distinct companies.
async function findByNormalizedName(name: string) {
  const all = await prisma.company.findMany({ select: { id: true, name: true } });
  return all.find((c) => c.name.trim().toLowerCase() === name.trim().toLowerCase());
}

companiesRouter.post("/", requireRole("ADMIN"), async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const name = parsed.data.name.trim();

  const existing = await findByNormalizedName(name);
  if (existing) return res.status(409).json({ error: `A company already exists with this name: "${existing.name}"` });

  // The very first company ever created becomes primary by default — every
  // deployment needs exactly one, and there's no admin-set primary yet to
  // conflict with on a fresh install.
  const anyCompanyExists = (await prisma.company.count()) > 0;

  const company = await prisma.company.create({
    data: { name, shortCode: parsed.data.shortCode?.trim() || null, isPrimary: !anyCompanyExists },
  });
  await writeAudit({ req, userId: req.currentUser!.id, action: "CREATE_COMPANY", entityType: "Company", entityId: company.id, details: { name, isPrimary: company.isPrimary } });

  res.status(201).json({ id: company.id, name: company.name, shortCode: company.shortCode, isPrimary: company.isPrimary, isActive: company.isActive, employeeCount: 0 });
});

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  shortCode: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
});

companiesRouter.patch("/:id", requireRole("ADMIN"), async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const target = await prisma.company.findUnique({ where: { id: req.params.id } });
  if (!target) return res.status(404).json({ error: "Company not found" });

  const data: { name?: string; shortCode?: string | null; isActive?: boolean } = {};
  if (parsed.data.name !== undefined) {
    const name = parsed.data.name.trim();
    const existing = await findByNormalizedName(name);
    if (existing && existing.id !== target.id) return res.status(409).json({ error: `A company already exists with this name: "${existing.name}"` });
    data.name = name;
  }
  if (parsed.data.shortCode !== undefined) data.shortCode = parsed.data.shortCode?.trim() || null;
  if (parsed.data.isActive !== undefined) {
    if (parsed.data.isActive === false && target.isPrimary) {
      return res.status(400).json({ error: "The primary company cannot be deactivated — mark a different company primary first" });
    }
    data.isActive = parsed.data.isActive;
  }

  const company = await prisma.company.update({ where: { id: target.id }, data });
  await writeAudit({ req, userId: req.currentUser!.id, action: "UPDATE_COMPANY", entityType: "Company", entityId: company.id, details: { before: target, after: company } });

  res.json({ id: company.id, name: company.name, shortCode: company.shortCode, isPrimary: company.isPrimary, isActive: company.isActive });
});

// Setting a company primary is its own endpoint (rather than a field on the
// generic PATCH) since it has a side effect on every OTHER company row —
// exactly one company may be isPrimary at a time, enforced here in a
// transaction rather than at the DB layer (SQLite/Prisma has no portable
// partial-unique-index declaration for "unique where isPrimary = true").
companiesRouter.post("/:id/set-primary", requireRole("ADMIN"), async (req, res) => {
  const target = await prisma.company.findUnique({ where: { id: req.params.id } });
  if (!target) return res.status(404).json({ error: "Company not found" });
  if (!target.isActive) return res.status(400).json({ error: "An inactive company cannot be made primary" });

  await prisma.$transaction([
    prisma.company.updateMany({ where: { isPrimary: true }, data: { isPrimary: false } }),
    prisma.company.update({ where: { id: target.id }, data: { isPrimary: true } }),
  ]);
  await writeAudit({ req, userId: req.currentUser!.id, action: "UPDATE_COMPANY", entityType: "Company", entityId: target.id, details: { setPrimary: true, name: target.name } });

  res.json({ ok: true });
});
