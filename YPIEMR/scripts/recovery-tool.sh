#!/bin/sh
# Double-clickable launcher for the recovery tool (Linux/macOS). Mark it
# executable once (chmod +x recovery-tool.sh) — most file managers then run
# it on double-click without needing a terminal open first. The eventual
# installer is expected to wrap this further (a signed .app / desktop
# shortcut) so the console window this currently opens goes away entirely.
cd "$(dirname "$0")/../server" || exit 1
npm run recovery-tool
