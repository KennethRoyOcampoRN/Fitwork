# FITWORK Windows Installer

Produces a single `FITWORK-Setup-<version>.exe` that a non-technical admin
can run with zero terminal use: bundles a portable Node.js runtime and the
built app, installs FITWORK as a Windows Service (auto-starts on boot, no
visible console window), and walks through a Standalone vs. Server mode
picker on first run.

**Status: written and reviewed, not yet compiled or run.** This was
developed in a Linux sandbox with no Windows machine, no Inno Setup, and
no way to install/test a real Windows Service, firewall rule, or power
setting. `FITWORK.iss`'s Pascal Script follows Inno Setup's documented API
as precisely as reasonably possible from specification, and every piece
that *could* be verified without Windows was (see "What's actually been
verified" below) — but the installer itself needs a real compile-and-run
pass on Windows before it's trustworthy. Expect to fix forward from
whatever `ISCC.exe` reports on the first attempt, and please report back
what breaks so it can be fixed quickly.

## Building

On a **Windows** machine, with:
- Node.js + npm on PATH (any recent version — this builds the app; the
  portable runtime bundled into the installer is a separately-downloaded,
  pinned version, not whatever's on this machine)
- [Inno Setup 6](https://jrsoftware.org/isinfo.php) installed

```powershell
cd installer
.\build.ps1
```

This builds the client and server, stages a production-only copy of
`server/node_modules` (`npm ci --omit=dev`, scoped to just the server
workspace — see the comments at the top of `build.ps1` for exactly why a
naive `cd server && npm ci` doesn't work here, since this is an npm
workspaces monorepo with a single root-level lockfile), downloads a
pinned, checksum-verified portable Node.js runtime and nssm, and compiles
`FITWORK.iss`. Output: `installer\dist\FITWORK-Setup-<version>.exe`.

## What's actually been verified (in the Linux sandbox this was built in)

- `server/src/cli/printLanIp.ts` (what the wizard shells out to for the
  detected LAN address) compiles and runs correctly, including the
  no-adapter-found fallback.
- The underlying `detectLanIp()` adapter-preference logic (server vs. a
  virtual/VPN adapter) — see PR #25 — was independently verified against
  a mocked multi-adapter scenario matching a real reported case.
- The npm-workspaces staging approach (`npm ci --omit=dev
  --workspace=server` against a scratch copy of the repo) was run for
  real: confirmed it installs `prisma` (moved to a real dependency for
  exactly this reason — see the root commit that touches
  `server/package.json`), excludes `tsx`/`typescript`, and never touches
  `client`'s own dependencies.
- `server/dist/index.js`'s existing static-file resolution
  (`../../client/dist` relative to itself) was cross-checked against
  where `build.ps1` stages the client bundle and where `FITWORK.iss`'s
  `[Files]` section installs it — these have to line up exactly
  (`{app}\client\dist`, not `{app}\client`) and one already didn't in an
  earlier draft of this script; fixed and re-checked.

## What has NOT been verified — needs a real Windows machine or VM

Everything below needs manual confirmation:

- [ ] `build.ps1` actually runs end to end and produces a `.exe`
- [ ] The installer runs, requests UAC elevation, and completes without
      `ISCC`/Inno Setup runtime errors
- [x] **Standalone mode, confirmed live**: Server Options page correctly
      skipped, startup banner reads "Standalone (this PC only)", LAN
      unreachable from another device, localhost works.
- [x] **Server mode, confirmed live end to end**: service starts,
      `SERVER_MODE=server` correct in both `.env` and the startup banner,
      `fitwork.db` created in `{app}\data\`, primary admin created by the
      wizard, login works with a password containing `%`, `&`, `\`, `"`,
      and a space, LAN access confirmed from another device at
      `http://<LAN IP>:8443`. Not yet tested: the wizard's detected-LAN-IP
      label on a machine that actually has a VPN/Hyper-V/WSL virtual
      adapter present, to exercise the adapter-preference logic for real
      (only the single-adapter case has been confirmed); `netsh advfirewall
      firewall show rule name="FITWORK"` actually showing the rule added;
      power settings changed as expected (`powercfg /query` or Settings >
      Power, standby/hibernate off).
- [ ] The desktop shortcut opens the default browser to the right URL
- [ ] "Set Up HTTPS" Start Menu shortcut: with mkcert already installed
      separately, running it generates `server\certs\dev-key.pem` /
      `dev-cert.pem`, and restarting the service (via `services.msc`)
      picks it up (`https://localhost:8443` should then work; check
      `server\logs\service-out.log` for "listening (HTTPS)" vs "(HTTP)")
- [x] Uninstalling: the "delete database, backups, and logs?" prompt
      appears; choosing Yes correctly clears `data\` and `storage\`
      (confirmed live — fresh timestamps, no stale content).
      `server\logs\` has gone through two rounds this PR: first, the
      uninstaller's own `DelTree({app}\server\logs)` wasn't actually
      taking effect (stale content survived a reinstall despite a fresh
      file timestamp) - fixed by adding a second `DelTree` for the same
      path at the start of the next install's `RunPostInstallSteps`, before
      that install's own service exists to hold anything open. That fix
      then caused **bug #16**: `[Dirs]` only creates `server\logs` during
      the file-copy phase, which already ran by the time
      `RunPostInstallSteps` (`ssPostInstall`) executes, so deleting it
      there with nothing after to recreate it left nssm with nowhere to
      write `AppStdout`/`AppStderr` - confirmed live: service `Running`,
      `AppStdout` correctly configured, but `server\logs\` didn't exist at
      all and nothing was being logged, silently (the app itself was
      unaffected - nssm just has nowhere to redirect output, it doesn't
      fail the service over it). Fixed by adding `ForceDirectories` for
      the same path immediately after that `DelTree`. Not yet tested:
      defaults to **No** on Enter; both choices' service/firewall removal;
      a full uninstall(Yes) → reinstall cycle producing both a clean *and
      present* `server\logs\service-out.log`.
- [ ] Re-running the installer over an existing install *without*
      uninstalling first (upgrade path). Confirmed live in two rounds:
      first, this died hard during file extraction (`DeleteFile failed;
      code 5. Access is denied.` on `vendor\node\node.exe`, still open by
      the running service) - #18, fixed via `PrepareToInstall` stopping
      and removing the existing service before file copy starts. That fix
      then exposed #19: with file copy now succeeding, install instead
      died at "Creating your admin account... failed (exit code 1)",
      leaving files and a database but no service - the surviving
      `fitwork.db` from the previous install already has an `admin` user,
      and `createAdmin.js` hit a unique-constraint violation trying to
      create it again. Fixed by detecting an existing `{app}\data\fitwork.db`
      before either the wizard asks for admin details (`ShouldSkipPage`
      now also skips the two admin-account pages) or
      `RunPostInstallSteps` tries to create one - the recovery-key step
      still runs regardless, since it was already idempotent. Also added:
      `createAdmin.ts` now logs any failure (message/stack only, never the
      password) to `server\logs\admin-setup-error.log`, and strips a
      leading BOM before `JSON.parse` - found live that a critical
      `RunStep` failure gave the operator nothing but an exit code to
      work with, since `RunStep` doesn't capture output and this call
      deliberately avoids the cmd.exe-redirect trick used elsewhere in
      this file (this call's Params carries the operator's own password
      verbatim - piping that through a shell would reintroduce exactly
      the corruption risk that trick exists to avoid elsewhere). Not yet
      re-tested: confirm a reinstall over an existing install now
      completes without prompting for or attempting to create an admin
      account, and that the existing database and its admin accounts
      still work unchanged afterward.
- [x] **Recovery-key flow, confirmed live (Server mode)**: the installer's
      end-of-Setup popup showed a real key; `Recovery-Tool.bat`,
      double-clicked as a standard user, now self-elevates via UAC and the
      full flow succeeds — key accepted, admin created, old key retired,
      replacement key shown (#15, fixed this round); a second
      `Recovery-Tool.bat` double-click while the first copy is still
      running now opens that copy instead of crashing with `EADDRINUSE`
      (#14, fixed this round). Not yet re-tested: re-running the installer
      over an existing install does NOT show the popup again since a key
      already exists; `Setup-HTTPS.bat`'s equivalent self-elevation (same
      fix, not yet exercised live).
- [ ] The admin-account wizard's validation messages (blank required
      field, <10-char password, mismatched confirmation, a backup
      username matching the primary's, a partially-filled backup group)
      and logging in with the **backup** admin's credentials specifically
      (only the primary has been confirmed so far) — backup-group-left-
      blank has not been exercised either. **#17, fixed this round**: the
      backup admin's fields used to be unreachable — with the primary
      fields filled in, the backup admin's full name/password/confirm
      fields fell below the fold of the single "Create Admin Accounts"
      page with no scrollbar, making the feature unusable through the
      wizard despite validating and saving correctly under the hood. Split
      into two wizard pages (primary admin, then an optional "Create a
      Backup Admin Account" page) so each page's 4 fields fit without
      scrolling — needs a fresh live test of the whole flow, not just the
      items already listed above.
- [ ] The startup log no longer printing dotenv's "injected env (N) from
      .env" banner — reported still appearing despite `quiet: true`
      already being set; root cause not reproduced locally (this repo's
      pinned dotenv version was confirmed, via direct testing, to honor
      `quiet: true` correctly here). Fixed this round by suppressing
      `console.log` directly around that one call instead of relying on
      dotenv's own option — needs a real Windows restart to confirm it
      actually addresses whatever caused the difference there.

If you have access to a Windows VM (even a throwaway one — Windows
Sandbox, a fresh Hyper-V/VirtualBox VM, or similar), that's the fastest
way to work through this checklist. A machine with a VPN client or WSL2
installed is specifically useful for the adapter-preference item above,
since that's exactly the scenario the fix in PR #25 and this installer's
LAN-detection page were built to handle correctly.

## Known limitations / things to revisit later

- The admin-creation temp JSON (`{tmp}\fitwork-admin-input.json`) is still
  deleted on failure, not left in place for inspection, even though that
  was asked for directly while diagnosing #19 - it contains the operator's
  chosen password in plaintext, and leaving it sitting in `%TEMP%`
  indefinitely after a failed install would reopen exactly the exposure
  the `--input-file` mechanism was built to avoid in the first place (see
  `createAdmin.ts`'s own top comment). `createAdmin.ts` now writes its own
  failure diagnostics to `server\logs\admin-setup-error.log` instead -
  message and stack only, never the password - which was enough to
  pinpoint #19's actual cause in testing.
- `nssm.cc` doesn't publish a checksums file the way nodejs.org does, so
  the nssm download in `build.ps1` is only verified by being fetched over
  HTTPS from the official site — not checksum-verified like the Node
  runtime is. If you have a known-good hash for the pinned version,
  add verification the same way.
- Data (`data\`, `storage\`) lives under `{app}` (Program Files) rather
  than `%ProgramData%`. This matches the existing convention from
  `docs/INSTALL.md`/PR #24 and is fine for a small single-clinic
  deployment — confirmed live that both Standalone and Server mode install
  identically as a Windows Service (nssm defaults to running it as
  LocalSystem for both; nothing here sets a per-mode ObjectName), so both
  have full write access to `{app}\data` regardless of which mode was
  picked. This did cause one real, confirmed failure: `Recovery-Tool.bat`
  and `Setup-HTTPS.bat` both run as the interactive user (not the service's
  LocalSystem account), and Program Files denies write access to standard
  users — `Recovery-Tool.bat` failed with `SqliteError: attempt to write a
  readonly database` until re-run elevated. Both `.bat` launchers now
  self-elevate (relaunch via a UAC prompt if not already running as
  admin), and `recoveryTool.ts` recognizes this specific SQLite error and
  reports "must run as Administrator" instead of a bare "Internal error" —
  see `docs/RECOVERY.md`. That's a band-aid, not a structural fix: a
  stricter "Program Files should be read-only" enterprise policy would
  still want this moved to `%ProgramData%\FITWORK` instead, which would
  make both launchers work unelevated too. Not done here (yet) to avoid
  re-verifying `DATABASE_PATH`/`BACKUP_PATH` and every already-tested
  install path all over again this late in the PR.
- ~~No guard against installing over an already-registered `FITWORK`
  service.~~ Fixed (#18): confirmed live this was no longer hypothetical -
  installing over an existing install without uninstalling first died
  during file extraction (`DeleteFile failed; code 5. Access is denied.`
  on `vendor\node\node.exe`, still open by the running service). Added
  `PrepareToInstall`, an Inno Setup hook that runs once right before file
  copy begins, which stops and removes any existing `FITWORK` service found
  at `{app}` first. Untested on real Windows yet - see the checklist
  above.
- The mode-picker screen only covers what PR B asked for (Standalone vs.
  Server, firewall, power settings). It doesn't yet offer to configure a
  custom install path for the database/backups beyond the fixed defaults,
  or let the admin pick a non-default port.
- ~~The admin-account wizard page collected one admin, not the standing
  second admin `docs/RECOVERY.md` Scenario B calls the "do this first,
  always" path.~~ Fixed: the same page now also collects a backup admin's
  username/full name/password (optional as a group — leave the backup
  username blank to skip, same as answering "n" to `createAdmin.ts`'s own
  interactive prompt for it). Untested on real Windows yet — see the
  checklist above.
- Neither place a recovery key gets shown — the installer's end-of-Setup
  `MsgBox`, or `recoveryTool.ts`'s HTML "here's your replacement key" page
  after a recovery — has a Copy or Print button or any confirmation gate
  before it can be dismissed, and dismissing either is unrecoverable per
  `docs/RECOVERY.md`: there's no way to display the same key again.
  Confirmed in live testing that this is a real gap, not just a
  theoretical one — worst on the `recoveryTool.ts` page, since that one is
  shown mid-crisis (every admin login already lost) rather than during a
  calm first-time setup. Both need a Copy-to-clipboard button, a Print
  option, and an "I've recorded this key" checkbox gating dismissal —
  not yet implemented.
- Recovery-key generation failures reported via the summary `MsgBox` and
  the recovery flow's own JSON errors did not distinguish a permission
  failure from any other error until this round — see the Program
  Files / `%ProgramData%` item above for the concrete bug this caused and
  the fix applied (self-elevating `.bat` launchers, a specific "must run
  as Administrator" message instead of "Internal error", and graceful
  handling of a second `Recovery-Tool.bat` instance instead of an
  `EADDRINUSE` crash).
