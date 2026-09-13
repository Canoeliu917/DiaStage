@echo off
setlocal
cd /d "%~dp0..\.."
set "PATH=%CD%\..\runtime;%PATH%"
call bun run handoff/windows/backup.ts
if errorlevel 1 (
  echo Backup failed. Keep the existing data.
  pause
  exit /b 1
)
pause
