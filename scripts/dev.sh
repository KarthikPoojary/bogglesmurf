#!/usr/bin/env bash
# Starts Vite (port 5173) + WebSocket sync server (port 5174) on 0.0.0.0
# Access from your phone: http://<local-ip>:5173
set -e

LOCAL_IP=$(ipconfig getifaddr en0 2>/dev/null || hostname -I 2>/dev/null | awk '{print $1}' || echo "localhost")

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  🍄 BoggleSmurf dev server"
echo "  App:  http://${LOCAL_IP}:5173"
echo "  Sync: ws://${LOCAL_IP}:5174"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Start WebSocket sync server in background
node server/sync.js &
SYNC_PID=$!

# Trap Ctrl+C to kill both
cleanup() {
  echo ""
  echo "Shutting down..."
  kill "$SYNC_PID" 2>/dev/null || true
  exit 0
}
trap cleanup INT TERM

# Start Vite in foreground
pnpm vite --host 0.0.0.0
