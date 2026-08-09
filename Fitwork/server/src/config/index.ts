import path from "path";

function num(name: string, def: number): number {
  const v = process.env[name];
  return v ? Number(v) : def;
}

const databaseUrl = process.env.DATABASE_URL || "file:../../data/fitwork.db";

export const config = {
  nodeEnv: process.env.NODE_ENV || "development",
  port: num("PORT", 8443),
  // standalone (default): bind to localhost only, no LAN exposure.
  // server: bind to all interfaces so other PCs on the LAN can connect.
  // Switching is just an env change + restart — no data migration.
  serverMode: (process.env.SERVER_MODE === "server" ? "server" : "standalone") as "standalone" | "server",
  selfEditWindowMinutes: num("SELF_EDIT_WINDOW_MINUTES", 15),
  sessionIdleHours: num("SESSION_IDLE_HOURS", 8),
  sessionAbsoluteHours: num("SESSION_ABSOLUTE_HOURS", 12),
  tlsKeyPath: process.env.TLS_KEY_PATH || "./certs/dev-key.pem",
  tlsCertPath: process.env.TLS_CERT_PATH || "./certs/dev-cert.pem",
  storageDir: path.resolve(__dirname, "../../", process.env.STORAGE_DIR || "../storage"),
  backupDir: path.resolve(__dirname, "../../", process.env.BACKUP_PATH || "../data/backups"),
  // The resolved absolute path to the live SQLite file — single source of
  // truth for "where is the database", used by the startup reachability
  // check below and by the backup/restore scripts (which used to each
  // independently re-derive this same path). Prisma resolves a *relative*
  // file: URL against prisma/schema.prisma's own directory, not the server
  // root — this replicates that rule for the legacy DATABASE_URL-only case.
  // When DATABASE_PATH is set (see ../env.ts), DATABASE_URL is already an
  // absolute file: URL by the time this runs, and path.resolve's own
  // right-to-left short-circuiting on an absolute segment makes the
  // "../../prisma" prefix below a no-op in that case.
  databasePath: path.resolve(__dirname, "../../prisma", databaseUrl.replace(/^file:/, "")),
  maxUploadBytes: 25 * 1024 * 1024,
};

export const ROLES = ["ADMIN", "DOCTOR", "DENTIST", "NURSE"] as const;
export type Role = (typeof ROLES)[number];
