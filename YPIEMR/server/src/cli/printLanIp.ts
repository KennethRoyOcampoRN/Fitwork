// Tiny standalone entry point invoked by the Windows installer's wizard
// (installer/FITWORK.iss) to show the admin what LAN address other PCs will
// connect to, during the Server-mode setup page. Deliberately reuses the
// exact same detectLanIp() the running app itself uses for its startup log
// (see server/src/index.ts) rather than reimplementing adapter-preference
// logic in Pascal Script — the installer just shells out to
// `node dist/cli/printLanIp.js` and reads stdout.
//
// Prints exactly one line: the detected IP, or the literal string "NONE"
// if nothing could be detected (the installer checks for that sentinel
// rather than parsing for emptiness, since empty stdout is ambiguous with
// "the command failed entirely").
//
// This file gets loaded from two different directory layouts, so the
// require below can't be a normal static "../lib/network" import:
//   - Normal install (server\dist\cli\printLanIp.js): network.js sits in
//     ..\lib\, mirroring the source tree, same as every other module here.
//   - Installer wizard-time use (see FITWORK.iss's [Files] dontcopy entries
//     and ExtractTemporaryFile calls): Inno Setup extracts dontcopy files
//     flat into {tmp} regardless of the DestDir given in [Files] — found
//     live, as "ExtractTemporaryFile: file not found" for a DestName that
//     included a subdirectory prefix. With both files landing as plain
//     siblings in {tmp}, network.js has to be reached as "./network"
//     instead. Try the normal nested layout first, fall back to the flat
//     one — never the reverse, so a normal install never pays for this.
let detectLanIp: () => string | null;
try {
  detectLanIp = require("../lib/network").detectLanIp;
} catch {
  detectLanIp = require("./network").detectLanIp;
}

const ip = detectLanIp();
console.log(ip ?? "NONE");
