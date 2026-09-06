@echo off
REM Optional, double-click convenience wrapper around the bundled
REM setupCerts CLI (see server\src\cli\setupCerts.ts) - generates a
REM LAN-trusted HTTPS certificate via mkcert, which must already be
REM installed separately (https://github.com/FiloSottile/mkcert#installation).
REM A fresh Server-mode install already runs this automatically (via the
REM bundled vendor\mkcert\mkcert.exe - see FITWORK.iss's
REM SetupHttpsForServerMode) - use this shortcut afterwards instead, e.g. to
REM regenerate the certificate once this PC's LAN IP changes, or to add an
REM extra hostname; it still needs mkcert on PATH separately, unlike the
REM automatic install-time step, since it isn't wired to the bundled copy.
REM Not required for FITWORK to run: HTTP works correctly for LAN access as
REM of the fixes in PR #25 - this only matters if you need webcam photo
REM capture to work from PCs other than this one.
REM
REM Needs administrator rights: certificates are written to server\certs,
REM which lives under Program Files and only administrators can write to
REM (same root cause as Recovery-Tool.bat's - see installer\README.md's
REM "Known limitations"). Relaunch elevated (UAC prompt) if not already
REM running as admin.
net session >nul 2>&1
if %errorLevel% == 0 goto :run
echo This tool needs administrator rights - it writes certificate files
echo under Program Files.
echo Requesting elevation - click Yes on the prompt that appears...
powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
if errorlevel 1 (
    echo.
    echo Elevation was not granted. Re-run this file and click Yes when
    echo prompted, or right-click it and choose "Run as administrator".
    pause
)
exit /b

:run
cd /d "%~dp0server"
"%~dp0vendor\node\node.exe" "dist\cli\setupCerts.js"
echo.
pause
