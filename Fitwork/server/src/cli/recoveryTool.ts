/*
 * Last-resort recovery tool: creates a fresh admin account when every
 * existing admin account's credentials are lost. Requires the recovery key
 * generated the first time this tool ever ran (shown once, never stored —
 * only its hash is kept in the database). Without the correct key, this
 * tool does nothing.
 *
 * Run with: npm run recovery-tool   (from the server/ workspace, or via the
 * double-click launcher in scripts/: recovery-tool.sh / .bat — for a dev
 * checkout with npm/tsx available)
 * Add --regenerate to retire the current recovery key and print a new one
 * without going through the create-admin flow.
 * Add --print-key-if-new to generate+print the key to stdout (no HTTP
 * server, no browser) only if one has never been generated before, and do
 * nothing otherwise — this is what the Windows installer's
 * RunPostInstallSteps calls automatically at the end of setup, since an
 * installed machine has no npm/tsx to run this interactively at all. Safe
 * to call on every install/reinstall: gated purely on whether a
 * recovery_key_hash row already exists in the database, so it never
 * regenerates (and so never silently invalidates) an existing key.
 *
 * Lives under server/src/cli/ (compiled via the normal `npm run build`,
 * alongside printLanIp.ts/setupCerts.ts/createAdmin.ts) rather than
 * scripts/, so it ships as part of server/dist and runs under the bundled
 * node.exe with no npm/tsx at all — see installer/Recovery-Tool.bat for
 * the installed-machine double-click launcher. scripts/recovery-tool.ts
 * (used by `npm run recovery-tool` in dev) is now just a thin re-export of
 * this file, so both paths share one implementation.
 *
 * Binds to 127.0.0.1 only — reachable from THIS machine's browser alone,
 * never over the LAN. Physical/console access to the server machine is the
 * intended barrier, not a password.
 */
import "../env";
import http from "http";
import crypto from "crypto";
import { exec } from "child_process";
import { PrismaClient } from "@prisma/client";
import argon2 from "argon2";

const prisma = new PrismaClient();

const PORT = Number(process.env.RECOVERY_PORT) || 7890;
const RECOVERY_KEY_SETTING = "recovery_key_hash";
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;

const COMMON_PASSWORDS = new Set(["password", "123456", "12345678", "qwerty", "abc123", "password1"]);

// Readable alphabet: no 0/O or 1/I/L, to avoid transcription mistakes when
// someone copies this off a printed page.
const KEY_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

function generateRecoveryKey(): string {
  const groups: string[] = [];
  for (let g = 0; g < 4; g++) {
    let group = "";
    for (let i = 0; i < 4; i++) {
      group += KEY_ALPHABET[crypto.randomInt(KEY_ALPHABET.length)];
    }
    groups.push(group);
  }
  return groups.join("-");
}

function normalizeKey(input: string): string {
  return input.trim().toUpperCase().replace(/\s+/g, "");
}

async function getRecoveryKeyHash(): Promise<string | null> {
  const row = await prisma.setting.findUnique({ where: { key: RECOVERY_KEY_SETTING } });
  return row?.value ?? null;
}

async function setRecoveryKeyHash(hash: string): Promise<void> {
  await prisma.setting.upsert({
    where: { key: RECOVERY_KEY_SETTING },
    create: { key: RECOVERY_KEY_SETTING, value: hash },
    update: { value: hash },
  });
}

async function issueNewRecoveryKey(reason: string): Promise<string> {
  const key = generateRecoveryKey();
  const hash = await argon2.hash(key, { type: argon2.argon2id });
  await setRecoveryKeyHash(hash);
  await prisma.auditLog.create({
    data: { action: "RECOVERY_KEY_GENERATED", detailsJson: JSON.stringify({ reason }) },
  });
  return key;
}

// Surfaces the one specific, actionable failure mode this tool has hit in
// the wild (see Recovery-Tool.bat's elevation relaunch above this file's
// call site) rather than a bare "Internal error" - the database lives
// under Program Files, so any write attempted without administrator
// rights fails with exactly this SQLite error, at whichever query happens
// to run first.
function isReadonlyDbError(err: unknown): boolean {
  const msg = String((err as any)?.message ?? err);
  return /readonly database/i.test(msg) || /SQLITE_READONLY/i.test(msg);
}

const READONLY_DB_MESSAGE =
  "Cannot write to the database - this must run as Administrator (the database lives under " +
  "Program Files, which only administrators can write to). Close this window and re-run " +
  "Recovery-Tool.bat - it will now prompt for elevation automatically - or right-click it and " +
  "choose \"Run as administrator\".";

function openBrowser(url: string) {
  const cmd = process.platform === "darwin" ? `open "${url}"`
    : process.platform === "win32" ? `cmd /c start "" "${url}"`
    : `xdg-open "${url}"`;
  exec(cmd, () => { /* best-effort — the console URL below always works as a fallback */ });
}

// Single-process, in-memory state — this tool is meant to be started,
// used once for one recovery, and stopped, not run as a long-lived service.
let verified = false;
let failedAttempts = 0;
let lockedUntil = 0;

function page(body: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>FITWORK Recovery Tool</title>
<style>
body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#0f1c2a;color:#e6edf3;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:20px;}
.card{background:#16283b;border:1px solid #2a4256;border-radius:12px;padding:32px;max-width:480px;width:100%;}
h1{font-size:18px;margin:0 0 4px;}
p.sub{color:#9db4c7;font-size:13px;margin:0 0 20px;}
input{width:100%;box-sizing:border-box;padding:10px;border-radius:6px;border:1px solid #33506a;background:#0f1c2a;color:#fff;font-size:14px;margin-bottom:10px;}
button{width:100%;padding:10px;border-radius:6px;border:none;background:#2e6f8e;color:#fff;font-size:14px;cursor:pointer;}
button:hover{background:#357ea1;}
.key{font-family:monospace;font-size:22px;letter-spacing:2px;background:#0f1c2a;border:1px solid #33506a;border-radius:8px;padding:16px;text-align:center;margin:16px 0;}
.warn{background:#3a2a0f;border:1px solid #6a4f1f;color:#f0c674;border-radius:8px;padding:12px;font-size:13px;margin-bottom:16px;}
.err{color:#f87171;font-size:13px;margin-bottom:10px;}
</style></head><body><div class="card">${body}</div></body></html>`;
}

async function handleGet(res: http.ServerResponse) {
  const existingHash = await getRecoveryKeyHash();
  if (!existingHash) {
    const key = await issueNewRecoveryKey("first_run_auto_generated");
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(page(`
      <h1>Recovery key generated</h1>
      <p class="sub">This is the ONLY time this key will ever be shown. Write it down and store it offline (printed, kept by IT/management) — never save it digitally on this machine.</p>
      <div class="key">${key}</div>
      <div class="warn">Close this tool and keep the key somewhere safe. Re-run this tool later — with this key — to create a new admin account if every admin login is ever lost.</div>
    `));
    return;
  }

  if (verified) {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(page(`
      <h1>Create a new admin account</h1>
      <p class="sub">Recovery key accepted. Set up the new admin's login below.</p>
      <form id="f">
        <input name="username" placeholder="Username" required />
        <input name="fullName" placeholder="Full name" required />
        <input name="password" type="password" placeholder="Initial password (min 10 chars)" required minlength="10" />
        <div class="err" id="err"></div>
        <button type="submit">Create admin account</button>
      </form>
      <script>
        document.getElementById('f').addEventListener('submit', async (e) => {
          e.preventDefault();
          const data = Object.fromEntries(new FormData(e.target).entries());
          const res = await fetch('/api/create-admin', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(data) });
          const body = await res.json();
          if (!res.ok) { document.getElementById('err').textContent = body.error || 'Could not create account'; return; }
          document.body.innerHTML = '<div class="card"><h1>Admin account created</h1><p class="sub">Username: ' + body.username + '. Must change password on first login.</p><div class="warn">A new recovery key was generated (the old one is now retired):</div><div class="key">' + body.newRecoveryKey + '</div><p class="sub">Store this new key offline, then close this tool.</p></div>';
        });
      </script>
    `));
    return;
  }

  const locked = lockedUntil > Date.now();
  res.writeHead(200, { "Content-Type": "text/html" });
  res.end(page(`
    <h1>FITWORK Recovery Tool</h1>
    <p class="sub">Enter the recovery key generated when this tool was first run. Without it, this tool does nothing.</p>
    <form id="f">
      <input name="key" placeholder="XXXX-XXXX-XXXX-XXXX" required ${locked ? "disabled" : ""} />
      <div class="err" id="err">${locked ? "Too many failed attempts — try again later." : ""}</div>
      <button type="submit" ${locked ? "disabled" : ""}>Verify key</button>
    </form>
    <script>
      document.getElementById('f').addEventListener('submit', async (e) => {
        e.preventDefault();
        const data = Object.fromEntries(new FormData(e.target).entries());
        const res = await fetch('/api/verify', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(data) });
        const body = await res.json();
        if (!res.ok) { document.getElementById('err').textContent = body.error || 'Incorrect key'; return; }
        location.reload();
      });
    </script>
  `));
}

async function readJsonBody(req: http.IncomingMessage): Promise<Record<string, string>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const raw = Buffer.concat(chunks).toString("utf-8");
  try { return raw ? JSON.parse(raw) : {}; } catch { return {}; }
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === "GET" && req.url === "/") {
      await handleGet(res);
      return;
    }

    if (req.method === "POST" && req.url === "/api/verify") {
      if (lockedUntil > Date.now()) {
        res.writeHead(423, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Too many failed attempts — try again later." }));
        return;
      }
      const body = await readJsonBody(req);
      const existingHash = await getRecoveryKeyHash();
      const valid = existingHash ? await argon2.verify(existingHash, normalizeKey(body.key || "")) : false;
      if (!valid) {
        failedAttempts++;
        if (failedAttempts >= MAX_ATTEMPTS) lockedUntil = Date.now() + LOCKOUT_MS;
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Incorrect recovery key." }));
        return;
      }
      verified = true;
      failedAttempts = 0;
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    if (req.method === "POST" && req.url === "/api/create-admin") {
      if (!verified) {
        res.writeHead(403, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Recovery key not verified." }));
        return;
      }
      const body = await readJsonBody(req);
      const username = (body.username || "").trim();
      const fullName = (body.fullName || "").trim();
      const password = body.password || "";

      if (!username || !fullName) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Username and full name are required." }));
        return;
      }
      if (password.length < 10) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Password must be at least 10 characters long." }));
        return;
      }
      if (COMMON_PASSWORDS.has(password.toLowerCase())) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Password is too common. Choose a stronger password." }));
        return;
      }
      const existing = await prisma.user.findUnique({ where: { username } });
      if (existing) {
        res.writeHead(409, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: `Username '${username}' already exists.` }));
        return;
      }

      const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
      const user = await prisma.user.create({
        data: { username, fullName, role: "ADMIN", passwordHash, mustChangePassword: true },
      });
      await prisma.auditLog.create({
        data: { action: "RECOVERY_ADMIN_CREATED", entityType: "User", entityId: user.id, detailsJson: JSON.stringify({ username }) },
      });

      // One-time-use key: rotate immediately so this same key can't be
      // replayed to silently create another admin later.
      const newRecoveryKey = await issueNewRecoveryKey("consumed_after_recovery_admin_created");
      verified = false;

      res.writeHead(201, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ username: user.username, newRecoveryKey }));
      return;
    }

    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found" }));
  } catch (err) {
    console.error(err);
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: isReadonlyDbError(err) ? READONLY_DB_MESSAGE : "Internal error" }));
  }
});

async function main() {
  if (process.argv.includes("--regenerate")) {
    const key = await issueNewRecoveryKey("manual_regenerate_flag");
    console.log("\nNew recovery key (shown once — store it offline):\n");
    console.log(`  ${key}\n`);
    await prisma.$disconnect();
    return;
  }

  if (process.argv.includes("--print-key-if-new")) {
    // Idempotent by design: only ever acts when no key has been generated
    // yet (gated on the recovery_key_hash row itself, not any install-time
    // or session-time flag), so calling this unconditionally on every
    // install/reinstall never regenerates — and so never silently
    // invalidates — an existing key. Prints nothing (not even a blank
    // line) when a key already exists, so the caller can tell "nothing new"
    // apart from "here's the key" by checking for empty output.
    const existingHash = await getRecoveryKeyHash();
    if (!existingHash) {
      const key = await issueNewRecoveryKey("first_run_installer_generated");
      console.log(key);
    }
    await prisma.$disconnect();
    return;
  }

  const url = `http://127.0.0.1:${PORT}/`;
  // Double-clicking Recovery-Tool.bat a second time while the first copy
  // is still open used to crash here with an unhandled EADDRINUSE stack
  // dump - the tool is meant to be run once and left open until the
  // recovery is done, and it's easy to forget it's still running behind
  // the browser window. Recognize that one specific case and just point
  // back at the already-running copy instead of a crash.
  server.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE") {
      console.log(`\nThe recovery tool is already running at ${url} - opening that instead of starting a second copy.\n`);
      openBrowser(url);
      return;
    }
    console.error(err);
    process.exit(1);
  });

  server.listen(PORT, "127.0.0.1", () => {
    console.log(`\nFITWORK Recovery Tool running at ${url}`);
    console.log("This is only reachable from this machine — not over the network.\n");
    openBrowser(url);
  });
}

main().catch((e) => {
  console.error(isReadonlyDbError(e) ? READONLY_DB_MESSAGE : e);
  process.exit(1);
});
