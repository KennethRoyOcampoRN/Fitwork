import { Router } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth, requireRole } from "../middleware/auth";

export const auditRouter = Router();

auditRouter.use(requireAuth, requireRole("ADMIN"));

async function buildWhere(query: Record<string, unknown>) {
  const { userId, action, employeeId, employeeCode, from, to } = query;
  const where: Record<string, unknown> = {};
  if (userId) where.userId = String(userId);
  if (action) where.action = String(action);
  if (employeeId) where.employeeId = String(employeeId);
  if (employeeCode) {
    const employee = await prisma.employee.findUnique({ where: { employeeCode: String(employeeCode) } });
    where.employeeId = employee ? employee.id : "__no_match__";
  }
  if (from || to) {
    where.createdAt = {
      ...(from ? { gte: new Date(String(from)) } : {}),
      ...(to ? { lte: new Date(String(to)) } : {}),
    };
  }
  return where;
}

auditRouter.get("/", async (req, res) => {
  const where = await buildWhere(req.query as Record<string, unknown>);
  const limit = req.query.limit;

  const logs = await prisma.auditLog.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit ? Math.min(Number(limit), 1000) : 200,
    include: {
      user: { select: { username: true, fullName: true } },
      employee: { select: { employeeCode: true, firstName: true, lastName: true } },
    },
  });

  res.json(logs);
});

function csvEscape(value: unknown): string {
  const s = value === null || value === undefined ? "" : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

auditRouter.get("/export.csv", async (req, res) => {
  const where = await buildWhere(req.query as Record<string, unknown>);

  const logs = await prisma.auditLog.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 10000,
    include: {
      user: { select: { username: true, fullName: true } },
      employee: { select: { employeeCode: true, firstName: true, lastName: true } },
    },
  });

  const header = ["Timestamp", "User", "Action", "Entity Type", "Entity ID", "Employee Code", "IP Address", "Details"];
  const rows = logs.map((l) => [
    l.createdAt.toISOString(),
    l.user ? `${l.user.fullName} (${l.user.username})` : "",
    l.action,
    l.entityType || "",
    l.entityId || "",
    l.employee?.employeeCode || "",
    l.ipAddress || "",
    l.detailsJson || "",
  ]);
  const csv = [header, ...rows].map((r) => r.map(csvEscape).join(",")).join("\n");

  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename="audit-log-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send(csv);
});
