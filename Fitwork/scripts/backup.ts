/**
 * Nightly backup CLI: SQLite `VACUUM INTO` a timestamped copy + zip of
 * /storage, written to BACKUP_DIR. Keeps 30 daily + 12 monthly copies and
 * verifies each new backup by opening it and counting rows.
 *
 * Run with: npm run backup   (schedule nightly at 22:00 — see docs/INSTALL.md
 * for Windows Task Scheduler setup). Also invocable from the admin UI via
 * POST /api/backup/run, which calls the same server/src/services/backup.ts.
 */
import "../server/src/env";
import { runBackup } from "../server/src/services/backup";

runBackup()
  .then((r) => { console.log("Backup complete:", r); process.exit(0); })
  .catch((e) => { console.error("Backup failed:", e); process.exit(1); });
