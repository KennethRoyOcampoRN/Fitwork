import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import { writeAudit } from "../services/audit";
import { CATEGORIES } from "./documents";

// Category-scoped classification labels for MedicalDocument (e.g. "CBC"
// under LABORATORY, "Panoramic X-ray" under DENTAL) — a standard combobox
// "pick existing or create new" flow, so any authenticated clinical role
// can add one on the spot while uploading, not a separate admin-gated
// step (unlike the old LabTestType admin page it replaces the spirit of).
export const documentLabelsRouter = Router();
documentLabelsRouter.use(requireAuth);

documentLabelsRouter.get("/", async (req, res) => {
  const parsed = z.object({ category: z.enum(CATEGORIES) }).safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: "A valid category is required" });

  const labels = await prisma.documentLabel.findMany({
    where: { category: parsed.data.category },
    orderBy: { name: "asc" },
  });
  res.json(labels);
});

async function findByNormalizedName(category: string, name: string) {
  const all = await prisma.documentLabel.findMany({ where: { category }, select: { id: true, name: true, category: true } });
  return all.find((l) => l.name.trim().toLowerCase() === name.trim().toLowerCase());
}

const createSchema = z.object({ category: z.enum(CATEGORIES), name: z.string().min(1) });

// Get-or-create rather than strict create+409: this backs a combobox where
// "type a new option" should just work, including when two people create
// the same label at nearly the same moment — the second call returns the
// first call's row instead of erroring.
documentLabelsRouter.post("/", async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const { category, name } = parsed.data;
  const trimmed = name.trim();

  const existing = await findByNormalizedName(category, trimmed);
  if (existing) return res.json(existing);

  const label = await prisma.documentLabel.create({ data: { category, name: trimmed } });
  await writeAudit({ req, userId: req.currentUser!.id, action: "CREATE_DOCUMENT_LABEL", entityType: "DocumentLabel", entityId: label.id, details: { category, name: trimmed } });

  res.status(201).json(label);
});
