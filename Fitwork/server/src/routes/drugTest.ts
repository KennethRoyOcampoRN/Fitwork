import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, requireRole } from "../middleware/auth";
import { writeAudit } from "../services/audit";

export const drugTestRouter = Router();
drugTestRouter.use(requireAuth);

const RESULTS = ["NEGATIVE", "POSITIVE", "PENDING"] as const;

const drugTestSchema = z.object({
  employeeId: z.string().uuid(),
  testDate: z.string(),
  result: z.enum(RESULTS),
  specimenType: z.string().optional(),
  labName: z.string().optional(),
  remarks: z.string().optional(),
});

drugTestRouter.post("/", async (req, res) => {
  const parsed = drugTestSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const { employeeId, testDate, ...rest } = parsed.data;

  const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
  if (!employee) return res.status(404).json({ error: "Employee not found" });

  const test = await prisma.drugTestResult.create({
    data: { employeeId, testDate: new Date(testDate), ...rest, sourceType: "MANUAL" },
  });

  await writeAudit({ req, userId: req.currentUser!.id, action: "UPDATE_EMPLOYEE", entityType: "DrugTestResult", entityId: test.id, employeeId, details: { manualDrugTestEntry: true } });

  res.status(201).json(test);
});

drugTestRouter.get("/", async (req, res) => {
  const { employeeId } = req.query;
  if (!employeeId) return res.status(400).json({ error: "employeeId is required" });

  const tests = await prisma.drugTestResult.findMany({
    where: { employeeId: String(employeeId) },
    orderBy: { testDate: "desc" },
  });
  res.json(tests);
});

// ── Permanent delete (admin-only) ──────────────────────────────────────
const deleteSchema = z.object({ reason: z.string().min(1) });

drugTestRouter.delete("/:id", requireRole("ADMIN"), async (req, res) => {
  const parsed = deleteSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "A reason is required to permanently delete this record" });

  const test = await prisma.drugTestResult.findUnique({ where: { id: req.params.id } });
  if (!test) return res.status(404).json({ error: "Drug test result not found" });

  await writeAudit({
    req, userId: req.currentUser!.id, action: "DELETE_DRUG_TEST", entityType: "DrugTestResult", entityId: test.id, employeeId: test.employeeId,
    details: { testDate: test.testDate, result: test.result, reason: parsed.data.reason },
  });

  await prisma.drugTestResult.delete({ where: { id: test.id } });

  res.status(204).send();
});
