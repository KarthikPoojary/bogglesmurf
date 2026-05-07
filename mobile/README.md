# BoggleSmurf — Android

Capacitor shell that wraps the existing React/Vite web app in an Android WebView.
The solver, OCR, dictionary, and UI are **identical** to the web version — zero duplication.

## How to get an APK (no laptop needed)

### Step 1 — Bootstrap (first time only)

1. Open GitHub → **Actions** tab
2. Select **"Android Bootstrap"** workflow → **Run workflow**
3. Wait ~3 min — it generates `mobile/android/` and opens a PR
4. Review and **merge** the PR from your phone

### Step 2 — Build APK

1. Open GitHub → **Actions** → **"Android Build"** → **Run workflow**
2. Wait ~8 min
3. Click the finished run → **Artifacts** → download `bogglesmurf-debug-apk.zip`
4. Open the ZIP in **Files by Google** (it can extract it directly)
5. Tap `app-debug.apk` to install
   - First time: **Settings → Install unknown apps → Files → Allow**

### Step 3 — Install

Tap the installed **BoggleSmurf** icon. You have the full app — grid input, OCR camera,
solver, Common/Unusual word tabs — everything from the web version.

---

## Local development (needs laptop)

```bash
# Prerequisites: Node 20+, pnpm, Java 17, Android Studio with SDK 34+

# From repo root:
pnpm build                          # build web bundle → dist/

cd mobile
pnpm install
npx cap add android                 # first time only — generates mobile/android/
npx cap sync android                # copy dist/ into android assets

# Open in Android Studio:
npx cap open android

# Or build debug APK directly:
cd android && ./gradlew assembleDebug
# APK → mobile/android/app/build/outputs/apk/debug/app-debug.apk
```

---

## Roadmap

### Phase 1 (done) — Standalone Android app
- Capacitor WebView wrapping the full web bundle
- Cloud APK build via GitHub Actions

### Phase 2 (needs laptop) — Floating overlay
Adds `TYPE_APPLICATION_OVERLAY` so BoggleSmurf floats over Netflix/games.

Native files to create in `android/app/src/main/java/com/bogglesmurf/overlay/`:
- `OverlayPlugin.java` — Capacitor plugin bridge
- `OverlayService.java` — foreground Service holding a `WindowManager` view
- `OverlayView.java` — second WebView (or native `GridLayout`) rendered on top

Permissions needed in `AndroidManifest.xml`:
```xml
<uses-permission android:name="android.permission.SYSTEM_ALERT_WINDOW"/>
<uses-permission android:name="android.permission.FOREGROUND_SERVICE"/>
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_SPECIAL_USE"/>
```

TypeScript API stub is in `src/plugins/OverlayPlugin.ts`.

### Phase 3 — Shared core package
Extract `src/solver/` → `packages/core/` once the overlay plugin needs to call
the solver from Kotlin without a WebView round-trip.

---

## Known limitations (Phase 1)

| Issue | Status | Fix |
|---|---|---|
| Tesseract.js language data fetched from CDN (~10 MB) | deferred | Bundle in `public/tesseract/` |
| WebSocket sync uses `ws://` (cleartext, Android 9+ blocks) | deferred | Move to `wss://` |
| No overlay — can't float over other apps yet | Phase 2 | See above |
