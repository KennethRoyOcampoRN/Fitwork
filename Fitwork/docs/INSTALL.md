# FITWORK — Installation guide

FITWORK runs entirely on a local machine/server over the office LAN. No internet connection is required at runtime.

**Windows, and don't want to use a terminal at all?** Use the installer instead of everything below — see `installer/README.md`. It bundles its own Node.js runtime, installs FITWORK as a Windows Service (auto-starts on boot, no console window), and walks through a Standalone-vs-Server mode picker with GUI dialogs only. This guide covers the manual/developer setup (any OS, or Windows without the installer).

## 1. Prerequisites

- Node.js 20 LTS (https://nodejs.org)
- [mkcert](https://github.com/FiloSottile/mkcert) — for generating a browser-trusted HTTPS certificate (required for the webcam photo-capture feature on any host other than `localhost`)

## 2. Install dependencies

```
npm install
```

This installs both `/server` and `/client` (npm workspaces).

## 3. Configure environment

```
cp server/.env.example server/.env
```

Edit `server/.env` as needed — in particular `DATABASE_PATH`, `STORAGE_DIR`, and `BACKUP_PATH`. The app/company name shown in the UI and on PDF chart exports is set from **Admin > Settings > Branding** after first login, not from an environment variable.

Key settings:

- **`DATABASE_PATH`** — where the SQLite database file lives, resolved relative to the `server/` directory (or use an absolute path). **Must be on local disk** — never a network share (SMB/NFS/mapped drive). SQLite's file locking is not safe over network filesystems and can silently corrupt data under concurrent access. The server checks this path at startup and fails with a clear message (not a cryptic crash) if it's unreachable.
- **`BACKUP_PATH`** — where nightly/on-demand backups are written, also local disk only. The admin manually copies files from here to any offsite destination (see §10) — the app never writes backups directly to a network location.
- **`SERVER_MODE`** — `standalone` (default: this PC only, no LAN exposure) or `server` (other PCs on the LAN can connect — see §8). Switching is just this value + a restart, no data migration.

## 4. Generate the HTTPS certificate (mkcert)

Browsers block `getUserMedia` (webcam) on plain HTTP for any host except `localhost`. If you're running in `SERVER_MODE=server` (§8), clinic PCs will reach the server by LAN IP or hostname, so a real (locally-trusted) certificate covering that address is required — `npm run setup:certs` below already generates one that covers the machine's LAN IP automatically, regardless of `SERVER_MODE`, so this step doesn't need to be repeated when switching modes later.

On the **server machine**, with mkcert already installed:

```
npm run setup:certs
```

This installs the mkcert local CA, auto-detects the machine's LAN IP, and writes `server/certs/dev-key.pem`/`dev-cert.pem` covering `localhost`, `127.0.0.1`, and that IP. Pass any extra hostname(s) you intend to use as arguments, e.g. `npm run setup:certs -- clinic-server.local`. If it can't auto-detect a LAN IP, it'll tell you and you can re-run it with the IP passed explicitly the same way.

Equivalent manual command, if you'd rather run mkcert yourself:

```
mkcert -install
mkdir -p server/certs
mkcert -key-file server/certs/dev-key.pem -cert-file server/certs/dev-cert.pem localhost 127.0.0.1 <server-LAN-IP> clinic-server.local
```

Replace `<server-LAN-IP>` with the machine's actual LAN IP (e.g. `192.168.1.50`), and add any hostname you intend to use.

On **each client PC** that will access FITWORK, install the mkcert root CA so the browser trusts the certificate:

1. Copy `$(mkcert -CAROOT)/rootCA.pem` from the server to the client machine (USB drive or network share — no internet needed).
2. Windows: double-click the `.pem`/`.crt` file → "Install Certificate" → "Local Machine" → "Trusted Root Certification Authorities".
3. Restart the browser.

Without this step, browsers will show a certificate warning and the webcam feature will be blocked.

## 5. Set up the database

```
cd server
npx prisma migrate deploy
```

This creates `data/fitwork.db` (SQLite, at the repo root — not inside `/server`) and applies all migrations.

> **Note:** this reads `DATABASE_PATH` (or, if unset, the legacy `DATABASE_URL`) from `server/.env` — see §3. The shipped default is already correct for the top-level `/data` layout described in this doc. If you relocate the database, use `DATABASE_PATH` rather than `DATABASE_URL` directly: it's resolved relative to the `server/` directory (or use an absolute path), avoiding Prisma's own less obvious rule of resolving a relative `DATABASE_URL` against `server/prisma/schema.prisma` instead.

## 5a. (Optional) Load demo/evaluation data

To populate the app with realistic-looking demo data for evaluation (never run this in production):

```
cd server
npm run seed
```

This creates 2 admins (a primary + a standing backup), 2 doctors, 1 dentist, 3 nurses, 40 employees across 5 departments (with placeholder photos), plus vitals history, clinical notes, medications, documents, and 3 years of APE records. All seeded accounts share the password printed at the end of the script's output — it is intentionally simple and must never be used outside a demo/evaluation environment.

## 6. Create the first admin account (and a standing backup)

The very first admin account has to be created via this CLI script, run on the server machine, since there's no admin session yet to use the web UI with:

```
npm run create-admin
```

Follow the prompts (or pass `--username --fullName --password`). The admin must change their password on first login.

**The script itself will then offer to create a second, standing backup admin account in the same run** — this only happens the very first time (when no admin account exists yet), and is strongly recommended: say yes and set a distinct username/password for it (or accept the suggested `admin2`). Keep its credentials somewhere separate from the primary admin's. This gives you a working way back into the system if the primary admin's credentials are ever lost, without needing the recovery-key tool described in `docs/RECOVERY.md` — reserve that tool for the case where every admin account is locked out.

Running this non-interactively (e.g. from an install script)? Pass the backup account's details up front so nothing is left to a prompt: `npm run create-admin -- --username admin --fullName "Clinic Admin" --password "..." --backupUsername admin2 --backupFullName "Backup Clinic Admin" --backupPassword "..."`. Add `--skip-backup` instead if you intend to create the second admin some other way. If none of those are passed and the run isn't interactive, the script skips the backup and prints a warning rather than hanging on a prompt — don't rely on that path; pass the flags.

## 7. Build and run

Development (two terminals):

```
npm run dev:server     # https://localhost:8443 (or the LAN IP, if SERVER_MODE=server)
npm run dev:client     # https://localhost:5173 (proxies /api to the server)
```

Production (single process, single port):

```
npm run build
npm start
```

This builds the client into `client/dist` and the server into `server/dist`, then runs the compiled server, which serves the built React app and the API from the same HTTPS port (default `8443`) — there is no separate Vite dev server in production, and no dev-only behavior (CORS allowances, hot-reload) carries over: both are gated on `NODE_ENV`/build-output checks, not manually disabled.

At startup, the server logs its current mode (`standalone` or `server`, see §3) and, in `server` mode, the LAN address to connect from. It also checks that the configured database is reachable and fails immediately with a clear message rather than crashing on the first request if it isn't (see §3).

## 8. Access from other PCs on the LAN

Set `SERVER_MODE=server` in `server/.env` (§3) and restart — this binds the server to all network interfaces instead of `localhost` only. In the default `standalone` mode, the server is not reachable from other machines at all, by design.

From any other machine on the network (with the mkcert root CA installed, step 4):

```
https://<server-LAN-IP>:8443
```

## 9. Running as a Windows service

Use PM2 with `pm2-windows-service`, or Task Scheduler with "run at startup". A sample PM2 config is provided at `ecosystem.config.js` in the repo root.

**Option A — PM2 (recommended):**

```
npm install -g pm2 pm2-windows-startup pm2-windows-service
npm run build
pm2 start ecosystem.config.js
pm2 save
pm2-startup install
```

This runs FITWORK as a background service that restarts automatically on crash or server reboot. To check status: `pm2 status` / `pm2 logs fitwork`.

**Option B — NSSM (Non-Sucking Service Manager):**

If you'd rather have a native Windows service (visible in `services.msc`) instead of a PM2-managed process:

```
nssm install FITWORK "C:\Program Files\nodejs\node.exe" "server\dist\index.js"
nssm set FITWORK AppDirectory "C:\path\to\Fitwork"
nssm set FITWORK AppEnvironmentExtra NODE_ENV=production
nssm start FITWORK
```

## 10. Backups

Nightly backups (`scripts/backup.ts`) create a consistent SQLite copy via `VACUUM INTO` plus a zip of `/storage`, written to `BACKUP_PATH` (default `data/backups` at the repo root — see §3 and `server/.env`). This must be local disk, same as the database — the app never writes backups directly to a network destination; copying to an offsite location (e.g. a shared HRD drive) is a manual step for the admin, made low-friction by the **Backup folder location** section on the admin dashboard's **Backup** tab, which shows the resolved path with a "Copy path" button and an "Open backups folder" button. That button is best-effort: it opens the folder in the OS file browser on the server machine itself, which only produces a visible window when the server process has an interactive desktop session (e.g. running via `npm start` at a console) — it does nothing visible when running as a headless Windows service or background PM2 process, in which case copy the path shown and navigate there manually. Each backup is verified by opening the copy and counting rows before it's kept. Retention: 30 daily + 12 monthly copies.

**Schedule it nightly at 22:00** using Windows Task Scheduler:

1. Task Scheduler → Create Task → Trigger: Daily at 22:00.
2. Action: Start a program → Program: `node` (or the full path to `node.exe`) → Arguments: pointing at a small wrapper that runs `npm run backup` from the `server` directory, e.g. a `.bat` file:
   ```bat
   cd /d C:\path\to\Fitwork\server
   npm run backup >> C:\path\to\Fitwork\data\backups\backup.log 2>&1
   ```
3. Point the Task Scheduler action at that `.bat` file.

The admin dashboard's **Backup** tab shows the last successful backup and turns red if it's more than 48 hours old, and has a "Run backup now" button for on-demand backups.

## 11. Restoring from a backup

`scripts/restore.ts` is a CLI-only, interactive-by-default operation — it is **not** exposed in the admin UI, since restoring while the app is live editing the same files is unsafe. Recovery procedure:

1. Stop the FITWORK server (and PM2/the Windows service, if running).
2. From the `server` directory, list available backups in `BACKUP_PATH` (files are named `fitwork-<timestamp>.db` / `fitwork-storage-<timestamp>.zip`).
3. Run:
   ```
   npm run restore -- --timestamp <yyyyMMdd-HHmmss>
   # or, to restore the most recent backup:
   npm run restore -- --latest
   ```
4. Confirm by typing `RESTORE` when prompted (or pass `--yes` to skip the prompt in a scripted recovery).
5. The script moves the *current* database and `/storage` aside with a `.before-restore-<timestamp>` suffix rather than deleting them — nothing is lost if the restore itself needs to be undone.
6. Restart the server.

## 12. LAN smoke test checklist

Before considering a deployment production-ready, verify from **a second machine** on the same LAN (not the server itself):

- [ ] The mkcert root CA is installed on the client machine (step 4) and the browser shows no certificate warning at `https://<server-LAN-IP>:8443`.
- [ ] Login works and a search for an employee code returns a result in under 3 seconds.
- [ ] Webcam photo capture works (requires the valid HTTPS certificate from step 4 — it will silently fail on an untrusted or missing cert).
- [ ] A document uploads, previews inline, and downloads correctly.
- [ ] Disconnect the server machine's internet connection (leave the LAN connection intact) and confirm the app behaves identically — nothing should break, since FITWORK makes no external calls.
