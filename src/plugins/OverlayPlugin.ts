import { registerPlugin } from '@capacitor/core'
import type { PluginListenerHandle } from '@capacitor/core'

export type WordData = {
  word: string
  path: number[]  // flat [row0, col0, row1, col1, ...]
}

export interface OverlayPlugin {
  hasPermission(): Promise<{ granted: boolean }>
  requestPermission(): Promise<{ granted: boolean }>
  requestNotificationPermission(): Promise<{ granted: boolean }>
  show(): Promise<void>
  hide(): Promise<void>
  setWords(opts: { words: WordData[], commonWords: string[] }): Promise<void>
  setAlpha(opts: { alpha: number }): Promise<void>
  showCalibration(): Promise<void>
  hideCalibration(): Promise<void>
  addListener(event: 'wordTap', cb: (e: { word: string }) => void): Promise<PluginListenerHandle>
}

export const Overlay = registerPlugin<OverlayPlugin>('Overlay')
