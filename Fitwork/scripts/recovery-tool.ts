// Thin re-export — the actual logic lives in server/src/cli/recoveryTool.ts,
// which is what the Windows installer compiles and runs directly (see
// installer/Recovery-Tool.bat / installer/FITWORK.iss) so the exact same
// code path runs whether this is invoked here via `npm run recovery-tool`
// in dev, or by the installed app's bundled node.exe with no npm/tsx
// available at all.
import "../server/src/cli/recoveryTool";
