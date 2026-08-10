import { Request, Response, NextFunction } from "express";
import { getValidSession, SESSION_COOKIE } from "../services/auth";
import { Role } from "../config";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      currentUser?: {
        id: string;
        username: string;
        fullName: string;
        role: Role;
        mustChangePassword: boolean;
      };
      sessionId?: string;
    }
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const sessionId = req.cookies?.[SESSION_COOKIE];
  if (!sessionId) return res.status(401).json({ error: "Not authenticated" });

  const session = await getValidSession(sessionId);
  if (!session) {
    res.clearCookie(SESSION_COOKIE);
    return res.status(401).json({ error: "Session expired" });
  }

  req.currentUser = {
    id: session.user.id,
    username: session.user.username,
    fullName: session.user.fullName,
    role: session.user.role as Role,
    mustChangePassword: session.user.mustChangePassword,
  };
  req.sessionId = session.id;
  next();
}

export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.currentUser) return res.status(401).json({ error: "Not authenticated" });
    if (!roles.includes(req.currentUser.role)) {
      return res.status(403).json({ error: "Forbidden: insufficient role" });
    }
    next();
  };
}
