import { registerPlugin } from '@capacitor/core'

export interface SwipePlugin {
  isEnabled(): Promise<{ enabled: boolean }>
  openSettings(): Promise<void>
  getCalibration(): Promise<{ gridLeftPct: number; gridTopPct: number; gridWidthPct: number; swipeDelayMs: number }>
  setCalibration(opts: {
    gridLeftPct: number
    gridTopPct: number
    gridWidthPct: number
    gridSize: number
    swipeDelayMs: number
  }): Promise<void>
}

export const Swipe = registerPlugin<SwipePlugin>('Swipe')
