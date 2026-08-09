# FITWORK — Recovery guide

There are two completely different "something's broken" scenarios covered here. They have different causes and different fixes — using the wrong one wastes time, so read the scenario that matches before acting.

## Scenario A: Reinstalling on a new/repaired PC

The server machine died, got reimaged, or you're moving the clinic to new hardware. The data itself is fine; you just need it on the new machine.

**Fix:** copy the existing `data/fitwork.db` file into the fresh install's `data/` folder, in place of the empty one a fresh `npm install`/setup creates. That single file *is* the entire clinic record — logins, notes, vitals, medications, documents' index, audit log, everything (uploaded document/photo files themselves live under `storage/` — copy that folder too, or documents and photos will show as missing).

This does **not** help if the problem is forgotten credentials — the same password hashes come along with the database, so if nobody could log in before, nobody can log in after. For that, see Scenario B.

## Scenario B: Every admin account's credentials are lost

Someone forgot the admin password, the person who knew it left, or the account got locked out — and there's no other working admin login to use Admin > Users to fix it. The database itself is fine; this is purely a "how do I get back in" problem.

**Do this first, always:** if there is a second admin account (every FITWORK setup is supposed to have one — see `docs/INSTALL.md` §6), log in with that instead and reset the locked-out admin from **Admin > Users**. That's faster and doesn't touch anything below.

**If that's not possible** (every admin account is genuinely inaccessible), use the recovery-key tool.

### The recovery-key tool

`server/src/cli/recoveryTool.ts` (compiled and shipped as part of the app; `scripts/recovery-tool.ts` is the same tool via a dev-only alias) is a standalone utility, separate from the main FITWORK server, that creates one fresh admin account — but only for someone who has the recovery key.

**How it works:**

1. **First time it's ever run** (on a Windows install via the installer, this happens automatically at the end of Setup — see "Running it" below; otherwise, on initial setup, ideally right after `docs/INSTALL.md` §6), it generates a recovery key and prints it once — on-screen only. It is never written to disk or logged anywhere. **Write it down and store it offline** — printed and filed by IT/management, not saved as a file on this or any computer. If this key is lost with no admin accounts working, there is no way back in short of restoring an older backup — treat it like a physical safe combination.
2. Only a **hash** of the key is stored in the database (the same one-way hashing used for account passwords) — the key itself is never persisted anywhere the tool can read back.
3. Run the tool again whenever it's actually needed. It asks for the recovery key before doing anything else. Enter it correctly and it lets you create a new admin account (you choose the username and password) — no correct key, no admin account, no other effect.
4. **The key is single-use.** The moment it's used to create a recovery admin, the tool immediately retires it and generates a replacement, shown once the same way. Store the new one offline and destroy your record of the old one — it no longer works.

**Running it:**

- **Windows, installed via the installer:** the recovery key was already generated and shown to you in a popup at the end of Setup — that's the only time it's ever shown automatically. To actually *use* it later (create a recovery admin, or just check the tool works), double-click `Recovery-Tool.bat` in the FITWORK install folder (e.g. `C:\Program Files\FITWORK\Recovery-Tool.bat`) — a browser window opens automatically to a local page. No terminal commands to type; this runs the bundled tool directly with no npm/tsx required. **Click "Yes" on the Windows prompt that appears first** — the database lives under Program Files, which only administrators can write to, so this needs to relaunch itself elevated before it can do anything; that's expected, not a sign of a problem. (A console window will briefly appear behind the browser; that's expected too.)
- **Dev checkout (git clone, npm install):** double-click `scripts/recovery-tool.sh` (Linux/macOS — mark it executable once with `chmod +x`) or `scripts/recovery-tool.bat` (Windows), or run `npm run recovery-tool` from `server/`. Same tool, same behavior — this path needs npm/tsx present, which a dev checkout has and an installed machine doesn't.
- The page is only reachable from this machine (`127.0.0.1`) — it is never exposed over the LAN, by design. Whoever is running it has to be sitting at the actual server.
- Wrong recovery key attempts are rate-limited (locks out for 15 minutes after 5 wrong tries), same as the normal login screen.

**Why physical access alone can't create an admin account:** the recovery key is the second factor. Someone with the server machine but not the key can't do anything useful with this tool — it just sits at the "enter recovery key" screen forever. That's the whole point of keeping the key offline and separate from the machine.

**Rotating the key on demand** (e.g. after staff turnover, or just periodically): on an installed Windows machine, run `"C:\Program Files\FITWORK\vendor\node\node.exe" "C:\Program Files\FITWORK\server\dist\cli\recoveryTool.js" --regenerate` from a Command Prompt **running as Administrator** (right-click Command Prompt, "Run as administrator" — same Program-Files write restriction as `Recovery-Tool.bat` above; adjust the install path if different). In a dev checkout, `npm run recovery-tool -- --regenerate` from the `server/` folder (or `npx tsx ../scripts/recovery-tool.ts --regenerate`). Either way, this retires the current key and prints a new one without going through the admin-creation flow.

### If the recovery key itself is lost

Then this tool can't help either — nothing short of restoring from an earlier backup (`npm run restore`, see `docs/INSTALL.md`) will get you back into the system without going through the normal admin-creation path from scratch. This is why the standing second admin account (Scenario B, "do this first") and safe offline storage of the recovery key both matter — they're what keep a single lost password from becoming a full lockout.
