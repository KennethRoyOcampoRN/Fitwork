import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, requireRole } from "../middleware/auth";
import { writeAudit } from "../services/audit";

export const labTestTypesRouter = Router();
labTestTypesRouter.use(requireAuth);

// Every authenticated role can list test types (needed to populate the Lab
// Test dropdown on an employee's record), but only ADMIN manages the master
// list — same convention as companies.ts. Inactive types are included so
// the admin management page can still show/reactivate them; the Lab Test
// form filters to active ones client-side.
labTestTypesRouter.get("/", async (_req, res) => {
  const types = await prisma.labTestType.findMany({ orderBy: { name: "asc" } });
  res.json(types);
});

async function findByNormalizedName(name: string) {
  const all = await prisma.labTestType.findMany({ select: { id: true, name: true } });
  return all.find((t) => t.name.trim().toLowerCase() === name.trim().toLowerCase());
}

const createSchema = z.object({ name: z.string().min(1) });

labTestTypesRouter.post("/", requireRole("ADMIN"), async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const name = parsed.data.name.trim();

  const existing = await findByNormalizedName(name);
  if (existing) return res.status(409).json({ error: `A test type already exists with this name: "${existing.name}"` });

  const type = await prisma.labTestType.create({ data: { name } });
  await writeAudit({ req, userId: req.currentUser!.id, action: "CREATE_TEST_TYPE", entityType: "LabTestType", entityId: type.id, details: { name } });

  res.status(201).json(type);
});

const updateSchema = z.object({ name: z.string().min(1).optional(), isActive: z.boolean().optional() });

labTestTypesRouter.patch("/:id", requireRole("ADMIN"), async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const target = await prisma.labTestType.findUnique({ where: { id: req.params.id } });
  if (!target) return res.status(404).json({ error: "Test type not found" });

  const data: { name?: string; isActive?: boolean } = {};
  if (parsed.data.name !== undefined) {
    const name = parsed.data.name.trim();
    const existing = await findByNormalizedName(name);
    if (existing && existing.id !== target.id) return res.status(409).json({ error: `A test type already exists with this name: "${existing.name}"` });
    data.name = name;
  }
  if (parsed.data.isActive !== undefined) data.isActive = parsed.data.isActive;

  const type = await prisma.labTestType.update({ where: { id: target.id }, data });
  await writeAudit({ req, userId: req.currentUser!.id, action: "UPDATE_TEST_TYPE", entityType: "LabTestType", entityId: type.id, details: { before: target, after: type } });

  res.json(type);
});
