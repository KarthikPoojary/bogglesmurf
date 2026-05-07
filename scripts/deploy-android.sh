#!/usr/bin/env bash
# Build and deploy the Android debug APK to the phone over WiFi.
# Requires Wireless debugging to be ON on the phone (Settings → Developer options).
set -e

ADB="/Users/karthik/android-sdk/platform-tools/adb"
export PATH="/Users/karthik/android-sdk/platform-tools:$PATH"

# ── 1. Ensure a wireless device is connected ─────────────────────────────────
if ! "$ADB" devices | grep -q "192\.168\.0"; then
  echo "No wireless device found — attempting mDNS discovery..."
  SERVICE=$("$ADB" mdns services 2>/dev/null | grep "_adb-tls-connect" | awk '{print $3}')
  if [ -z "$SERVICE" ]; then
    echo "ERROR: Phone not found on network."
    echo "  1. On phone: Settings → Developer options → Wireless debugging → ON"
    echo "  2. First time only: run  ! /Users/karthik/android-sdk/platform-tools/adb pair <ip>:<port> <code>"
    exit 1
  fi
  "$ADB" connect "$SERVICE"
fi

# ── 2. Build web bundle (no PWA service worker) ───────────────────────────────
echo "Building web bundle..."
cd "$(dirname "$0")/.."
MOBILE=1 pnpm build

# ── 3. Sync to Android assets ─────────────────────────────────────────────────
echo "Syncing to Android..."
cd mobile && pnpm exec cap sync android && cd ..

# ── 4. Build + install APK ────────────────────────────────────────────────────
echo "Installing on phone..."
cd mobile/android && ./gradlew installDebug

echo ""
echo "✓ Installed on phone"
