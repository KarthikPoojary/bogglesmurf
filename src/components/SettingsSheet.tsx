import { useEffect, useState } from 'react'
import { useBoggleStore } from '../store/boggleStore'
import { Overlay } from '../plugins/OverlayPlugin'
import { Swipe } from '../plugins/SwipePlugin'

interface Props {
  open: boolean
  onClose: () => void
  isVisible: boolean
  isCalibrating: boolean
  updateAlpha: (v: number) => void
  onShowCalibration: () => void
  onHideCalibration: () => void
}

export function SettingsSheet({
  open, onClose, isVisible, isCalibrating, updateAlpha, onShowCalibration, onHideCalibration,
}: Props) {
  const { overlayAlpha, setOverlayAlpha, swipeCalibration, setSwipeCalibration, gridSize } = useBoggleStore()
  const [swipeEnabled, setSwipeEnabled] = useState(false)

  useEffect(() => {
    if (!open) return
    Swipe.isEnabled().then(({ enabled }) => setSwipeEnabled(enabled))
  }, [open])

  useEffect(() => {
    const check = () => {
      if (document.visibilityState === 'visible') {
        Swipe.isEnabled().then(({ enabled }) => setSwipeEnabled(enabled))
      }
    }
    document.addEventListener('visibilitychange', check)
    return () => document.removeEventListener('visibilitychange', check)
  }, [])

  if (!open) return null

  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-40" onClick={onClose} />
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-slate-900 border-t border-slate-800 rounded-t-2xl p-4 pb-10 flex flex-col gap-5">

        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-200">Overlay settings</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300 text-xl leading-none px-1">✕</button>
        </div>

        {/* Transparency */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400 font-medium">Overlay transparency</span>
            <span className="text-xs text-slate-500">{Math.round((1 - overlayAlpha) * 100)}%</span>
          </div>
          <input
            type="range" min={0.3} max={1} step={0.05}
            value={overlayAlpha}
            onChange={(e) => {
              const v = parseFloat(e.target.value)
              setOverlayAlpha(v)
              updateAlpha(v)
              if (!isVisible) Overlay.setAlpha({ alpha: v }).catch(() => {})
            }}
            className="w-full accent-violet-500"
          />
        </div>

        {/* Auto-swipe */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400 font-medium">Auto-swipe setup</span>
            {swipeEnabled
              ? <span className="text-[10px] text-emerald-400">● Service active</span>
              : <button onClick={() => Swipe.openSettings()} className="text-[10px] text-violet-400 underline">
                  Enable accessibility service
                </button>
            }
          </div>

          {swipeEnabled && (
            <>
              <div className="flex flex-col gap-2 text-[11px] text-slate-500">
                {[
                  { label: 'Grid left',  key: 'gridLeftPct'  as const, min: 0,  max: 30,  unit: '%' },
                  { label: 'Grid top',   key: 'gridTopPct'   as const, min: 0,  max: 60,  unit: '%' },
                  { label: 'Grid width', key: 'gridWidthPct' as const, min: 50, max: 100, unit: '%' },
                ].map(({ label, key, min, max, unit }) => (
                  <div key={key} className="flex items-center gap-2">
                    <span className="w-20 shrink-0">{label}</span>
                    <input
                      type="range" min={min} max={max} step={1}
                      value={swipeCalibration[key]}
                      onChange={(e) => {
                        const v = parseFloat(e.target.value)
                        const next = { ...swipeCalibration, [key]: v }
                        setSwipeCalibration(next)
                        Swipe.setCalibration({ ...next, gridSize }).catch(() => {})
                      }}
                      className="flex-1 accent-violet-500"
                    />
                    <span className="w-8 text-right">{Math.round(swipeCalibration[key])}{unit}</span>
                  </div>
                ))}

                {/* Swipe delay — lets any "word found" popup clear before the next gesture */}
                <div className="flex items-center gap-2 mt-1">
                  <span className="w-20 shrink-0">Swipe delay</span>
                  <input
                    type="range" min={0} max={1500} step={50}
                    value={swipeCalibration.swipeDelayMs}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value)
                      const next = { ...swipeCalibration, swipeDelayMs: v }
                      setSwipeCalibration(next)
                      Swipe.setCalibration({ ...next, gridSize }).catch(() => {})
                    }}
                    className="flex-1 accent-violet-500"
                  />
                  <span className="w-10 text-right">{swipeCalibration.swipeDelayMs}ms</span>
                </div>
                <p className="text-[10px] text-slate-600 -mt-1">
                  Delay before each swipe — increase if gestures land on score popups instead of the grid
                </p>
              </div>

              <button
                onClick={isCalibrating ? onHideCalibration : onShowCalibration}
                className={`py-2.5 rounded-xl text-xs font-semibold transition-colors ${
                  isCalibrating
                    ? 'bg-emerald-900/50 text-emerald-300 border border-emerald-700'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                {isCalibrating ? '✕  Hide calibration grid' : '⊞  Preview calibration grid'}
              </button>
              <p className="text-[10px] text-slate-600 -mt-1">
                Opens a grid overlay so you can align it with the Netflix Boggle board.
                Switch to Netflix, then come back to adjust and preview again.
              </p>
            </>
          )}
        </div>
      </div>
    </>
  )
}
