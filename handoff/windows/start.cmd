@echo off
setlocal
cd /d "%~dp0..\.."
set "PATH=%CD%\..\runtime;%PATH%"
where node >nul 2>nul
if errorlevel 1 goto missing
where bun >nul 2>nul
if errorlevel 1 goto missing
set "PASCAL_DB_PATH=%CD%\.local\handoff-20260913\pascal.db"
if not exist "%PASCAL_DB_PATH%" (
  echo Scene database missing. Restore the database from your handoff ZIP first.
  pause
  exit /b 1
)
set "NEXT_TELEMETRY_DISABLED=1"
echo Installing locked dependencies. First start requires Internet access.
call bun install --frozen-lockfile
if errorlevel 1 goto failed
echo Open http://127.0.0.1:4329 after the server shows Ready.
echo Keep this window open while editing. Ctrl+C stops the server.
node node_modules/dotenv-cli/cli.js -e .env.local -e .env.defaults -- node node_modules/next/dist/bin/next dev apps/editor -p 4329 -H 127.0.0.1
if errorlevel 1 goto failed
exit /b 0
:missing
echo Node and Bun were not found. Extract the complete Windows handoff ZIP, including runtime.
:failed
pause
exit /b 1
