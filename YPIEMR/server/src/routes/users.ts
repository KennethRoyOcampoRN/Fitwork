import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, requireRole } from "../middleware/auth";
import { hashPassword, validatePasswordPolicy } from "../services/auth";
import { writeAudit } from "../services/audit";
import { ROLES } from "../config";

export const usersRouter = Router();

usersRouter.use(requireAuth, requireRole("ADMIN"));

usersRouter.get("/", async (_req, res) => {
  const users = await prisma.user.findMany({
    orderBy: { fullName: "asc" },
    select: {
      id: true, username: true, fullName: true, role: true, licenseNumber: true,
      isActive: true, mustChangePassword: true, lastLoginAt: true, createdAt: true,
    },
  });
  res.json(users);
});

const createUserSchema = z.object({
  username: z.string().min(3).max(50),
  fullName: z.string().min(1),
  role: z.enum(ROLES),
  licenseNumber: z.string().optional(),
  initialPassword: z.string().min(10),
});

usersRouter.post("/", async (req, res) => {
  const parsed = createUserSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const { username, fullName, role, licenseNumber, initialPassword } = parsed.data;

  const policyError = validatePasswordPolicy(initialPassword);
  if (policyError) return res.status(400).json({ error: policyError });

  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) return res.status(409).json({ error: "Username already exists" });

  const passwordHash = await hashPassword(initialPassword);
  const user = await prisma.user.create({
    data: { username, fullName, role, licenseNumber, passwordHash, mustChangePassword: true },
  });

  await writeAudit({ req, userId: req.currentUser!.id, action: "CREATE_USER", entityType: "User", entityId: user.id, details: { role } });

  res.status(201).json({ id: user.id, username: user.username, fullName: user.fullName, role: user.role });
});

const updateUserSchema = z.object({
  fullName: z.string().min(1).optional(),
  role: z.enum(ROLES).optional(),
  licenseNumber: z.string().optional(),
  isActive: z.boolean().optional(),
});

usersRouter.patch("/:id", async (req, res) => {
  const parsed = updateUserSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const target = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!target) return res.status(404).json({ error: "User not found" });

  const wasDeactivated = parsed.data.isActive === false && target.isActive;

  const user = await prisma.user.update({ where: { id: target.id }, data: parsed.data });

  await writeAudit({
    req, userId: req.currentUser!.id,
    action: wasDeactivated ? "DEACTIVATE_USER" : "UPDATE_USER",
    entityType: "User", entityId: user.id, details: parsed.data,
  });

  res.json({ id: user.id, username: user.username, fullName: user.fullName, role: user.role, isActive: user.isActive });
});

const resetPasswordSchema = z.object({ newPassword: z.string().min(10) });

usersRouter.post("/:id/reset-password", async (req, res) => {
  const parsed = resetPasswordSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const policyError = validatePasswordPolicy(parsed.data.newPassword);
  if (policyError) return res.status(400).json({ error: policyError });

  const target = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!target) return res.status(404).json({ error: "User not found" });

  const passwordHash = await hashPassword(parsed.data.newPassword);
  await prisma.user.update({
    where: { id: target.id },
    data: { passwordHash, mustChangePassword: true, failedLoginCount: 0, lockedUntil: null },
  });

  await writeAudit({ req, userId: req.currentUser!.id, action: "RESET_PASSWORD", entityType: "User", entityId: target.id });

  res.json({ ok: true });
});
