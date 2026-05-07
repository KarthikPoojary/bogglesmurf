import { useState, useEffect, useCallback } from 'react'
import { Capacitor } from '@capacitor/core'
import { Overlay } from '../plugins/OverlayPlugin'

export function useOverlay() {
  const isSupported =
    typeof Capacitor !== 'undefined' &&
    Capacitor.isNativePlatform() &&
    Capacitor.getPlatform() === 'android'

  const [hasPermission, setHasPermission] = useState(false)
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    if (!isSupported) return
    Overlay.hasPermission().then(({ granted }) => setHasPermission(granted))
  }, [isSupported])

  // Re-check permission when user returns from the Android Settings screen.
  // requestPermission() opens Settings and resolves immediately with granted=false;
  // this listener catches the app becoming visible again after the user toggles the switch.
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
    async (words: string[]) => {
      if (!isSupported) return
      if (!hasPermission) {
        // Opens Android Settings — returns false immediately.
        // User grants the toggle, returns to app, visibilitychange re-checks,
        // then they tap Float again to actually show the overlay.
        await requestPermission()
        return
      }
      // Android 13+ requires POST_NOTIFICATIONS at runtime for the foreground service
      // notification. Without it startForeground() crashes the service silently.
      await Overlay.requestNotificationPermission()
      await Overlay.setWords({ words })
      await Overlay.show()
      setIsVisible(true)
    },
    [isSupported, hasPermission, requestPermission],
  )

  const hideOverlay = useCallback(async () => {
    if (!isSupported) return
    await Overlay.hide()
    setIsVisible(false)
  }, [isSupported])

  return { isSupported, hasPermission, isVisible, floatWords, hideOverlay }
}
