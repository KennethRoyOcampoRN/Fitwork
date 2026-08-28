import { Router } from "express";
import { z } from "zod";
import rateLimit from "express-rate-limit";
import { prisma } from "../lib/prisma";
import {
  attemptLogin, createSession, destroySession, SESSION_COOKIE, SESSION_COOKIE_OPTIONS,
  hashPassword, validatePasswordPolicy, verifyPassword,
} from "../services/auth";
import { writeAudit } from "../services/audit";
import { requireAuth } from "../middleware/auth";
import { config } from "../config";

export const authRouter = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip || "unknown",
});

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

authRouter.post("/login", loginLimiter, async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid request" });
  const { username, password } = parsed.data;

  const result = await attemptLogin(username, password);
  if (!result.ok) {
    await writeAudit({
      req,
      userId: result.user?.id ?? null,
      action: "LOGIN_FAILED",
      entityType: "User",
      details: { username, reason: result.reason },
    });
    if (result.reason === "locked") {
      return res.status(423).json({ error: "Account locked due to too many failed attempts. Try again later." });
    }
    return res.status(401).json({ error: "Invalid username or password" });
  }

  const session = await createSession(result.user.id, req.ip, req.headers["user-agent"]);
  res.cookie(SESSION_COOKIE, session.id, {
    ...SESSION_COOKIE_OPTIONS,
    maxAge: config.sessionAbsoluteHours * 60 * 60 * 1000,
  });

  await writeAudit({ req, userId: result.user.id, action: "LOGIN", entityType: "User", entityId: result.user.id });

  res.json({
    id: result.user.id,
    username: result.user.username,
    fullName: result.user.fullName,
    role: result.user.role,
    mustChangePassword: result.user.mustChangePassword,
  });
});

authRouter.post("/logout", requireAuth, async (req, res) => {
  if (req.sessionId) await destroySession(req.sessionId);
  res.clearCookie(SESSION_COOKIE, SESSION_COOKIE_OPTIONS);
  await writeAudit({ req, userId: req.currentUser?.id, action: "LOGOUT" });
  res.json({ ok: true });
});

authRouter.get("/me", requireAuth, async (req, res) => {
  res.json(req.currentUser);
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(10),
});

authRouter.post("/change-password", requireAuth, async (req, res) => {
  const parsed = changePasswordSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid request" });
  const { currentPassword, newPassword } = parsed.data;

  const user = await prisma.user.findUnique({ where: { id: req.currentUser!.id } });
  if (!user) return res.status(404).json({ error: "User not found" });

  const valid = await verifyPassword(user.passwordHash, currentPassword);
  if (!valid) return res.status(401).json({ error: "Current password is incorrect" });

  const policyError = validatePasswordPolicy(newPassword);
  if (policyError) return res.status(400).json({ error: policyError });

  const passwordHash = await hashPassword(newPassword);
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash, mustChangePassword: false },
  });

  await writeAudit({ req, userId: user.id, action: "UPDATE_USER", entityType: "User", entityId: user.id, details: { selfPasswordChange: true } });

  res.json({ ok: true });
});
