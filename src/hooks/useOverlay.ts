import { useState, useEffect, useCallback } from 'react'
import { Capacitor } from '@capacitor/core'
import { Overlay } from '../plugins/OverlayPlugin'
import { useBoggleStore } from '../store/boggleStore'
import type { Solution } from '../solver/solver'

export function useOverlay() {
  const isSupported =
    typeof Capacitor !== 'undefined' &&
    Capacitor.isNativePlatform() &&
    Capacitor.getPlatform() === 'android'

  const overlayAlpha = useBoggleStore((s) => s.overlayAlpha)
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
    setIsCalibrating(false)
  }, [isSupported])

  return {
    isSupported, hasPermission, isVisible, isCalibrating,
    floatWords, hideOverlay, updateAlpha, showCalibrationGrid, hideCalibrationGrid,
  }
}
