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

  const requestPermission = useCallback(async (): Promise<boolean> => {
    if (!isSupported) return false
    const { granted } = await Overlay.requestPermission()
    setHasPermission(granted)
    return granted
  }, [isSupported])

  const floatWords = useCallback(
    async (words: string[]) => {
      if (!isSupported) return
      let permitted = hasPermission
      if (!permitted) {
        permitted = await requestPermission()
      }
      if (!permitted) return
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
