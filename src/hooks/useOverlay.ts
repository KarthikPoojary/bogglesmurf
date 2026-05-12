import { useState, useEffect, useCallback } from 'react'
import { Capacitor } from '@capacitor/core'
import type { PluginListenerHandle } from '@capacitor/core'
import { Overlay } from '../plugins/OverlayPlugin'
import { Swipe } from '../plugins/SwipePlugin'
import { useBoggleStore } from '../store/boggleStore'
import type { Solution } from '../solver/solver'
import type { Trie } from '../solver/Trie'

export function useOverlay() {
  const isSupported =
    typeof Capacitor !== 'undefined' &&
    Capacitor.isNativePlatform() &&
    Capacitor.getPlatform() === 'android'

  const overlayAlpha        = useBoggleStore((s) => s.overlayAlpha)
  const setSwipeCalibration = useBoggleStore((s) => s.setSwipeCalibration)
  const [hasPermission, setHasPermission] = useState(false)
  const [isVisible, setIsVisible] = useState(false)
  const [isCalibrating, setIsCalibrating] = useState(false)

  useEffect(() => {
    if (!isSupported) return
    Overlay.hasPermission().then(({ granted }) => setHasPermission(granted))
  }, [isSupported])

  // Re-check permission when user returns from Android Settings
  useEffect(() => {
    if (!isSupported) return
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        Overlay.hasPermission().then(({ granted }) => setHasPermission(granted))
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [isSupported])

  const requestPermission = useCallback(async (): Promise<boolean> => {
    if (!isSupported) return false
    const { granted } = await Overlay.requestPermission()
    setHasPermission(granted)
    return granted
  }, [isSupported])

  const floatWords = useCallback(
    async (solutions: Solution[], commonWords: Set<string>) => {
      if (!isSupported) return
      if (!hasPermission) { await requestPermission(); return }

      // Android 13+ requires POST_NOTIFICATIONS at runtime for the foreground service notification
      await Overlay.requestNotificationPermission()

      const words = solutions.map((s) => ({
        word: s.word,
        path: s.path.flatMap((c) => [c.row, c.col]),
      }))
      const commonList = solutions
        .filter((s) => commonWords.has(s.word))
        .map((s) => s.word)

      await Overlay.setWords({ words, commonWords: commonList })
      await Overlay.show()
      await Overlay.setAlpha({ alpha: overlayAlpha })
      setIsVisible(true)
    },
    [isSupported, hasPermission, requestPermission, overlayAlpha],
  )

  const hideOverlay = useCallback(async () => {
    if (!isSupported) return
    await Overlay.hide()
    setIsVisible(false)
  }, [isSupported])

  const updateAlpha = useCallback(async (alpha: number) => {
    if (!isSupported || !isVisible) return
    await Overlay.setAlpha({ alpha })
  }, [isSupported, isVisible])

  const showCalibrationGrid = useCallback(async () => {
    if (!isSupported) return
    if (!hasPermission) { await requestPermission(); return }
    await Overlay.showCalibration()
    setIsCalibrating(true)
  }, [isSupported, hasPermission, requestPermission])

  const hideCalibrationGrid = useCallback(async () => {
    if (!isSupported) return
    await Overlay.hideCalibration()
    // Read back dragged position and persist to store
    Swipe.getCalibration().then(setSwipeCalibration).catch(() => {})
    setIsCalibrating(false)
  }, [isSupported, setSwipeCalibration])

  return {
    isSupported, hasPermission, isVisible, isCalibrating,
    floatWords, hideOverlay, updateAlpha, showCalibrationGrid, hideCalibrationGrid,
  }
}

/**
 * Subscribe to "captureReady" events from the native overlay's 📷 button.
 * On each event: decode the screenshot, OCR, solve, push results back to the
 * floating overlay — all without leaving the foreground app the user is in
 * (Netflix). Mount once at the app level.
 */
export function useCaptureListener(trie: Trie | null) {
  useEffect(() => {
    if (!Capacitor.isNativePlatform() || !trie) return
    let active = true
    let handle: PluginListenerHandle | null = null

    const setStatus = (text: string, spinner = true) =>
      Overlay.setStatus({ text, spinner }).catch(() => {})

    const handleCapture = async (base64: string, mime: string) => {
      const store = useBoggleStore.getState()
      try {
        // base64 → File (uses native fetch, works in WebView)
        const blob = await (await fetch(`data:${mime};base64,${base64}`)).blob()
        const file = new File([blob], 'capture.jpg', { type: mime })

        const { ocrGrid } = await import('../ocr/gridOcr')
        const { grid, gridSize } = await ocrGrid(
          file,
          (msg) => { setStatus(msg, true) },
          store.gridSize,
          { groqApiKey: store.groqApiKey, geminiApiKey: store.geminiApiKey },
        )

        // Sync grid into store (useful if user later opens BoggleSmurf)
        store.setGridSize(gridSize)
        for (let r = 0; r < gridSize; r++) {
          for (let c = 0; c < gridSize; c++) {
            store.setLetter(r, c, grid[r][c] || '')
          }
        }

        setStatus('Solving…', true)
        const { solve } = await import('../solver/solver')
        const gridForSolver = grid.map((row) => row.map((l) => l || ' '))
        const solutions: Solution[] = solve(gridForSolver, trie, store.minLen, store.maxLen)
        store.setSolutions(solutions)

        if (solutions.length === 0) {
          setStatus('No words found — check calibration alignment', false)
          return
        }

        // Push to overlay. Common-word set is derived per-capture.
        const { loadCommonWords } = await import('../solver/loadCommonWords')
        const commonWords = await loadCommonWords()
        const words = solutions.map((s) => ({
          word: s.word,
          path: s.path.flatMap((c) => [c.row, c.col]),
        }))
        const commonList = solutions
          .filter((s) => commonWords.has(s.word))
          .map((s) => s.word)

        await Overlay.setWords({ words, commonWords: commonList })
        // setWords() in native code auto-clears the status panel
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Capture failed'
        setStatus(msg.slice(0, 80), false)
      }
    }

    const setup = async () => {
      handle = await Overlay.addListener('captureReady', (e) => {
        if (!active) return
        // Fire and forget — handleCapture manages its own status updates
        handleCapture(e.base64Image, e.mimeType)
      })
    }
    setup()

    return () => {
      active = false
      handle?.remove?.()
    }
  }, [trie])
}
