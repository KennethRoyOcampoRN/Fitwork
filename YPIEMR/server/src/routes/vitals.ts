import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, requireRole } from "../middleware/auth";
import { writeAudit } from "../services/audit";
import { computeBmi, bmiCategory } from "../services/bmi";

export const vitalsRouter = Router();
vitalsRouter.use(requireAuth);

const vitalsSchema = z.object({
  employeeId: z.string().uuid(),
  heightCm: z.number().min(50).max(250).optional(),
  weightKg: z.number().min(2).max(400).optional(),
  systolic: z.number().int().min(40).max(300).optional(),
  diastolic: z.number().int().min(20).max(200).optional(),
  pulseRate: z.number().int().min(20).max(250).optional(),
  respiratoryRate: z.number().int().min(5).max(80).optional(),
  temperatureC: z.number().min(25).max(45).optional(),
  oxygenSaturation: z.number().int().min(50).max(100).optional(),
  remarks: z.string().optional(),
});
// bmi / bmiCategory are intentionally absent from the schema — the client
// can never set them; they are always server-computed below.

vitalsRouter.post("/", async (req, res) => {
  const parsed = vitalsSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const data = parsed.data;

  const employee = await prisma.employee.findUnique({ where: { id: data.employeeId } });
  if (!employee) return res.status(404).json({ error: "Employee not found" });

  let bmi: number | null = null;
  let category: string | null = null;
  if (data.heightCm && data.weightKg) {
    bmi = computeBmi(data.heightCm, data.weightKg);
    category = bmiCategory(bmi);
  }

  const record = await prisma.vitalsRecord.create({
    data: {
      employeeId: data.employeeId,
      recordedById: req.currentUser!.id,
      heightCm: data.heightCm,
      weightKg: data.weightKg,
      bmi,
      bmiCategory: category,
      systolic: data.systolic,
      diastolic: data.diastolic,
      pulseRate: data.pulseRate,
      respiratoryRate: data.respiratoryRate,
      temperatureC: data.temperatureC,
      oxygenSaturation: data.oxygenSaturation,
      remarks: data.remarks,
    },
  });

  await writeAudit({ req, userId: req.currentUser!.id, action: "RECORD_VITALS", entityType: "VitalsRecord", entityId: record.id, employeeId: data.employeeId });

  res.status(201).json(record);
});

vitalsRouter.get("/employee/:employeeId", async (req, res) => {
  const records = await prisma.vitalsRecord.findMany({
    where: { employeeId: req.params.employeeId },
    orderBy: { recordedAt: "desc" },
    include: { recordedBy: { select: { fullName: true } } },
  });
  res.json(records);
});

// ── Permanent delete (admin-only) ──────────────────────────────────────
const deleteSchema = z.object({ reason: z.string().min(1) });

vitalsRouter.delete("/:id", requireRole("ADMIN"), async (req, res) => {
  const parsed = deleteSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "A reason is required to permanently delete this record" });

  const record = await prisma.vitalsRecord.findUnique({
    where: { id: req.params.id },
    include: { recordedBy: { select: { fullName: true } } },
  });
  if (!record) return res.status(404).json({ error: "Vitals record not found" });

  await writeAudit({
    req, userId: req.currentUser!.id, action: "DELETE_VITALS", entityType: "VitalsRecord", entityId: record.id, employeeId: record.employeeId,
    details: { recordedAt: record.recordedAt, originalRecordedBy: record.recordedBy.fullName, reason: parsed.data.reason },
  });

  await prisma.vitalsRecord.delete({ where: { id: record.id } });

  res.status(204).send();
});
