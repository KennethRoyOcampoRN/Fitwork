import { Router } from "express";
import { execFile } from "child_process";
import { requireAuth, requireRole } from "../middleware/auth";
import { writeAudit } from "../services/audit";
import { runBackup, getLastBackupStatus } from "../services/backup";
import { config } from "../config";

export const backupRouter = Router();
backupRouter.use(requireAuth, requireRole("ADMIN"));

backupRouter.get("/status", (_req, res) => {
  res.json({ backupDir: config.backupDir, lastBackup: getLastBackupStatus() });
});

backupRouter.post("/run", async (req, res) => {
  try {
    const result = await runBackup();
    await writeAudit({ req, userId: req.currentUser!.id, action: "BACKUP_RUN", entityType: "Backup", details: { ...result } });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Backup failed" });
  }
});

// Best-effort only: opens the backup folder in the OS file browser ON THE
// SERVER MACHINE, so it only produces a visible window when this process
// has an interactive desktop session (e.g. running `npm start` at a
// console) — it silently does nothing useful when running as a headless
// Windows service (nssm) or a PM2 background process with no desktop
// session. The client always shows the raw path as selectable text too,
// so the manual-copy workflow this button is meant to speed up never
// actually depends on it working.
backupRouter.post("/open-folder", (req, res) => {
  const dir = config.backupDir;
  const command = process.platform === "win32" ? "explorer" : process.platform === "darwin" ? "open" : "xdg-open";
  execFile(command, [dir], () => {
    // Intentionally ignore the callback's error/exit code: `explorer` on
    // Windows routinely reports a non-zero exit even on success, and a
    // failure here (no desktop session) is expected in some deployments,
    // not a real error to surface — the response already tells the client
    // this was best-effort.
  });
  res.json({ attempted: true, backupDir: dir });
});
