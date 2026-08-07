@echo off
REM Double-clickable launcher for the recovery tool (Windows). The eventual
REM installer is expected to wrap this further so the console window this
REM currently opens goes away entirely.
cd /d "%~dp0..\server"
call npm run recovery-tool
pause
