/* Run with: npm run create-admin -- --username admin --fullName "Clinic Admin" --password "ChangeMe12345"
 *
 * When this creates the very first admin account, it also offers to create
 * a second, standing backup admin in the same run — a real production setup
 * step, not just a documentation reminder to run this script twice. Skip it
 * with --skip-backup, or supply it non-interactively with
 * --backupUsername/--backupFullName/--backupPassword.
 *
 * Lives under server/src/cli/ (compiled via the normal `npm run build`,
 * alongside printLanIp.ts/setupCerts.ts) rather than scripts/, so it ships
 * as part of server/dist and runs under the Windows installer's bundled
 * node.exe with no npm/tsx available at all — see
 * installer/FITWORK.iss's admin-account wizard page and RunPostInstallSteps.
 * scripts/create-admin.ts (used by `npm run create-admin` in dev) is now
 * just a thin re-export of this file, so both paths share one
 * implementation.
 *
 * --input-file <path>: reads {username, fullName, password} — optionally
 * also backupUsername/backupFullName/backupPassword, same meaning as the
 * argv flags of the same name — as JSON from a file instead of
 * --username/--fullName/--password/--backupUsername/etc. This is what the
 * installer uses instead — a plain --password argv value sits in this
 * process's command line for the life of the call, visible to any other
 * user on the machine via Task Manager/tasklist/Process Explorer with no
 * special privilege needed, which matters on a shared clinic PC in a way
 * it doesn't on a single developer's own machine (the argv flags stay
 * documented and supported for that manual/dev case). True stdin would
 * avoid this the same way with even less on disk, but Inno Setup's Exec()
 * has no stdin-piping parameter at all - the installer deletes the input
 * file immediately after this call returns either way.
 */
import "../env";
import fs from "fs";
import path from "path";
import readline from "readline";
import { PrismaClient } from "@prisma/client";
import argon2 from "argon2";

const prisma = new PrismaClient();

function arg(name: string): string | undefined {
  const idx = process.argv.indexOf(`--${name}`);
  return idx >= 0 ? process.argv[idx + 1] : undefined;
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (answer) => { rl.close(); resolve(answer); }));
}

const COMMON_PASSWORDS = new Set(["password", "123456", "12345678", "qwerty", "abc123"]);

function validatePassword(password: string) {
  if (password.length < 10) throw new Error("Password must be at least 10 characters.");
  if (COMMON_PASSWORDS.has(password.toLowerCase())) throw new Error("Password is too common.");
}

async function createAdmin(opts: { username: string; fullName: string; password: string }) {
  validatePassword(opts.password);

  const existing = await prisma.user.findUnique({ where: { username: opts.username } });
  if (existing) throw new Error(`User '${opts.username}' already exists.`);

  const passwordHash = await argon2.hash(opts.password, { type: argon2.argon2id });
  return prisma.user.create({
    data: { username: opts.username, fullName: opts.fullName, role: "ADMIN", passwordHash, mustChangePassword: true },
  });
}

interface FileCredentials {
  username: string;
  fullName: string;
  password: string;
  backupUsername?: string;
  backupFullName?: string;
  backupPassword?: string;
}

function readCredentialsFromFile(filePath: string): FileCredentials {
  // Strip a leading BOM before parsing - this repo has hit BOM-related
  // parse failures twice already (Windows text editors/PowerShell's
  // Out-File default to UTF-8-with-BOM), and JSON.parse rejects a raw BOM
  // byte outright rather than skipping it.
  let raw = fs.readFileSync(filePath, "utf-8");
  if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);
  const parsed = JSON.parse(raw);
  if (!parsed.username || !parsed.fullName || !parsed.password) {
    throw new Error("--input-file must contain JSON with username, fullName, and password.");
  }
  return parsed;
}

async function main() {
  const isFirstAdminEver = (await prisma.user.count({ where: { role: "ADMIN" } })) === 0;

  const inputFile = arg("input-file");
  let username: string;
  let fullName: string;
  let password: string;
  let fileCreds: FileCredentials | undefined;

  if (inputFile) {
    fileCreds = readCredentialsFromFile(inputFile);
    ({ username, fullName, password } = fileCreds);
  } else {
    username = arg("username") || (await prompt("Admin username: "));
    fullName = arg("fullName") || (await prompt("Admin full name: "));
    password = arg("password") || (await prompt("Initial password (min 10 chars): "));
  }

  const primary = await createAdmin({ username, fullName, password });
  console.log(`Admin account created: ${primary.username} (${primary.id}). Must change password on first login.`);

  if (!isFirstAdminEver) return; // Not initial setup — a backup admin should already exist.
  if (hasFlag("skip-backup")) return;

  // Same file-over-argv preference as the primary account's own credentials
  // above, and for the same reason — the installer's admin-account wizard
  // page passes these through --input-file too when a backup admin was
  // filled in, rather than leaving a second password sitting in argv.
  const backupUsername = fileCreds?.backupUsername ?? arg("backupUsername");
  const backupFullName = fileCreds?.backupFullName ?? arg("backupFullName");
  const backupPassword = fileCreds?.backupPassword ?? arg("backupPassword");

  if (backupUsername && backupFullName && backupPassword) {
    const backup = await createAdmin({ username: backupUsername, fullName: backupFullName, password: backupPassword });
    console.log(`Backup admin account created: ${backup.username} (${backup.id}). Must change password on first login.`);
    return;
  }

  if (!process.stdin.isTTY) {
    console.warn(
      "\nNo second admin account was created (non-interactive run with no --backupUsername/--backupFullName/--backupPassword given).\n" +
      "This is the ONLY admin account — create a standing backup as soon as possible:\n" +
      "  npm run create-admin -- --username admin2 --fullName \"Backup Clinic Admin\" --password \"...\"\n" +
      "(This warning only applies to the very first admin ever created — see docs/INSTALL.md §6.)\n"
    );
    return;
  }

  const answer = (await prompt(
    "\nThis is the only admin account. Create a second, standing backup admin now? " +
    "Strongly recommended — it's your way back in if this account's credentials are ever lost. [Y/n]: "
  )).trim().toLowerCase();
  if (answer === "n" || answer === "no") {
    console.log("Skipped. You can create a backup admin later via Admin > Users, or by re-running this script.");
    return;
  }

  const backupUsernameInput = (await prompt("Backup admin username [admin2]: ")) || "admin2";
  const backupFullNameInput = (await prompt("Backup admin full name [Backup Clinic Admin]: ")) || "Backup Clinic Admin";
  const backupPasswordInput = await prompt("Backup admin initial password (min 10 chars): ");

  const backup = await createAdmin({ username: backupUsernameInput, fullName: backupFullNameInput, password: backupPasswordInput });
  console.log(`Backup admin account created: ${backup.username} (${backup.id}). Must change password on first login.`);
}

// Besides the usual console.error, also append to a log file under
// server\logs\ - found live (#19) that a critical failure here gave the
// installer operator nothing but "exit code 1" to work with, since
// RunStep (installer\FITWORK.iss) doesn't capture a launched process's
// stdout/stderr and this call deliberately avoids the cmd.exe-redirect
// trick used elsewhere in that file (this call's Params carries the
// operator's own password verbatim - piping it through a shell would risk
// exactly the kind of corruption that redirect trick is meant to avoid).
// Writing our own log from inside the process sidesteps that entirely,
// and e.message/e.stack never include the password itself - only usernames
// and error text, e.g. "User 'admin' already exists."
function logFailure(e: unknown): void {
  try {
    const logDir = path.resolve(__dirname, "../../logs");
    fs.mkdirSync(logDir, { recursive: true });
    const message = e instanceof Error ? (e.stack ?? e.message) : String(e);
    fs.appendFileSync(path.join(logDir, "admin-setup-error.log"), `[${new Date().toISOString()}] ${message}\n`);
  } catch {
    // Best-effort - the console.error below is the fallback if even this fails.
  }
}

main()
  .catch((e) => {
    console.error(e.message);
    logFailure(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
