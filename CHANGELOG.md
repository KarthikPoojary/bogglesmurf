# Changelog

## [Unreleased]

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
