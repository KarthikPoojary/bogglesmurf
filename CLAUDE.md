# BoggleSmurf — Claude Code Project Memory

Personal PWA Boggle word-finder. Built for real gameplay use (Netflix Party Boggle).  
Repo: https://github.com/KarthikPoojary/bogglesmurf

## Essential commands

```bash
pnpm dev              # dev server on localhost:5173
./scripts/dev.sh      # Vite (5173) + WebSocket sync server (5174) on 0.0.0.0 — phone accessible
pnpm test             # Vitest (25 tests)
pnpm typecheck        # tsc --noEmit
pnpm lint             # ESLint — must be clean before every commit
pnpm build            # production build → dist/
gh run list --limit 1 # check CI status after every push
```

## CI rule — non-negotiable

Run `pnpm lint && pnpm typecheck && pnpm test && pnpm build` before every commit. All four must pass. CI runs the same checks on GitHub Actions and will fail otherwise. Do not push a commit that fails any of these locally.

## Stack

React 19 + TypeScript · Vite 8 · Tailwind CSS v4 (`@import "tailwindcss"`, no config file) · Zustand 5 (persist middleware) · vite-plugin-pwa (Workbox) · Tesseract.js (lazy-loaded in OCR flow) · Vitest 4 · pnpm · `ws` (WebSocket server for local sync)

## Phase status

| Phase | Status | Tag |
|-------|--------|-----|
| 0 — Scaffold | ✅ | — |
| 1 — Solver (Trie + DFS + SOWPODS 238k words) | ✅ | v0.1.0 |
| 2 — Grid UI (grid input, results panel, Zustand) | ✅ | v0.2.0 |
| OCR — camera/photo → auto-detect grid + letters | ✅ | — |
| Word split — Common / Unusual tabs | ✅ | — |
| Shared grid — WebSocket sync, 120s session | ✅ | — |
| 3 — PWA icons + offline testing | 🔲 next | — |
| 4 — Cloudflare Pages deploy | 🔲 | — |
| 5 — Polish (dark mode toggle, haptics, sort, settings drawer) | 🔲 | — |
| 6 — WordPathOverlay SVG animation | 🔲 | — |
| 7 — Lighthouse 90+, MIT license, docs | 🔲 | — |

## Immediate next task

**Phase 3 — PWA icons + offline:**
- Generate `public/pwa-192.png` and `public/pwa-512.png` (mushroom-themed, use a script with `sharp` or canvas to render 🍄 emoji)
- Replace `public/favicon.svg` with `public/favicon.ico`
- Test "Add to Home Screen" on mobile Chrome and iOS Safari
- Verify offline: load app → disconnect → reload → grid, solver, and dictionary (runtime-cached) all work

## Key files

```
src/solver/Trie.ts              — Map-based Trie, O(k) ops
src/solver/solver.ts            — DFS + Uint8Array visited + Trie prefix pruning
src/solver/loadDictionary.ts    — fetch /dictionary.txt, singleton Trie cache
src/solver/loadCommonWords.ts   — fetch /common-words.txt, singleton Set<string> cache
src/ocr/gridOcr.ts              — full-image Tesseract OCR, gap-based clustering, auto grid size
src/store/boggleStore.ts        — Zustand store (gridSize/minLen/maxLen persisted)
src/hooks/useGridSync.ts        — WebSocket hook: broadcast grid, apply remote updates
src/components/BoggleGrid.tsx   — N×N inputs, auto-advance, path step badges
src/components/OcrCapture.tsx   — photo/camera modal, no manual size picker
src/components/ResultsPanel.tsx — Common / Unusual / All tabs, Boggle scores, copy-all
src/components/SyncBanner.tsx   — live session countdown, host vs watcher state
src/components/GridSizeSelector.tsx
src/components/LengthRangeSlider.tsx
server/sync.js                  — Node WebSocket server, port 5174, 120s session TTL
vite.config.ts                  — Vite + Tailwind + PWA + Vitest all in one
```

## Architecture decisions — don't reverse without reason

- **Solver:** `solve(grid, trie, minLen, maxLen)` — Trie injected for testability
- **Q tile:** contributes `"qu"` (2 letters, 1 grid cell)
- **visited tracking:** `Uint8Array(size*size)` — faster than Set in DFS hot loop
- **Dictionary:** SOWPODS 3–12 letters, 238k words, `public/dictionary.txt` (3.1 MB)
- **Dictionary caching:** Workbox `CacheFirst` runtime (`dictionary-v1`), NOT precached (3 MB > 2 MB limit)
- **Common words:** Google 10k list → `public/common-words.txt` (9,321 words, 72 KB)
- **OCR:** `PSM.SPARSE_TEXT` on full image → bounding-box clustering → auto-detects grid size
- **State persistence:** gridSize, minLen, maxLen only — grid/solutions reset on reload intentionally
- **Sync server:** WebSocket on port 5174, runs only in dev via `./scripts/dev.sh`
- **Tailwind v4:** CSS-native, no `tailwind.config.js`

## Commit rules

- Conventional commits: `feat(scope):`, `fix:`, `chore:`, `docs:`
- End every commit: `Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>`
- Tag milestones: `git tag vX.Y.Z && git push --tags`
- Verify CI green after every push: `gh run list --limit 1`
- **Update this file (CLAUDE.md) whenever phases complete or architecture changes**
