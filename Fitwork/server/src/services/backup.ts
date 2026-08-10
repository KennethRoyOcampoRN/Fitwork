import fs from "fs";
import path from "path";
import { DateTime } from "luxon";
import AdmZip from "adm-zip";
import { PrismaClient } from "@prisma/client";
import { config } from "../config";

// config.databasePath is the single source of truth for "where is the live
// database" — respects DATABASE_PATH/DATABASE_URL exactly the way the
// running app itself does (see config/index.ts and ../env.ts).
const SOURCE_DB_PATH = config.databasePath;

const KEEP_DAILY = 30;
const KEEP_MONTHLY = 12;

function timestamp(): string {
  return DateTime.now().toFormat("yyyyLLdd-HHmmss");
}

interface BackupSet {
  ts: string;
  dbFile: string;
  zipFile: string;
}

function listExistingBackups(): BackupSet[] {
  if (!fs.existsSync(config.backupDir)) return [];
  const files = fs.readdirSync(config.backupDir);
  const dbFiles = files.filter((f) => /^fitwork-\d{8}-\d{6}\.db$/.test(f));
  return dbFiles
    .map((f) => {
      const ts = f.replace(/^fitwork-/, "").replace(/\.db$/, "");
      return { ts, dbFile: f, zipFile: `fitwork-storage-${ts}.zip` };
    })
    .sort((a, b) => (a.ts < b.ts ? 1 : -1));
}

function pruneOldBackups(all: BackupSet[]) {
  const keep = new Set<string>();
  all.slice(0, KEEP_DAILY).forEach((b) => keep.add(b.ts));

  const seenMonths = new Set<string>();
  for (const b of all.slice(KEEP_DAILY)) {
    const month = b.ts.slice(0, 6);
    if (!seenMonths.has(month) && seenMonths.size < KEEP_MONTHLY) {
      seenMonths.add(month);
      keep.add(b.ts);
    }
  }

  for (const b of all) {
    if (!keep.has(b.ts)) {
      fs.rmSync(path.join(config.backupDir, b.dbFile), { force: true });
      fs.rmSync(path.join(config.backupDir, b.zipFile), { force: true });
    }
  }

  return { keptCount: keep.size, removedCount: all.length - keep.size };
}

async function verifyBackup(dbPath: string): Promise<{ users: number; employees: number }> {
  const backupPrisma = new PrismaClient({ datasources: { db: { url: `file:${dbPath}` } } });
  try {
    const [users, employees] = await Promise.all([backupPrisma.user.count(), backupPrisma.employee.count()]);
    return { users, employees };
  } finally {
    await backupPrisma.$disconnect();
  }
}

export interface BackupResult {
  timestamp: string;
  dbBackupPath: string;
  zipBackupPath: string;
  verifiedCounts: { users: number; employees: number };
  completedAt: string;
}

export async function runBackup(): Promise<BackupResult> {
  fs.mkdirSync(config.backupDir, { recursive: true });

  if (!fs.existsSync(SOURCE_DB_PATH)) {
    throw new Error(`Source database not found at ${SOURCE_DB_PATH}`);
  }

  const ts = timestamp();
  const dbBackupPath = path.join(config.backupDir, `fitwork-${ts}.db`);
  const zipBackupPath = path.join(config.backupDir, `fitwork-storage-${ts}.zip`);

  const sourcePrisma = new PrismaClient({ datasources: { db: { url: `file:${SOURCE_DB_PATH}` } } });
  try {
    await sourcePrisma.$executeRawUnsafe(`VACUUM INTO '${dbBackupPath.replace(/'/g, "''")}'`);
  } finally {
    await sourcePrisma.$disconnect();
  }

  if (fs.existsSync(config.storageDir)) {
    const zip = new AdmZip();
    zip.addLocalFolder(config.storageDir);
    zip.writeZip(zipBackupPath);
  } else {
    new AdmZip().writeZip(zipBackupPath);
  }

  const verifiedCounts = await verifyBackup(dbBackupPath);
  pruneOldBackups(listExistingBackups());

  const result: BackupResult = {
    timestamp: ts,
    dbBackupPath,
    zipBackupPath,
    verifiedCounts,
    completedAt: new Date().toISOString(),
  };
  fs.writeFileSync(path.join(config.backupDir, "last-backup.json"), JSON.stringify(result, null, 2));

  return result;
}

export function getLastBackupStatus(): (BackupResult & { isStale: boolean }) | null {
  const statusPath = path.join(config.backupDir, "last-backup.json");
  if (!fs.existsSync(statusPath)) return null;
  const result: BackupResult = JSON.parse(fs.readFileSync(statusPath, "utf-8"));
  const ageHours = (Date.now() - new Date(result.completedAt).getTime()) / (1000 * 60 * 60);
  return { ...result, isStale: ageHours > 48 };
}
