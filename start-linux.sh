#!/usr/bin/env bash
# One-click start for Linux — run `bash start-linux.sh` or double-click in a file manager.
# Spawns backend and frontend in separate terminal windows,
# then opens http://localhost:3000 in the default browser.

set -euo pipefail

# ── Resolve project root ─────────────────────────────────────────────────────

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ── Helpers ──────────────────────────────────────────────────────────────────

err() { echo "[ERROR] $*" >&2; }

# Detect an available terminal emulator (first match wins)
find_terminal() {
  for term in gnome-terminal konsole xfce4-terminal mate-terminal tilix lxterminal xterm; do
    if command -v "$term" &>/dev/null; then
      echo "$term"; return 0
    fi
  done
  return 1
}

# Launch a command in a new terminal window.
# Usage: open_terminal <window-title> <command-string>
open_terminal() {
  local title="$1"
  local cmd="$2"
  case "$TERM_APP" in
    gnome-terminal)
      gnome-terminal --title="$title" -- bash -c "$cmd; exec bash" ;;
    konsole)
      konsole --new-tab -p "tabtitle=$title" -e bash -c "$cmd; exec bash" ;;
    xfce4-terminal)
      xfce4-terminal --title="$title" -e "bash -c '$cmd; exec bash'" ;;
    mate-terminal)
      mate-terminal --title="$title" -e "bash -c '$cmd; exec bash'" ;;
    tilix)
      tilix -t "$title" -e "bash -c '$cmd; exec bash'" ;;
    lxterminal)
      lxterminal --title="$title" -e "bash -c '$cmd; exec bash'" ;;
    xterm)
      xterm -title "$title" -e bash -c "$cmd; exec bash" ;;
  esac
}

# ── Dependency checks ─────────────────────────────────────────────────────────

if ! command -v pnpm &>/dev/null; then
  err "pnpm not found. Install it with:  npm install -g pnpm"
  exit 1
fi

if [[ ! -f "$ROOT/backend/.venv/bin/uvicorn" ]]; then
  err "Backend virtualenv missing."
  err "Run:  cd \"$ROOT/backend\" && uv venv && uv pip install -r requirements.txt"
  exit 1
fi

if [[ ! -d "$ROOT/frontend/node_modules" ]]; then
  err "Frontend node_modules missing."
  err "Run:  cd \"$ROOT/frontend\" && pnpm install"
  exit 1
fi

TERM_APP="$(find_terminal)" || {
  err "No supported terminal emulator found."
  err "Install one of: gnome-terminal, konsole, xfce4-terminal, xterm"
  exit 1
}

echo "Using terminal: $TERM_APP"

# ── Launch backend ────────────────────────────────────────────────────────────

open_terminal "nettopo — backend" \
  "echo 'Backend — FastAPI :8000'; cd '$ROOT/backend' && .venv/bin/uvicorn app.main:app --reload --port 8000"

# ── Launch frontend ───────────────────────────────────────────────────────────

open_terminal "nettopo — frontend" \
  "echo 'Frontend — Vite :3000'; cd '$ROOT/frontend' && pnpm dev"

# ── Wait for frontend then open browser ──────────────────────────────────────

echo "Waiting for frontend to be ready..."
for i in $(seq 1 30); do
  if curl -s -o /dev/null -w "%{http_code}" http://localhost:3000 2>/dev/null | grep -q "200"; then
    break
  fi
  sleep 1
done

if command -v xdg-open &>/dev/null; then
  xdg-open "http://localhost:3000"
elif command -v sensible-browser &>/dev/null; then
  sensible-browser "http://localhost:3000"
else
  echo "Open http://localhost:3000 in your browser."
fi

echo "Started. Backend: http://localhost:8000  Frontend: http://localhost:3000"
