// Phase 2 stub — native implementation lives in android/app/src/main/java/com/bogglesmurf/overlay/
import { registerPlugin } from '@capacitor/core'

export interface OverlayPlugin {
  requestPermission(): Promise<{ granted: boolean }>
  hasPermission(): Promise<{ granted: boolean }>
  show(opts?: { x?: number; y?: number }): Promise<void>
  hide(): Promise<void>
  // letters: 16-char string for a 4×4 grid, 25-char for 5×5, etc.
  setGrid(opts: { letters: string }): Promise<void>
  addListener(event: 'wordTap', cb: (e: { word: string }) => void): void
}

export const Overlay = registerPlugin<OverlayPlugin>('Overlay')
