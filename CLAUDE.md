# BoggleSmurf — Claude Code Project Memory

Personal PWA Boggle word-finder. Built for real gameplay use (Netflix Party Boggle).  
Repo: https://github.com/KarthikPoojary/bogglesmurf  

## Essential commands

```bash
pnpm dev              # dev server on localhost:5173
./scripts/dev.sh      # dev server on 0.0.0.0 — accessible from phone via local IP
pnpm test             # Vitest (25 tests, ~20s)
pnpm typecheck        # tsc --noEmit
pnpm build            # production build → dist/
pnpm lint             # ESLint
gh run list --limit 1 # check CI status
```

## Stack

React 19 + TypeScript · Vite 8 · Tailwind CSS v4 (`@import "tailwindcss"`, no config file) · Zustand 5 (persist middleware) · vite-plugin-pwa (Workbox) · Tesseract.js (installed, not yet wired) · Vitest 4 · pnpm

## Project phase status

| Phase | Status | Tag |
|-------|--------|-----|
| 0 — Scaffold | ✅ done | — |
| 1 — Solver | ✅ done | v0.1.0 |
| 2 — Grid UI | ✅ POC done | v0.2.0 |
| 3 — PWA icons + offline | 🔲 next | — |
| 4 — Cloudflare Pages deploy | 🔲 | — |
| 5 — Polish (dark mode, haptics, sort, settings) | 🔲 | — |
| 6 — Camera + OCR (Tesseract.js) | 🔲 | — |
| 7 — Docs, Lighthouse, MIT license | 🔲 | — |

## Immediate next task

**Add `src/components/WordPathOverlay.tsx`** — animated SVG stroke showing a selected word's path on the grid. Then proceed to Phase 3.

SVG strategy: wrap grid in `position: relative` container, SVG absolutely positioned on top with `viewBox="0 0 100 100"`. Cell center at `(row, col)` on an N×N grid = `((col+0.5)/N*100, (row+0.5)/N*100)`. Draw `<polyline>` through the solution path, animate with CSS stroke-dashoffset.

## Architecture decisions (don't reverse without reason)

- **Solver signature:** `solve(grid: string[][], trie: Trie, minLen=3, maxLen=12): Solution[]` — Trie injected for testability
- **Q tile:** contributes `"qu"` (2 letters, 1 grid cell) — standard Boggle rules
- **visited tracking:** `Uint8Array(size*size)` — faster than `Set<number>` in DFS hot loop
- **Dictionary:** SOWPODS 3–12 letters, 238k words, 3.1 MB at `public/dictionary.txt`
- **Dictionary caching:** Workbox `CacheFirst` runtime cache (`dictionary-v1`), NOT precached (3 MB > Workbox 2 MB limit)
- **State persistence:** Zustand `persist` — saves `gridSize`, `minLen`, `maxLen` only. Grid/solutions reset intentionally on reload.
- **Tailwind v4:** uses `@tailwindcss/vite` plugin — no `tailwind.config.js` needed

## Key files

```
src/solver/Trie.ts              — Map-based Trie
src/solver/solver.ts            — DFS solver
src/solver/loadDictionary.ts    — async fetch + singleton cache
src/store/boggleStore.ts        — Zustand store
src/components/BoggleGrid.tsx   — grid input, auto-advance, path badges
src/components/ResultsPanel.tsx — grouped words, scores, copy-all
src/components/GridSizeSelector.tsx
src/components/LengthRangeSlider.tsx
src/components/WordPathOverlay.tsx   ← DOES NOT EXIST YET
vite.config.ts                  — Vite + Tailwind + PWA + Vitest all in one
```

## Commit style

Conventional commits: `feat(scope):`, `fix(scope):`, `chore:`, `docs:`.  
End every commit with: `Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>`  
Tag milestones: `git tag vX.Y.Z && git push --tags`  
Verify CI after every push: `gh run list --limit 1`

## Workflow rules

- Run `pnpm test && pnpm build` before every commit — both must pass.
- Mobile-first: tap targets minimum 44×44 px. Test on phone via `./scripts/dev.sh`.
- No backend, no GraphQL, no Redux. Static SPA only.
- Lazy-load Tesseract.js — only import when camera mode is opened.
- Ask before: adding paid services, changing the stack, anything needing API keys.
