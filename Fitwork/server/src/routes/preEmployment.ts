import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, requireRole } from "../middleware/auth";
import { writeAudit } from "../services/audit";
import { computeBmi } from "../services/bmi";

export const preEmploymentRouter = Router();
preEmploymentRouter.use(requireAuth);

const FITNESS_CLASSES = ["CLASS_A", "CLASS_B", "CLASS_C", "CLASS_D", "PENDING"] as const;

const preEmploymentSchema = z.object({
  employeeId: z.string().uuid(),
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
  pregnancyTestResult: z.string().optional(),
  medicalHistory: z.string().optional(),
  physicalExamFindings: z.string().optional(),
  otherFindings: z.string().optional(),
  significantFindings: z.string().optional(),
  recommendations: z.string().optional(),
  fitnessClassification: z.enum(FITNESS_CLASSES).optional(),
});
// bmi is intentionally absent — always server-computed from heightCm/weightKg, like AnnualPhysicalExam/VitalsRecord.

preEmploymentRouter.post("/", async (req, res) => {
  const parsed = preEmploymentSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const { employeeId, examDate, ...rest } = parsed.data;

  const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
  if (!employee) return res.status(404).json({ error: "Employee not found" });

  const bmi = rest.heightCm && rest.weightKg ? computeBmi(rest.heightCm, rest.weightKg) : null;

  const exam = await prisma.preEmploymentExam.create({
    data: {
      employeeId,
      examDate: examDate ? new Date(examDate) : null,
      ...rest,
      bmi,
      sourceType: "MANUAL",
    },
  });

  await writeAudit({ req, userId: req.currentUser!.id, action: "UPDATE_EMPLOYEE", entityType: "PreEmploymentExam", entityId: exam.id, employeeId, details: { manualPreEmploymentEntry: true } });

  res.status(201).json(exam);
});

preEmploymentRouter.get("/", async (req, res) => {
  const { employeeId } = req.query;
  if (!employeeId) return res.status(400).json({ error: "employeeId is required" });

  const exams = await prisma.preEmploymentExam.findMany({
    where: { employeeId: String(employeeId) },
    orderBy: { createdAt: "desc" },
  });
  res.json(exams);
});

// ── Permanent delete (admin-only) ──────────────────────────────────────
const deleteSchema = z.object({ reason: z.string().min(1) });

preEmploymentRouter.delete("/:id", requireRole("ADMIN"), async (req, res) => {
  const parsed = deleteSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "A reason is required to permanently delete this record" });

  const exam = await prisma.preEmploymentExam.findUnique({ where: { id: req.params.id } });
  if (!exam) return res.status(404).json({ error: "Pre-employment exam not found" });

  await writeAudit({
    req, userId: req.currentUser!.id, action: "DELETE_PRE_EMPLOYMENT", entityType: "PreEmploymentExam", entityId: exam.id, employeeId: exam.employeeId,
    details: { examDate: exam.examDate, reason: parsed.data.reason },
  });

  await prisma.preEmploymentExam.delete({ where: { id: exam.id } });

  res.status(204).send();
});
