# 🍄 BoggleSmurf

> My girlfriend is *unbeatable* at Netflix Party Boggle. So I called in a smurf.

BoggleSmurf is a tiny web app that helps you find every word hiding in a Boggle grid. Type the letters in (or point your camera at the screen), pick a word length range, and watch the possibilities cascade. Works on any phone, tablet, or laptop — no app store, no install, no nonsense.

The name? In gaming, a *smurf* is an experienced player who jumps into a match to help out the side that needs it. That's this app. I'm the side that needs it.

It's a personal project — built for fun, learning, and the sweet, sweet taste of a comeback win. 🏆

## 🌐 Live app
👉 [bogglesmurf.pages.dev](https://bogglesmurf.pages.dev) *(deployment coming soon)*

→ [Changelog](https://github.com/KarthikPoojary/bogglesmurf/commits/main)

## Features
- 📱 **Works everywhere** — iOS, Android, desktop. One URL, no install needed.
- 🏠 **Installable** — add to home screen, runs offline like a native app
- 🔤 **Configurable grids** — 4x4, 5x5, or 6x6
- 📏 **Word length filter** — anywhere from 3 to 12 letters
- 📸 **Two input modes** — type the grid manually, or point your camera at it
- 🗺️ **Path highlighting** — tap any found word, see exactly how to trace it
- 🌙 **Dark mode** — easy on the eyes during late-night matches
- ⚡ **Fast** — solves a 4x4 in milliseconds, ships under 200KB gzipped (excluding OCR)

## 🎮 How to use it during a game
- **Two-screen setup:** phone runs Netflix Boggle, tablet/laptop/old phone runs this app
- **Split-screen on Android:** Netflix on top, browser on bottom
- **Webcam trick:** point your laptop camera at the Boggle screen for instant OCR

## Why?
Because losing is fine, but losing *quietly* is worse. Also — "build a thing my partner and I will actually use" beats any tutorial.

## Tech Stack
- **React 19 + TypeScript** — UI and type safety
- **Vite 8** — blazing fast build tool with HMR
- **Tailwind CSS v4** — utility-first styling, mobile-first
- **Zustand** — minimal state management
- **Vitest** — unit testing, Vite-native
- **vite-plugin-pwa** — PWA manifest + Workbox service worker
- **Tesseract.js** — in-browser OCR (lazy loaded)
- **pnpm** — faster installs, better disk usage than npm

## 🗺 Roadmap

| | What |
|---|---|
| 🔲 | **PWA icons + offline** — proper home screen icons, full offline support after first visit |
| 🔲 | **Cloudflare Pages deploy** — live public URL, auto-deploy from `main` |
| 🔲 | **Polish** — dark/light mode toggle, haptic feedback, sort by length/score/alpha, settings drawer |
| 🔲 | **Word path animation** — animated SVG stroke tracing the selected word across the grid |
| 🔲 | **Lighthouse 90+** — performance, accessibility, best practices audit pass |
