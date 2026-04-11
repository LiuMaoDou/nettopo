#!/usr/bin/env bash
# One-click start for macOS — double-click this file in Finder to launch.
# Opens two Terminal windows: one for the backend, one for the frontend,
# then opens http://localhost:3000 in the default browser.

set -e

# Resolve the project root regardless of where the script is invoked from
ROOT="$(cd "$(dirname "$0")" && pwd)"

# ── Dependency check ────────────────────────────────────────────────────────

if ! command -v pnpm &>/dev/null; then
  osascript -e 'display alert "pnpm not found" message "Install it with: npm install -g pnpm" as warning'
  exit 1
fi

if [[ ! -f "$ROOT/backend/.venv/bin/uvicorn" ]]; then
  osascript -e 'display alert "Backend venv missing" message "Run: cd backend && uv venv && uv pip install -r requirements.txt" as warning'
  exit 1
fi

if [[ ! -d "$ROOT/frontend/node_modules" ]]; then
  osascript -e 'display alert "Frontend node_modules missing" message "Run: cd frontend && pnpm install" as warning'
  exit 1
fi

# ── Launch backend in a new Terminal window ──────────────────────────────────

osascript <<EOF
tell application "Terminal"
  activate
  set backendWin to do script "echo '🔧 Backend — FastAPI :8000'; cd '$ROOT/backend' && .venv/bin/uvicorn app.main:app --reload --port 8000"
  set custom title of backendWin to "nettopo — backend"
end tell
EOF

# ── Launch frontend in a second Terminal window ───────────────────────────────

osascript <<EOF
tell application "Terminal"
  set frontendWin to do script "echo '⚡ Frontend — Vite :3000'; cd '$ROOT/frontend' && pnpm dev"
  set custom title of frontendWin to "nettopo — frontend"
end tell
EOF

# ── Wait for frontend to be ready, then open browser ─────────────────────────

echo "Waiting for frontend to be ready..."
for i in $(seq 1 30); do
  if curl -s -o /dev/null -w "%{http_code}" http://localhost:3000 | grep -q "200"; then
    break
  fi
  sleep 1
done

open "http://localhost:3000"
echo "Opened http://localhost:3000"
