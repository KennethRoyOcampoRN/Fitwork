import argon2 from "argon2";
import { v4 as uuid } from "uuid";
import { DateTime } from "luxon";
import { prisma } from "../lib/prisma";
import { config } from "../config";

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

export const SESSION_COOKIE = "fitwork_sid";

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, { type: argon2.argon2id });
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  return argon2.verify(hash, password);
}

const COMMON_PASSWORDS = new Set([
  "password", "123456", "12345678", "qwerty", "abc123", "password1",
  "1234567890", "letmein", "welcome", "admin123", "iloveyou", "monkey",
]);

export function validatePasswordPolicy(password: string): string | null {
  if (password.length < 10) return "Password must be at least 10 characters long.";
  if (COMMON_PASSWORDS.has(password.toLowerCase())) return "Password is too common. Choose a stronger password.";
  return null;
}

export async function attemptLogin(username: string, password: string) {
  const user = await prisma.user.findUnique({ where: { username } });
  if (!user || !user.isActive) return { ok: false as const, reason: "invalid" as const };

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    return { ok: false as const, reason: "locked" as const, user };
  }

  const valid = await verifyPassword(user.passwordHash, password);
  if (!valid) {
    const failedLoginCount = user.failedLoginCount + 1;
    const lockedUntil =
      failedLoginCount >= MAX_FAILED_ATTEMPTS
        ? DateTime.now().plus({ minutes: LOCKOUT_MINUTES }).toJSDate()
        : null;
    await prisma.user.update({
      where: { id: user.id },
      data: { failedLoginCount, lockedUntil: lockedUntil ?? undefined },
    });
    return { ok: false as const, reason: "invalid" as const, user };
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() },
  });

  return { ok: true as const, user };
}

export async function createSession(userId: string, ip?: string, userAgent?: string) {
  const now = DateTime.now();
  const session = await prisma.session.create({
    data: {
      id: uuid(),
      userId,
      idleExpiresAt: now.plus({ hours: config.sessionIdleHours }).toJSDate(),
      expiresAt: now.plus({ hours: config.sessionAbsoluteHours }).toJSDate(),
      ipAddress: ip,
      userAgent,
    },
  });
  return session;
}

export async function getValidSession(sessionId: string) {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: { user: true },
  });
  if (!session) return null;
  const now = new Date();
  if (session.expiresAt < now || session.idleExpiresAt < now) {
    await prisma.session.delete({ where: { id: session.id } }).catch(() => {});
    return null;
  }
  if (!session.user.isActive) return null;
  // sliding idle expiry
  await prisma.session.update({
    where: { id: session.id },
    data: { idleExpiresAt: DateTime.now().plus({ hours: config.sessionIdleHours }).toJSDate() },
  });
  return session;
}

export async function destroySession(sessionId: string) {
  await prisma.session.delete({ where: { id: sessionId } }).catch(() => {});
}
