#!/usr/bin/env bash
# Starts Vite dev server on 0.0.0.0 so you can access it from your phone
# Find your local IP with: ipconfig getifaddr en0 (Mac) or hostname -I (Linux)
set -e
echo "Starting BoggleSmurf dev server..."
echo "Access from your phone at: http://$(ipconfig getifaddr en0 2>/dev/null || hostname -I | awk '{print $1}'):5173"
pnpm vite --host 0.0.0.0
