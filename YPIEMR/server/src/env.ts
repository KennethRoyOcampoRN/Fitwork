// Loads server/.env into process.env — imported as the FIRST line in every
// entry point (server/src/index.ts and every scripts/*.ts) so config
// reads and DATABASE_URL resolution are consistent everywhere, whether
// running via `tsx` (dev, scripts) or the compiled `dist/` output (prod).
//
// Before this file existed, server/.env had no real effect on the running
// app: @prisma/client happens to bundle its own dotenv and auto-loads
// server/.env internally when a PrismaClient is constructed, which
// incidentally populated DATABASE_URL — but every other key (PORT,
// TLS_KEY_PATH, STORAGE_DIR, BACKUP_DIR, ...) is read by config/index.ts
// at import time, before any PrismaClient exists, so those never picked up
// values from .env at all outside of PM2/nssm explicitly exporting them
// into the shell. This makes .env the actual, reliable source for all of
// them.
import dotenv from "dotenv";
import path from "path";

// quiet: true is documented to suppress dotenv's own promotional
// "injected env (N) from .env" banner - confirmed working here against
// the exact dotenv version this repo's lockfile pins (17.4.2) - but it was
// reported still printing on every restart in a real Windows service log
// despite this option being set exactly as documented, for a reason not
// reproduced in that testing. Rather than keep chasing a platform-specific
// dotenv quirk, silence console.log ourselves for the duration of this one
// synchronous call - independent of whatever dotenv's own option does or
// doesn't do internally. console.error/warn (actual problems, e.g. a
// missing .env file) are untouched.
const originalConsoleLog = console.log;
console.log = () => {};
try {
  dotenv.config({ path: path.resolve(__dirname, "../.env"), quiet: true });
} finally {
  console.log = originalConsoleLog;
}

// DATABASE_PATH is a friendlier alternative to Prisma's DATABASE_URL: a
// plain filesystem path (absolute recommended) instead of a `file:` URL,
// resolved relative to the server package root — not Prisma's own
// undocumented-feeling rule of resolving relative file: URLs against
// prisma/schema.prisma's directory. When set, it takes priority over
// DATABASE_URL. When unset, DATABASE_URL (if present) is used exactly as
// before — zero behavior change for anyone not using DATABASE_PATH.
if (process.env.DATABASE_PATH) {
  const resolved = path.isAbsolute(process.env.DATABASE_PATH)
    ? process.env.DATABASE_PATH
    : path.resolve(__dirname, "..", process.env.DATABASE_PATH);
  process.env.DATABASE_URL = `file:${resolved}`;
}
