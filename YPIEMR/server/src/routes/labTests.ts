import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, requireRole } from "../middleware/auth";
import { writeAudit } from "../services/audit";

export const labTestsRouter = Router();
labTestsRouter.use(requireAuth);

const RESULT_STATUSES = ["NORMAL", "ABNORMAL", "PENDING"] as const;

const labTestSchema = z.object({
  employeeId: z.string().uuid(),
  testType: z.string().min(1),
  datePerformed: z.string(),
  findings: z.string().optional(),
  resultStatus: z.enum(RESULT_STATUSES),
});

labTestsRouter.post("/", async (req, res) => {
  const parsed = labTestSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const { employeeId, datePerformed, ...rest } = parsed.data;

  const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
  if (!employee) return res.status(404).json({ error: "Employee not found" });

  const test = await prisma.labTestResult.create({
    data: { employeeId, datePerformed: new Date(datePerformed), ...rest, orderedById: req.currentUser!.id, sourceType: "MANUAL" },
    include: { orderedBy: { select: { fullName: true } } },
  });

  await writeAudit({ req, userId: req.currentUser!.id, action: "CREATE_LAB_TEST", entityType: "LabTestResult", entityId: test.id, employeeId, details: { testType: test.testType, resultStatus: test.resultStatus } });

  res.status(201).json(test);
});

labTestsRouter.get("/", async (req, res) => {
  const { employeeId } = req.query;
  if (!employeeId) return res.status(400).json({ error: "employeeId is required" });

  const tests = await prisma.labTestResult.findMany({
    where: { employeeId: String(employeeId) },
    orderBy: { datePerformed: "desc" },
    include: { orderedBy: { select: { fullName: true } } },
  });
  res.json(tests);
});

// ── Permanent delete (admin-only) ──────────────────────────────────────
const deleteSchema = z.object({ reason: z.string().min(1) });

labTestsRouter.delete("/:id", requireRole("ADMIN"), async (req, res) => {
  const parsed = deleteSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "A reason is required to permanently delete this record" });

  const test = await prisma.labTestResult.findUnique({ where: { id: req.params.id } });
  if (!test) return res.status(404).json({ error: "Lab test result not found" });

  await writeAudit({
    req, userId: req.currentUser!.id, action: "DELETE_LAB_TEST", entityType: "LabTestResult", entityId: test.id, employeeId: test.employeeId,
    details: { testType: test.testType, datePerformed: test.datePerformed, reason: parsed.data.reason },
  });

  await prisma.labTestResult.delete({ where: { id: test.id } });

  res.status(204).send();
});
