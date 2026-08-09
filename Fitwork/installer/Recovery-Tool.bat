@echo off
REM Double-click launcher for the recovery-key tool (see
REM server\src\cli\recoveryTool.ts) - creates a fresh admin account when
REM every existing admin login is lost, but only for someone who has the
REM recovery key. The key was generated and shown once during installation
REM (see the popup at the end of Setup) - if that was missed or lost before
REM it was written down, see docs\RECOVERY.md; there is no way to display
REM it again.
REM
REM Needs administrator rights: the database lives under Program Files
REM (see installer\README.md's "Known limitations"), which only
REM administrators can write to - a plain double-click as a standard user
REM fails with "attempt to write a readonly database" partway through.
REM Relaunch elevated (UAC prompt) if not already running as admin.
net session >nul 2>&1
if %errorLevel% == 0 goto :run
echo This tool needs administrator rights - it writes to the database,
echo which lives under Program Files.
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
"%~dp0vendor\node\node.exe" "dist\cli\recoveryTool.js"
echo.
pause
