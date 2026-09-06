import { Request, Response, NextFunction } from "express";

// Every request that reaches the API gets one line to stdout: who (if
// authenticated), what, and how it resolved. This is the only place that
// records read/list/export access — AuditLog (services/audit.ts) only
// covers explicit mutations (create/update/void/etc.), so without this
// there's no trace at all of who viewed which employee's records, ran
// which export, or hit which endpoint. In production the request logger
// requireAuth may not have run yet at the point this middleware fires, so
// req.currentUser is read from `res.on("finish")`, not up front — by then
// any auth middleware further down the chain has already set it.
//
// Written as one console.log call so it lands in the same place as
// everything else in this process's stdout: the terminal in dev, or
// server\logs\service-out.log via nssm's AppStdout redirect + AppRotateFiles
// in an installed copy (see FITWORK.iss) — no separate log file or rotation
// logic needed here.
export function requestLogger(req: Request, res: Response, next: NextFunction) {
  if (!req.path.startsWith("/api")) return next();

  const start = process.hrtime.bigint();
  res.on("finish", () => {
    const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
    const who = req.currentUser ? `${req.currentUser.username}` : "anonymous";
    console.log(
      `${new Date().toISOString()} ${req.method} ${req.originalUrl} ${res.statusCode} ${durationMs.toFixed(1)}ms user=${who} ip=${req.ip}`
    );
  });
  next();
}
