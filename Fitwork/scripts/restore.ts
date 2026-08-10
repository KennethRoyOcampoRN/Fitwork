/**
 * Restore from a backup created by backup.ts.
 *
 * Usage:
 *   npm run restore -- --timestamp 20260728-220000
 *   npm run restore -- --latest
 *
 * This OVERWRITES the live database and /storage directory, after moving
 * the current ones aside to *.before-restore — nothing is deleted outright.
 * See docs/INSTALL.md for the full step-by-step recovery procedure.
 */
import "../server/src/env";
import fs from "fs";
import path from "path";
import readline from "readline";
import AdmZip from "adm-zip";
import { config } from "../server/src/config";

// config gives the exact same resolved paths the running app itself uses
// (respecting DATABASE_PATH/DATABASE_URL/STORAGE_DIR/BACKUP_PATH from
// server/.env) — see server/src/config/index.ts.
const LIVE_DB_PATH = config.databasePath;
const STORAGE_DIR = config.storageDir;
const BACKUP_DIR = config.backupDir;

function arg(name: string): string | undefined {
  const idx = process.argv.indexOf(`--${name}`);
  return idx >= 0 && process.argv[idx + 1] && !process.argv[idx + 1].startsWith("--") ? process.argv[idx + 1] : undefined;
}
function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (a) => { rl.close(); resolve(a); }));
}

function findLatestTimestamp(): string {
  const files = fs.readdirSync(BACKUP_DIR).filter((f) => /^fitwork-\d{8}-\d{6}\.db$/.test(f));
  if (files.length === 0) throw new Error(`No backups found in ${BACKUP_DIR}`);
  const timestamps = files.map((f) => f.replace(/^fitwork-/, "").replace(/\.db$/, "")).sort();
  return timestamps[timestamps.length - 1];
}

async function main() {
  const ts = flag("latest") ? findLatestTimestamp() : arg("timestamp");
  if (!ts) throw new Error("Specify --timestamp <yyyyMMdd-HHmmss> or --latest");

  const dbBackupPath = path.join(BACKUP_DIR, `fitwork-${ts}.db`);
  const zipBackupPath = path.join(BACKUP_DIR, `fitwork-storage-${ts}.zip`);
  if (!fs.existsSync(dbBackupPath)) throw new Error(`Backup database not found: ${dbBackupPath}`);
  if (!fs.existsSync(zipBackupPath)) throw new Error(`Backup storage archive not found: ${zipBackupPath}`);

  console.log(`About to restore from backup ${ts}:`);
  console.log(`  Database: ${dbBackupPath}`);
  console.log(`  Storage:  ${zipBackupPath}`);
  console.log(`This will replace the live database and /storage contents.`);
  console.log(`The current database and storage will be moved aside with a '.before-restore' suffix (not deleted).`);

  if (!flag("yes")) {
    const answer = await prompt("Type RESTORE to continue: ");
    if (answer.trim() !== "RESTORE") {
      console.log("Aborted.");
      return;
    }
  }

  const suffix = `.before-restore-${Date.now()}`;

  if (fs.existsSync(LIVE_DB_PATH)) {
    fs.renameSync(LIVE_DB_PATH, `${LIVE_DB_PATH}${suffix}`);
    console.log(`Moved current database aside to ${LIVE_DB_PATH}${suffix}`);
  }
  fs.copyFileSync(dbBackupPath, LIVE_DB_PATH);
  console.log(`Restored database to ${LIVE_DB_PATH}`);

  if (fs.existsSync(STORAGE_DIR)) {
    fs.renameSync(STORAGE_DIR, `${STORAGE_DIR}${suffix}`);
    console.log(`Moved current storage aside to ${STORAGE_DIR}${suffix}`);
  }
  fs.mkdirSync(STORAGE_DIR, { recursive: true });
  new AdmZip(zipBackupPath).extractAllTo(STORAGE_DIR, true);
  console.log(`Restored storage files to ${STORAGE_DIR}`);

  console.log("Restore complete. Restart the FITWORK server for changes to take effect.");
}

main().catch((e) => { console.error("Restore failed:", e.message); process.exit(1); });
