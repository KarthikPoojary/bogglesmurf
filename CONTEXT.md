# BoggleSmurf — Session Context

> Pick this file up at the start of every new session. Read it fully before writing any code.

## What This Is

A personal-use PWA that helps find all valid Boggle words in a grid during Netflix Party Boggle games.  
Repo: https://github.com/KarthikPoojary/bogglesmurf  
Stack: React 19 + TypeScript, Vite 8, Tailwind CSS v4, Zustand 5, Vitest 4, vite-plugin-pwa (Workbox), Tesseract.js (lazy, Phase 6), pnpm.

---

## ✅ What's Done

### Phase 0 — Scaffold (tag: first commit, no tag)
- Vite + React + TypeScript + Tailwind v4 + PWA plugin configured
- Zustand and Tesseract.js installed (not wired to UI yet)
- Vitest + React Testing Library + jest-dom
- ESLint + Prettier
- `.github/workflows/ci.yml` — typecheck + lint + test + build on every push
- `scripts/dev.sh` — dev server on 0.0.0.0 (phone-accessible via local IP)
- README.md + CHANGELOG.md

### Phase 1 — Solver (tag: v0.1.0)
- `src/solver/Trie.ts` — Map-based Trie, O(k) insert/contains/hasPrefix
- `src/solver/solver.ts` — DFS + Uint8Array visited + Trie prefix pruning + Q→"qu" handling
  - Signature: `solve(grid: string[][], trie: Trie, minLen=3, maxLen=12): Solution[]`
  - `Solution = { word: string; path: GridCell[] }` where `GridCell = { row, col, letter }`
  - Results sorted longest-first, then alphabetically
- `src/solver/loadDictionary.ts` — async fetch of `/dictionary.txt`, singleton Trie cache
- `public/dictionary.txt` — SOWPODS filtered to 3–12 letters (238,897 words, 3.1 MB)
  - Workbox runtime-caches it (CacheFirst, cache name `dictionary-v1`) instead of precaching (3 MB > Workbox 2 MB limit)
- 25 tests: Trie unit, known-answer solver, Qu handling, length filtering, 5×5/6×6, perf (<100ms on 4×4 + full SOWPODS)

### Phase 2 — Grid UI (tag: v0.2.0 — in progress at session end)
- `src/store/boggleStore.ts` — Zustand store with persist (gridSize, minLen, maxLen saved to localStorage)
  - State: gridSize (4|5|6), letters (string[][]), minLen, maxLen, solutions, selectedWord, isSolving
- `src/components/GridSizeSelector.tsx` — segmented 4/5/6 control
- `src/components/BoggleGrid.tsx` — N×N input grid, auto-advance on letter entry, backspace goes back, arrow keys, path highlighting with step numbers
- `src/components/LengthRangeSlider.tsx` — two range inputs (min 3–maxLen, max minLen–12)
- `src/components/ResultsPanel.tsx` — words grouped by length, Boggle score badge, copy-all button, tap to select
- `src/App.tsx` — wires it all: loads dictionary on mount, Solve button, Enter hotkey, Clear button

**Phase 2 NOT YET DONE:** `WordPathOverlay.tsx` (animated SVG stroke through grid path) was spec'd but omitted for time — the grid currently shows step-number badges on cells instead. Add the SVG overlay in the next session. Also: add persist for dark/light theme toggle.

---

## 🔲 What's Left

### Phase 2 remainder
- [ ] `src/components/WordPathOverlay.tsx` — SVG overlay with animated stroke connecting path cells
  - Strategy: wrap grid in `position: relative` container, SVG absolutely positioned on top, cells use percentage coords: center of cell (r,c) on an N×N grid = `((c+0.5)/N*100, (r+0.5)/N*100)` in a `viewBox="0 0 100 100"` SVG
- [ ] `pnpm test` update — add smoke tests for BoggleGrid and ResultsPanel

### Phase 3 — PWA (tag: v0.3.0)
- [ ] Generate real PWA icons (192×192, 512×512, maskable) — mushroom/smurf themed
  - Use a script or canvas: render 🍄 emoji to PNG. Tool: `pnpm add -D sharp` + a small `scripts/gen-icons.ts` that writes PNGs to `public/`
  - OR: just provide hand-made PNGs in `public/` (pwa-192.png, pwa-512.png)
- [ ] `public/favicon.ico` — currently `public/favicon.svg` from Vite scaffold
- [ ] Verify install prompt on Android Chrome and "Add to Home Screen" on iOS Safari
- [ ] Test offline: load app, disconnect network, reload — grid, solver, cached dictionary should all work

### Phase 4 — Deploy (Cloudflare Pages)
- [ ] Connect repo to Cloudflare Pages via dashboard (one-time auth) or `wrangler pages deploy dist --project-name bogglesmurf`
  - Build command: `pnpm build`
  - Output directory: `dist`
- [ ] Add deploy status badge to README.md
- [ ] Set live URL in README and repo description: `bogglesmurf.pages.dev` or custom domain

### Phase 5 — Polish v1 (tag: v1.0.0)
- [ ] Dark/light mode toggle (dark is default; persist to localStorage)
- [ ] Haptic feedback on tile entry: `navigator.vibrate?.(10)`
- [ ] Sort options: by length desc (default), alphabetical, by Boggle score
- [ ] Settings drawer (bottom sheet): dictionary choice, default grid size, length range, theme, OCR toggle
- [ ] Loading skeleton while Trie builds from dictionary

### Phase 6 — Camera + OCR (tag: v1.1.0)
- [ ] `src/components/CameraCapture.tsx` — getUserMedia (facingMode: environment), canvas snapshot, crop overlay
- [ ] `src/ocr/gridOcr.ts` — split crop into N×N cells, preprocess (grayscale, threshold), Tesseract per cell (single-char whitelist A-Z), return `string[][]`
- [ ] Lazy-load `tesseract.js` — only when camera mode opened (keeps initial bundle ~60KB)
- [ ] Manual correction step before solve

### Phase 7 — Docs + Polish
- [ ] Lighthouse audit: target 90+ Performance, Accessibility, Best Practices, SEO, PWA
- [ ] MIT LICENSE file
- [ ] `docs/ARCHITECTURE.md`
- [ ] `CONTRIBUTING.md`
- [ ] Screenshots/GIF in README

---

## Key Architecture Decisions

| Decision | Choice | Why |
|----------|--------|-----|
| Trie visited tracking | `Uint8Array(size*size)` | Faster than `Set<number>` in hot DFS inner loop |
| Dictionary precaching | Runtime (CacheFirst) not precache | 3 MB > Workbox 2 MB limit; app shell installs faster |
| Q tile | contributes `"qu"` (2 letters, 1 tile) | Standard Boggle rules |
| Solver signature | `solve(grid, trie, minLen, maxLen)` | Trie injected for testability; UI layer handles async loading |
| State persistence | Zustand `persist` middleware | gridSize, minLen, maxLen survive reload; grid/solutions do not (intentional) |
| Tailwind version | v4 via `@tailwindcss/vite` | No config file needed, CSS-native `@import "tailwindcss"` |

---

## File Structure (after Phase 2)

```
bogglesmurf/
├── public/
│   ├── dictionary.txt        # SOWPODS 3–12 letters (238k words, 3.1 MB)
│   ├── DICTIONARY_SOURCE.md
│   └── favicon.svg           # placeholder — replace with real favicon.ico
├── src/
│   ├── components/
│   │   ├── BoggleGrid.tsx        # ✅ done
│   │   ├── GridSizeSelector.tsx  # ✅ done
│   │   ├── LengthRangeSlider.tsx # ✅ done
│   │   ├── ResultsPanel.tsx      # ✅ done
│   │   └── WordPathOverlay.tsx   # ❌ TODO (next session)
│   ├── solver/
│   │   ├── Trie.ts              # ✅ done
│   │   ├── solver.ts            # ✅ done
│   │   ├── loadDictionary.ts    # ✅ done
│   │   └── __tests__/           # ✅ 25 tests
│   ├── store/
│   │   └── boggleStore.ts       # ✅ done
│   ├── App.tsx                  # ✅ done
│   └── index.css                # Tailwind v4 entry
├── scripts/
│   ├── dev.sh     # `pnpm vite --host 0.0.0.0` — phone-accessible
│   ├── build.sh
│   ├── test.sh
│   └── deploy.sh  # manual Cloudflare Pages deploy fallback
├── .github/workflows/ci.yml    # typecheck + lint + test + build
├── vite.config.ts              # Vite + Tailwind + PWA + Vitest config
├── tsconfig.app.json           # types: vite/client, vitest/globals, jest-dom, node
└── CONTEXT.md                  # this file
```

---

## How to Resume in a New Session

```bash
cd ~/Documents/Applications/bogglesmurf
pnpm install            # restore node_modules if needed
pnpm dev                # start dev server
# OR
./scripts/dev.sh        # dev server accessible from phone at http://<local-ip>:5173
```

**First task in next session:** Add `WordPathOverlay.tsx` (SVG path animation), then move to Phase 3 (PWA icons + offline verification).

**CI/CD:** GitHub Actions auto-runs on every push. No manual steps needed to check CI — `gh run list --limit 1`.

**Deploy:** Not yet deployed (Phase 4). Target: Cloudflare Pages, auto-deploy from `main` branch.

---

## Running Commands

```bash
pnpm test          # run Vitest (25 tests, ~23s)
pnpm typecheck     # tsc --noEmit
pnpm lint          # ESLint
pnpm build         # production build → dist/ (~64KB JS gzipped)
pnpm format        # Prettier
gh run list --limit 3   # check CI status
```
