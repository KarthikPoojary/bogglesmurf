# Changelog

## [Unreleased]

## [0.8.0] - 2026-05-10 — Replace Tesseract with Google ML Kit on Android

### Changed
- OCR now uses Google ML Kit Text Recognition on Android (on-device, free, fast). Tesseract.js retained as the web PWA fallback. The elaborate preprocessing pipeline (purple-tile detection, percentile contrast stretch, inversion, crop scaling, PSM fallback) is gone — ML Kit reads the raw photo directly.

### Added
- `@pantrist/capacitor-plugin-ml-kit-text-recognition` (v6.2.1) Capacitor plugin
- Platform branch in `gridOcr.ts`: `Capacitor.isNativePlatform()` → ML Kit, otherwise Tesseract

## [0.7.1] - 2026-05-10 — OCR fix for Netflix Boggle grid photos

### Fixed
- OCR: detect dark-purple tile region first (1-D pixel projection) and crop to it before running Tesseract — eliminates room background, TV bezel, player banners and timer from the image, giving the contrast-stretch a clean pixel distribution
- OCR: height-based letter filter drops any detected character shorter than 55% of the median letter height, removing residual small UI text that survived the crop and confused grid clustering
- OCR: confidence threshold lowered 15 → 5 — the bold rounded Boggle font scores lower than standard document text
- OCR: maxSize bumped 1600 → 2000 for sharper letter detail on high-res phone cameras

## [0.7.0] - 2026-05-08 — M4: Settings sheet, drag calibration, swipe fixes

### Added
- `src/components/SettingsSheet.tsx` — slide-up bottom sheet: overlay transparency slider + swipe delay + calibration grid preview
- `⚙` button in ResultsPanel (Android only) opens SettingsSheet
- Draggable, resizable calibration grid overlay — drag to position, resize from corner; replaces position sliders
- Swipe delay slider (0–1500 ms, default 400 ms) to avoid landing on Netflix score popups
- `src/plugins/OverlayPlugin.ts` — added `showCalibration()` / `hideCalibration()` methods
- `src/plugins/SwipePlugin.ts` — added `getCalibration()` + `swipeDelayMs` to `setCalibration()`
- `src/hooks/useOverlay.ts` — `isCalibrating` state, `showCalibrationGrid()`, `hideCalibrationGrid()` that reads back dragged position on save
- `src/store/boggleStore.ts` — `swipeCalibration.swipeDelayMs` field with deep-merge so old persisted data gets the default
- `scripts/deploy-android.sh.example` — template for the gitignored device deploy script
- `.local-notes.md` — gitignored file for phone IP, ADB paths, pairing codes

### Fixed
- Overlay window changed to grid-sized + `FLAG_NOT_TOUCH_MODAL` so touches outside the calibration grid fall through to apps below (root cause: MATCH_PARENT `TYPE_APPLICATION_OVERLAY` window drops touches instead of forwarding)
- Calibration drag now uses sticky-finger (`getRawX/Y()` anchored at `ACTION_DOWN`) to prevent coordinate drift when `updateViewLayout()` repositions the window mid-gesture
- `FLAG_NOT_TOUCHABLE` toggled around each gesture dispatch via `GestureResultCallback` so the overlay doesn't absorb its own swipe events
- `swipeCalibration` sent to native (`Swipe.setCalibration`) each time Float is tapped, so the latest calibration is always used

## [0.6.0] - 2026-05-07 — M3: Auto-swipe via Accessibility Service

### Added
- `BoggleAccessibilityService.java` — Android Accessibility Service (`canPerformGestures=true`) that dispatches multi-stroke swipe gestures across the Boggle grid
- `SwipePlugin.java` + `src/plugins/SwipePlugin.ts` — Capacitor bridge: `isEnabled()`, `openSettings()`, `setCalibration()`, `getCalibration()`
- Auto-swipe UI in SettingsSheet: service status badge, "Enable accessibility service" link, swipe delay slider
- Swipe calibration: `gridLeftPct`, `gridTopPct`, `gridWidthPct` percentage-based coordinates passed to the accessibility service
- Word list ▶ button triggers swipe for that word; `Handler.postDelayed` honors configurable delay before dispatching gesture

## [0.5.0] - 2026-05-07 — M2: Android floating overlay

### Added
- `OverlayPlugin.java` + `OverlayService.java` — `WindowManager.TYPE_APPLICATION_OVERLAY` foreground service
- `src/plugins/OverlayPlugin.ts` — Capacitor plugin wrapper: `hasPermission`, `requestPermission`, `requestNotificationPermission`, `show`, `hide`, `setWords`, `setAlpha`
- `src/hooks/useOverlay.ts` — permission flow, `floatWords()`, `hideOverlay()`, `updateAlpha()`; Android-only via `isNativePlatform()` guard
- Floating overlay panel: 180×320dp draggable window with COM / UNQ / ALL tabs and ▶ play button per word
- `Float ↗ / Hide overlay` toggle button in ResultsPanel (Android only)
- Overlay transparency: `setAlpha()` method + live preview via `overlayAlpha` store field
- Android 13+ runtime `POST_NOTIFICATIONS` permission request for foreground service notification
- `overlay_layout.xml`, `overlay_word_item.xml`, `overlay_background.xml` layout resources
- `FOREGROUND_SERVICE_TYPE_SPECIAL_USE` declaration for API 34+

## [0.4.0] - 2026-05-06 — M1: Android native app (Capacitor)

### Added
- Capacitor 6 Android scaffold — `mobile/` directory with `capacitor.config.ts`, `package.json`
- `MainActivity.java` — registers `OverlayPlugin` + `SwipePlugin`
- `AndroidManifest.xml` — `SYSTEM_ALERT_WINDOW`, `FOREGROUND_SERVICE`, `BIND_ACCESSIBILITY_SERVICE`, `INTERNET` permissions
- GitHub Actions `android-build.yml` — cloud APK build, uploads `app-debug.apk` artifact + draft Release
- `MOBILE=1 pnpm build` flag skips PWA service worker (conflicts with Capacitor WebView)
- `mobile/README.md` — full install + build guide

## [0.3.0] - 2026-05-06 — OCR, word split, grid sync, PWA

### Added
- `src/ocr/gridOcr.ts` — Tesseract.js (`PSM.SPARSE_TEXT`) on full image, gap-based bounding-box clustering, auto-detects 4/5/6 grid size
- `src/components/OcrCapture.tsx` — camera / gallery modal with preview, processing spinner, result summary, auto-close
- `src/solver/loadCommonWords.ts` — async loader for `public/common-words.txt` (Google 10k, 9,321 words), singleton Set cache
- Common / Unusual / All tabs in ResultsPanel — highlights SOWPODS-only words separately
- `src/hooks/useGridSync.ts` — WebSocket hook: broadcast grid, apply remote updates, exponential back-off reconnect, stops after 3 fast failures (server not running)
- `src/components/SyncBanner.tsx` — share session UI, 120 s countdown, host vs watcher state
- `server/sync.js` — Node WebSocket server, port 5174, 120 s session TTL
- `./scripts/dev.sh` — starts Vite (5173) + sync server (5174) on `0.0.0.0` for phone access
- PWA icons (all sizes), `manifest.webmanifest`, Workbox offline caching
- Workbox `CacheFirst` runtime cache for `dictionary.txt` (`dictionary-v1`) — bypasses 2 MB precache limit
- Grid letters now persisted to localStorage so the grid survives a reload

## [0.2.0] - 2026-05-05 (POC — WordPathOverlay pending)

### Added
- `src/store/boggleStore.ts` — Zustand store, gridSize/minLen/maxLen persisted to localStorage
- `src/components/GridSizeSelector.tsx` — 4×4 / 5×5 / 6×6 segmented control
- `src/components/BoggleGrid.tsx` — auto-advance focus, backspace, arrow keys, path step badges
- `src/components/LengthRangeSlider.tsx` — dual range sliders, 3–12
- `src/components/ResultsPanel.tsx` — words grouped by length with Boggle scores, copy-all
- `src/App.tsx` — full wiring: dictionary load on mount, Solve/Clear, Enter hotkey
- `CONTEXT.md` — session handoff file with full project status for new sessions

### Missing (next session first task)
- `src/components/WordPathOverlay.tsx` — animated SVG stroke through grid path

## [0.1.0] - 2026-05-05

### Added
- `src/solver/Trie.ts` — Trie data structure with insert, contains, hasPrefix
- `src/solver/solver.ts` — DFS solver with Trie pruning, Qu tile handling, visited-cell tracking
- `src/solver/loadDictionary.ts` — async dictionary loader with singleton cache
- `public/dictionary.txt` — SOWPODS filtered to 3–12 letter words (238,897 words, 3.1 MB)
- `public/DICTIONARY_SOURCE.md` — dictionary provenance and license notes
- Comprehensive test suite: Trie unit tests, solver known-answer tests, Qu handling, length filtering, grid size checks, and performance benchmark (4×4 < 100ms with full SOWPODS)

## [0.0.1] - 2026-05-05

### Added
- Initial Vite + React 19 + TypeScript scaffold
- Tailwind CSS v4 with mobile-first dark theme
- Zustand and Tesseract.js dependencies
- vite-plugin-pwa (configured, activated in Phase 3)
- Vitest + React Testing Library test setup
- ESLint + Prettier configuration
- GitHub Actions CI (type-check, lint, test, build)
- Helper scripts: dev.sh, build.sh, test.sh, deploy.sh
- "Hello BoggleSmurf" landing page confirming Tailwind works
