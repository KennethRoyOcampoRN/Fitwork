import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, requireRole } from "../middleware/auth";
import { writeAudit } from "../services/audit";

export const dentalRouter = Router();
dentalRouter.use(requireAuth);

// Extensible without a schema rewrite — status is a plain string column
// (see schema.prisma), so adding e.g. "FILLED"/"CROWN"/"ROOT_CANAL" later is
// just adding a value here, not a migration.
export const TOOTH_STATUSES = ["HEALTHY", "MISSING", "CARIES"] as const;

// Universal Numbering System, 1-32. Kept as the single place that knows the
// numbering scheme — swapping to FDI two-digit notation later only means
// changing this constant and the client's tooth-position layout, not the
// schema or the rest of the route.
const TOTAL_TEETH = 32;

// Only DENTIST may edit tooth status — every other role (including ADMIN)
// gets read-only access to the chart, same as how medication logging
// excludes ADMIN elsewhere in this app: clinical actions are reserved for
// the role that actually performs them.
const requireDentist = requireRole("DENTIST");

dentalRouter.get("/employee/:employeeId", async (req, res) => {
  const { employeeId } = req.params;
  const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
  if (!employee) return res.status(404).json({ error: "Employee not found" });

  const records = await prisma.toothRecord.findMany({
    where: { employeeId },
    include: { updatedBy: { select: { fullName: true } } },
  });
  const byNumber = new Map(records.map((r) => [r.toothNumber, r]));

  // Every tooth is represented even if it has no row yet — the chart always
  // shows the full mouth, defaulting unrecorded teeth to HEALTHY.
  const teeth = Array.from({ length: TOTAL_TEETH }, (_, i) => {
    const toothNumber = i + 1;
    const record = byNumber.get(toothNumber);
    return record
      ? { toothNumber, status: record.status, notes: record.notes, updatedBy: record.updatedBy.fullName, updatedAt: record.updatedAt }
      : { toothNumber, status: "HEALTHY" as const, notes: null, updatedBy: null, updatedAt: null };
  });

  res.json({ teeth });
});

const updateSchema = z.object({
  status: z.enum(TOOTH_STATUSES),
  notes: z.string().nullable().optional(),
});

dentalRouter.put("/employee/:employeeId/tooth/:toothNumber", requireDentist, async (req, res) => {
  const { employeeId } = req.params;
  const toothNumber = Number(req.params.toothNumber);
  if (!Number.isInteger(toothNumber) || toothNumber < 1 || toothNumber > TOTAL_TEETH) {
    return res.status(400).json({ error: `Tooth number must be between 1 and ${TOTAL_TEETH}` });
  }

  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
  if (!employee) return res.status(404).json({ error: "Employee not found" });

  const before = await prisma.toothRecord.findUnique({ where: { employeeId_toothNumber: { employeeId, toothNumber } } });

  const record = await prisma.toothRecord.upsert({
    where: { employeeId_toothNumber: { employeeId, toothNumber } },
    create: { employeeId, toothNumber, status: parsed.data.status, notes: parsed.data.notes ?? null, updatedById: req.currentUser!.id },
    update: { status: parsed.data.status, notes: parsed.data.notes, updatedById: req.currentUser!.id },
    include: { updatedBy: { select: { fullName: true } } },
  });

  await writeAudit({
    req, userId: req.currentUser!.id, action: "UPDATE_TOOTH_RECORD",
    entityType: "ToothRecord", entityId: record.id, employeeId,
    details: {
      toothNumber,
      before: before ? { status: before.status, notes: before.notes } : { status: "HEALTHY", notes: null },
      after: { status: record.status, notes: record.notes },
    },
  });

  res.json({ toothNumber, status: record.status, notes: record.notes, updatedBy: record.updatedBy.fullName, updatedAt: record.updatedAt });
});
