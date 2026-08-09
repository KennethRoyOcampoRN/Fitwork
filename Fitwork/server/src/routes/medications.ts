import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, requireRole } from "../middleware/auth";
import { writeAudit } from "../services/audit";

export const medicationsRouter = Router();
medicationsRouter.use(requireAuth);

const createSchema = z.object({
  employeeId: z.string().uuid(),
  noteId: z.string().uuid().optional(),
  dispensedAt: z.string().optional(),
  drugName: z.string().min(1),
  strength: z.string().optional(),
  dosageForm: z.string().optional(),
  route: z.string().optional(),
  frequency: z.string().optional(),
  quantityDispensed: z.string().optional(),
  indication: z.string().optional(),
  remarks: z.string().optional(),
});

// Admin is an operational, non-clinical role and may not dispense/log
// medications (§4 role matrix) — only clinicians can.
medicationsRouter.post("/", requireRole("DOCTOR", "DENTIST", "NURSE"), async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const { dispensedAt, ...rest } = parsed.data;

  const employee = await prisma.employee.findUnique({ where: { id: rest.employeeId } });
  if (!employee) return res.status(404).json({ error: "Employee not found" });

  const log = await prisma.medicationLog.create({
    data: {
      ...rest,
      dispensedAt: dispensedAt ? new Date(dispensedAt) : new Date(),
      dispensedById: req.currentUser!.id,
    },
  });

  await writeAudit({ req, userId: req.currentUser!.id, action: "LOG_MEDICATION", entityType: "MedicationLog", entityId: log.id, employeeId: employee.id, details: { drugName: log.drugName } });

  res.status(201).json(log);
});

medicationsRouter.get("/", async (req, res) => {
  const { employeeId, from, to } = req.query;

  const where: Record<string, unknown> = {};
  if (employeeId) where.employeeId = String(employeeId);
  if (from || to) {
    where.dispensedAt = {
      ...(from ? { gte: new Date(String(from)) } : {}),
      ...(to ? { lte: new Date(String(to)) } : {}),
    };
  }

  const logs = await prisma.medicationLog.findMany({
    where,
    orderBy: { dispensedAt: "desc" },
    take: employeeId ? undefined : 500,
    include: {
      dispensedBy: { select: { fullName: true } },
      employee: { select: { employeeCode: true, firstName: true, lastName: true } },
    },
  });
  res.json(logs);
});

const archiveSchema = z.object({ reason: z.string().min(1) });

medicationsRouter.post("/:id/archive", requireRole("DOCTOR", "DENTIST", "NURSE"), async (req, res) => {
  const parsed = archiveSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "An archive reason is required" });

  const log = await prisma.medicationLog.findUnique({ where: { id: req.params.id } });
  if (!log) return res.status(404).json({ error: "Medication log entry not found" });
  if (log.isArchived) return res.status(400).json({ error: "Entry is already archived" });

  const updated = await prisma.medicationLog.update({
    where: { id: log.id },
    data: { isArchived: true, archiveReason: parsed.data.reason },
  });

  await writeAudit({ req, userId: req.currentUser!.id, action: "ARCHIVE_DOC", entityType: "MedicationLog", entityId: log.id, employeeId: log.employeeId, details: { reason: parsed.data.reason } });

  res.json(updated);
});

// ── Permanent delete (admin-only) ──────────────────────────────────────
const deleteSchema = z.object({ reason: z.string().min(1) });

medicationsRouter.delete("/:id", requireRole("ADMIN"), async (req, res) => {
  const parsed = deleteSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "A reason is required to permanently delete this entry" });

  const log = await prisma.medicationLog.findUnique({
    where: { id: req.params.id },
    include: { dispensedBy: { select: { fullName: true } } },
  });
  if (!log) return res.status(404).json({ error: "Medication log entry not found" });

  await writeAudit({
    req, userId: req.currentUser!.id, action: "DELETE_MEDICATION", entityType: "MedicationLog", entityId: log.id, employeeId: log.employeeId,
    details: { drugName: log.drugName, dispensedAt: log.dispensedAt, originalDispensedBy: log.dispensedBy.fullName, reason: parsed.data.reason },
  });

  await prisma.medicationLog.delete({ where: { id: log.id } });

  res.status(204).send();
});
