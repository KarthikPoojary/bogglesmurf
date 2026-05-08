# BoggleSmurf — Claude Code Project Memory

Personal PWA Boggle word-finder. Built for real gameplay use (Netflix Party Boggle).  
Repo: https://github.com/KarthikPoojary/bogglesmurf

## Rules — always follow without being asked

- Run `pnpm lint && pnpm typecheck && pnpm test && pnpm build` before every commit. All four must pass.
- Update this file (CLAUDE.md), README.md, and the Git changelog whenever phases complete or architecture changes.
- Keep device-specific config (phone IP, ADB paths, pairing codes) in `.local-notes.md` (gitignored). Never commit them.

## Essential commands

```bash
pnpm dev              # dev server on localhost:5173
./scripts/dev.sh      # Vite (5173) + WebSocket sync server (5174) on 0.0.0.0 — phone accessible
pnpm test             # Vitest (25 tests)
pnpm typecheck        # tsc --noEmit
pnpm lint             # ESLint — must be clean before every commit
pnpm build            # production build → dist/
gh run list --limit 1 # check CI status after every push
./scripts/deploy-android.sh  # build + wireless-install to phone (gitignored — see .local-notes.md)
```

## Stack

React 19 + TypeScript · Vite 8 · Tailwind CSS v4 (`@import "tailwindcss"`, no config file) · Zustand 5 (persist middleware) · vite-plugin-pwa (Workbox) · Tesseract.js (lazy-loaded in OCR flow) · Vitest 4 · pnpm · `ws` (WebSocket server for local sync) · Capacitor 6 (Android)

## Phase status

| Phase | Status | Notes |
|-------|--------|-------|
| 0 — Scaffold | ✅ | |
| 1 — Solver (Trie + DFS + SOWPODS 238k words) | ✅ | v0.1.0 |
| 2 — Grid UI (grid input, results panel, Zustand) | ✅ | v0.2.0 |
| OCR — camera/photo → auto-detect grid + letters | ✅ | |
| Word split — Common / Unusual / All tabs | ✅ | |
| Shared grid — WebSocket sync, 120s session | ✅ | |
| 3 — PWA icons + offline | ✅ | |
| M1 — Android app (Capacitor scaffold + cloud APK build) | ✅ | |
| M2 — Android overlay (float over Netflix, COM/UNQ/ALL tabs, alpha slider) | ✅ | |
| M3 — Auto-swipe via Android Accessibility Service | ✅ | |
| M4 — Settings sheet, calibration grid overlay, swipe delay, overlay passthrough fix | ✅ | |
| 4 — Cloudflare Pages deploy | 🔲 **next** | |
| 5 — Polish (dark mode toggle, haptics, sort options) | 🔲 | |
| 6 — WordPathOverlay SVG animation | 🔲 | |
| 7 — Lighthouse 90+, MIT license, docs | 🔲 | |
| M5 — Swipe-all / gesture queue | 🔲 | See suggestions below |

## Immediate next task

**Phase 4 — Cloudflare Pages deploy**
- Build: `pnpm build`, output dir: `dist/`
- Auto-deploy from `main` branch
- Live URL target: `bogglesmurf.pages.dev`

## Suggested next features (M5 and beyond)

| Feature | What it does | Notes |
|---------|-------------|-------|
| **Swipe-all** | One tap to auto-queue and swipe every word in the current tab, with the configured delay between each | Most impactful M5 feature |
| **Gesture speed slider** | Controls ms-per-cell (currently hardcoded 80ms) — some Boggle engines need slower tracing | Add to SettingsSheet |
| **Auto-dismiss done words** | Option to hide (not just strikethrough) words already swiped | Less visual clutter mid-game |
| **Word sort options** | Sort by length desc, score, alphabetical, or estimated path efficiency | Phase 5 / Polish |
| **Haptic feedback** | Vibrate on ▶ tap and on word-found confirmation | Phase 5 |
| **Dark/light mode toggle** | Explicit toggle, not just system | Phase 5 |
| **SVG word path animation** | Animated stroke tracing the selected word across the grid in the web UI | Phase 6 |

## Mobile — Android (Capacitor)

```bash
# Cloud build — no laptop needed:
# GitHub → Actions → "Android Build" → Run workflow  (produces app-debug.apk artifact)

# Local build (needs Android SDK 34 + Java 17 + ANDROID_HOME set):
MOBILE=1 pnpm build
cd mobile && pnpm install && npx cap sync android
cd mobile/android && ./gradlew assembleDebug    # APK only
# OR
cd mobile/android && ./gradlew installDebug     # build + install (wireless ADB must be connected)

# Quick deploy to phone (device config in .local-notes.md):
./scripts/deploy-android.sh
```

Device config (IP, ADB path, pairing codes) is kept in `.local-notes.md` (gitignored).  
See `scripts/deploy-android.sh.example` for the template.

Architecture note: web bundle (`dist/`) is shared verbatim — the Capacitor WebView serves it
from `https://localhost`. `MOBILE=1 pnpm build` skips the PWA service worker (conflicts with Capacitor).

### Android overlay architecture

The overlay is a `WindowManager.TYPE_APPLICATION_OVERLAY` foreground service with two modes:

**Word list** (`ACTION_SHOW`): draggable 180×320dp panel, COM/UNQ/ALL tabs, ▶ per word.  
**Calibration grid** (`ACTION_SHOW_CALIBRATION`): full-screen touch-passthrough, draws NxN cells at calibrated position, live-redraws as sliders move.

**Swipe gesture flow:**
1. User taps ▶ on a word in the overlay
2. `OverlayService.setTouchPassthrough(true)` — overlay stops intercepting touches
3. `Handler.postDelayed(swipeDelayMs)` — waits for Netflix word-found popup to clear
4. `BoggleAccessibilityService.dispatchGesture(...)` — sends swipe at calibrated coordinates
5. `GestureResultCallback.onCompleted` → `setTouchPassthrough(false)` — overlay resumes input

## Key files

```
src/solver/Trie.ts              — Map-based Trie, O(k) ops
src/solver/solver.ts            — DFS + Uint8Array visited + Trie prefix pruning
src/solver/loadDictionary.ts    — fetch /dictionary.txt, singleton Trie cache
src/solver/loadCommonWords.ts   — fetch /common-words.txt, singleton Set<string> cache
src/ocr/gridOcr.ts              — full-image Tesseract OCR, gap-based clustering, auto grid size
src/store/boggleStore.ts        — Zustand store; persists gridSize/minLen/maxLen/letters/overlayAlpha/swipeCalibration
src/hooks/useGridSync.ts        — WebSocket hook: broadcast grid, apply remote updates
src/hooks/useOverlay.ts         — overlay + calibration state; isNativePlatform() guard
src/components/BoggleGrid.tsx   — N×N inputs, auto-advance, path step badges
src/components/OcrCapture.tsx   — photo/camera modal, no manual size picker
src/components/ResultsPanel.tsx — Common / Unusual / All tabs, Boggle scores, copy-all, ⚙ button
src/components/SettingsSheet.tsx — slide-up bottom sheet: transparency, swipe calibration + delay, calibration grid preview
src/components/SyncBanner.tsx   — live session countdown, host vs watcher state
src/components/GridSizeSelector.tsx
src/components/LengthRangeSlider.tsx
src/plugins/OverlayPlugin.ts    — Capacitor plugin wrapper for Android overlay
src/plugins/SwipePlugin.ts      — Capacitor plugin wrapper for Android accessibility service
server/sync.js                  — Node WebSocket server, port 5174, 120s session TTL
vite.config.ts                  — Vite + Tailwind + PWA + Vitest all in one

mobile/capacitor.config.ts      — appId: com.bogglesmurf.app, webDir: ../dist
mobile/android/app/src/main/java/com/bogglesmurf/overlay/OverlayPlugin.java
mobile/android/app/src/main/java/com/bogglesmurf/overlay/OverlayService.java   — word list + calibration grid windows
mobile/android/app/src/main/java/com/bogglesmurf/accessibility/BoggleAccessibilityService.java — gesture dispatch
mobile/android/app/src/main/java/com/bogglesmurf/accessibility/SwipePlugin.java
mobile/android/app/src/main/res/layout/overlay_layout.xml
mobile/android/app/src/main/res/layout/overlay_word_item.xml
mobile/android/app/src/main/res/xml/accessibility_service_config.xml

scripts/deploy-android.sh       — gitignored; device-specific deploy script (see .local-notes.md)
scripts/deploy-android.sh.example — template with placeholders
.local-notes.md                 — gitignored; phone IP, ADB paths, pairing notes
```

## Architecture decisions — don't reverse without reason

- **Solver:** `solve(grid, trie, minLen, maxLen)` — Trie injected for testability
- **Q tile:** contributes `"qu"` (2 letters, 1 grid cell)
- **Visited tracking:** `Uint8Array(size*size)` — faster than Set in DFS hot loop
- **Dictionary:** SOWPODS 3–12 letters, 238k words, `public/dictionary.txt` (3.1 MB)
- **Dictionary caching:** Workbox `CacheFirst` runtime (`dictionary-v1`), NOT precached (3 MB > 2 MB limit)
- **Common words:** Google 10k list → `public/common-words.txt` (9,321 words, 72 KB)
- **OCR:** `PSM.SPARSE_TEXT` on full image → bounding-box clustering → auto-detects grid size
- **State persistence:** gridSize, minLen, maxLen, letters, overlayAlpha, swipeCalibration persisted; solutions reset on reload
- **swipeCalibration merge:** deep-merged in `boggleStore.merge()` so new fields (e.g. swipeDelayMs) get defaults on old persisted data
- **Overlay touch passthrough:** `FLAG_NOT_TOUCHABLE` toggled on the overlay window around each gesture dispatch so the overlay doesn't intercept the swipe
- **Sync server:** WebSocket on port 5174, runs only in dev via `./scripts/dev.sh`
- **Tailwind v4:** CSS-native, no `tailwind.config.js`
- **Android foreground service:** `FOREGROUND_SERVICE_TYPE_SPECIAL_USE`; on API 34+ requires 3-arg `startForeground()`

## Commit rules

- Conventional commits: `feat(scope):`, `fix:`, `chore:`, `docs:`
- End every commit: `Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>`
- Tag milestones: `git tag vX.Y.Z && git push --tags`
- Verify CI green after every push: `gh run list --limit 1`
- **Always update CLAUDE.md, README.md when phases complete or architecture changes — no need to be asked**
