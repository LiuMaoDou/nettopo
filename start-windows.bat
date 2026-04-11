@echo off
:: One-click start for Windows — double-click this file in Explorer to launch.
:: Opens two Command Prompt windows: one for the backend, one for the frontend,
:: then opens http://localhost:3000 in the default browser.

setlocal EnableDelayedExpansion

:: Resolve project root from the location of this script
set ROOT=%~dp0
:: Remove trailing backslash
if "%ROOT:~-1%"=="\" set ROOT=%ROOT:~0,-1%

:: ── Dependency check ─────────────────────────────────────────────────────────

where pnpm >nul 2>&1
if errorlevel 1 (
    echo [ERROR] pnpm not found.
    echo Install it with:  npm install -g pnpm
    pause
    exit /b 1
)

if not exist "%ROOT%\backend\.venv\Scripts\uvicorn.exe" (
    echo [ERROR] Backend virtualenv missing.
    echo Run:  cd backend ^&^& uv venv ^&^& uv pip install -r requirements.txt
    pause
    exit /b 1
)

if not exist "%ROOT%\frontend\node_modules" (
    echo [ERROR] Frontend node_modules missing.
    echo Run:  cd frontend ^&^& pnpm install
    pause
    exit /b 1
)

:: ── Launch backend ────────────────────────────────────────────────────────────

start "nettopo — backend" cmd /k ^
    "cd /d "%ROOT%\backend" && echo Backend — FastAPI :8000 && .venv\Scripts\uvicorn.exe app.main:app --reload --port 8000"

:: ── Launch frontend ───────────────────────────────────────────────────────────

start "nettopo — frontend" cmd /k ^
    "cd /d "%ROOT%\frontend" && echo Frontend — Vite :3000 && pnpm dev"

:: ── Wait for frontend to become ready, then open browser ─────────────────────

echo Waiting for frontend to be ready...
set /a attempts=0
:wait_loop
set /a attempts+=1
if %attempts% gtr 30 goto open_browser
powershell -Command "try { $r=(Invoke-WebRequest http://localhost:3000 -UseBasicParsing -TimeoutSec 1).StatusCode; exit 0 } catch { exit 1 }" >nul 2>&1
if errorlevel 1 (
    timeout /t 1 /nobreak >nul
    goto wait_loop
)

:open_browser
start "" "http://localhost:3000"
echo Opened http://localhost:3000

endlocal
