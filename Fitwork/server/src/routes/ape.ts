import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, requireRole } from "../middleware/auth";
import { writeAudit } from "../services/audit";
import { computeBmi, bmiCategory } from "../services/bmi";

export const apeRouter = Router();
apeRouter.use(requireAuth);

const FITNESS_CLASSES = ["CLASS_A", "CLASS_B", "CLASS_C", "CLASS_D", "PENDING"] as const;

const apeSchema = z.object({
  employeeId: z.string().uuid(),
  examYear: z.number().int().min(2000).max(2100),
  examDate: z.string().optional(),
  provider: z.string().optional(),
  heightCm: z.number().min(50).max(250).optional(),
  weightKg: z.number().min(2).max(400).optional(),
  bloodPressure: z.string().optional(),
  visionOD: z.string().optional(),
  visionOS: z.string().optional(),
  hearing: z.string().optional(),
  cbcResult: z.string().optional(),
  urinalysisResult: z.string().optional(),
  fecalysisResult: z.string().optional(),
  chestXrayResult: z.string().optional(),
  ecgResult: z.string().optional(),
  drugTestResult: z.string().optional(),
  hepatitisScreeningResult: z.string().optional(),
  hepaProfileResult: z.string().optional(),
  physicalExamFindings: z.string().optional(),
  otherFindings: z.string().optional(),
  significantFindings: z.string().optional(),
  recommendations: z.string().optional(),
  fitnessClassification: z.enum(FITNESS_CLASSES).optional(),
  documentId: z.string().uuid().optional(),
});
// bmi is intentionally absent — always server-computed from heightCm/weightKg, like VitalsRecord.

function computeApeBmi(heightCm?: number, weightKg?: number) {
  if (!heightCm || !weightKg) return { bmi: null as number | null };
  return { bmi: computeBmi(heightCm, weightKg) };
}

apeRouter.post("/", async (req, res) => {
  const parsed = apeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const { employeeId, examYear, examDate, ...rest } = parsed.data;

  const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
  if (!employee) return res.status(404).json({ error: "Employee not found" });

  const existing = await prisma.annualPhysicalExam.findUnique({ where: { employeeId_examYear: { employeeId, examYear } } });
  if (existing) return res.status(409).json({ error: `An APE record for ${examYear} already exists for this employee` });

  const { bmi } = computeApeBmi(rest.heightCm, rest.weightKg);

  const ape = await prisma.annualPhysicalExam.create({
    data: {
      employeeId, examYear,
      examDate: examDate ? new Date(examDate) : null,
      ...rest,
      bmi,
      sourceType: "MANUAL",
    },
  });

  await writeAudit({ req, userId: req.currentUser!.id, action: "UPDATE_EMPLOYEE", entityType: "AnnualPhysicalExam", entityId: ape.id, employeeId, details: { examYear, manualApeEntry: true } });

  res.status(201).json(ape);
});

const updateSchema = apeSchema.omit({ employeeId: true, examYear: true }).partial();

apeRouter.patch("/:id", async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const { examDate, ...rest } = parsed.data;

  const existing = await prisma.annualPhysicalExam.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: "APE record not found" });

  const heightCm = rest.heightCm ?? existing.heightCm ?? undefined;
  const weightKg = rest.weightKg ?? existing.weightKg ?? undefined;
  const { bmi } = computeApeBmi(heightCm ?? undefined, weightKg ?? undefined);

  const ape = await prisma.annualPhysicalExam.update({
    where: { id: existing.id },
    data: {
      ...rest,
      examDate: examDate ? new Date(examDate) : undefined,
      bmi,
    },
  });

  await writeAudit({ req, userId: req.currentUser!.id, action: "UPDATE_EMPLOYEE", entityType: "AnnualPhysicalExam", entityId: ape.id, employeeId: ape.employeeId, details: { examYear: ape.examYear } });

  res.json(ape);
});

apeRouter.get("/", async (req, res) => {
  const { employeeId } = req.query;
  if (!employeeId) return res.status(400).json({ error: "employeeId is required" });

  const apes = await prisma.annualPhysicalExam.findMany({
    where: { employeeId: String(employeeId) },
    orderBy: { examYear: "desc" },
  });
  res.json(apes);
});

apeRouter.get("/:id", async (req, res) => {
  const ape = await prisma.annualPhysicalExam.findUnique({
    where: { id: req.params.id },
    include: { fieldValues: true, document: { select: { id: true, title: true } } },
  });
  if (!ape) return res.status(404).json({ error: "APE record not found" });
  res.json(ape);
});

// ── Permanent delete (admin-only) ──────────────────────────────────────
const deleteSchema = z.object({ reason: z.string().min(1) });

apeRouter.delete("/:id", requireRole("ADMIN"), async (req, res) => {
  const parsed = deleteSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "A reason is required to permanently delete this record" });

  const ape = await prisma.annualPhysicalExam.findUnique({ where: { id: req.params.id } });
  if (!ape) return res.status(404).json({ error: "APE record not found" });

  await writeAudit({
    req, userId: req.currentUser!.id, action: "DELETE_APE", entityType: "AnnualPhysicalExam", entityId: ape.id, employeeId: ape.employeeId,
    details: { examYear: ape.examYear, examDate: ape.examDate, reason: parsed.data.reason },
  });

  await prisma.$transaction([
    prisma.aPEFieldValue.deleteMany({ where: { apeId: ape.id } }),
    prisma.annualPhysicalExam.delete({ where: { id: ape.id } }),
  ]);

  res.status(204).send();
});
