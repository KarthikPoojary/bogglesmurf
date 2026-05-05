import { useEffect, useRef, useState } from 'react'
import { GridSizeSelector } from './components/GridSizeSelector'
import { BoggleGrid } from './components/BoggleGrid'
import { LengthRangeSlider } from './components/LengthRangeSlider'
import { ResultsPanel } from './components/ResultsPanel'
import { OcrCapture } from './components/OcrCapture'
import { SyncBanner } from './components/SyncBanner'
import { useBoggleStore } from './store/boggleStore'
import { useGridSync } from './hooks/useGridSync'
import { loadDictionary } from './solver/loadDictionary'
import { solve } from './solver/solver'
import type { Trie } from './solver/Trie'
import type { Solution } from './solver/solver'

export default function App() {
  const {
    gridSize, letters, minLen, maxLen,
    solutions, selectedWord,
    clearGrid, setSolutions, setIsSolving,
  } = useBoggleStore()

  const trieRef = useRef<Trie | null>(null)
  const [dictLoading, setDictLoading] = useState(true)
  const [dictError, setDictError] = useState(false)
  const [showOcr, setShowOcr] = useState(false)

  const { status: syncStatus, broadcastGrid, endSession } = useGridSync()

  useEffect(() => {
    loadDictionary()
      .then((t) => { trieRef.current = t; setDictLoading(false) })
      .catch(() => { setDictError(true); setDictLoading(false) })
  }, [])

  const handleSolve = () => {
    if (!trieRef.current) return
    const grid = letters.map((row) => row.map((l) => l || ' '))
    setIsSolving(true)
    setTimeout(() => {
      const results = solve(grid, trieRef.current!, minLen, maxLen)
      setSolutions(results)
      setIsSolving(false)
    }, 0)
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !dictLoading && gridFilled && !showOcr) handleSolve()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const selectedSolution: Solution | null =
    solutions.find((s) => s.word === selectedWord) ?? null

  const gridFilled = letters.flat().filter(Boolean).length === gridSize * gridSize

  // Watchers can't edit the grid
  const isWatcher = syncStatus.sessionActive && !syncStatus.isHost

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center px-4 py-6 gap-5">

      {/* Header */}
      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-tight">🍄 BoggleSmurf</h1>
        {dictLoading && <p className="text-xs text-slate-500 mt-1">Loading dictionary…</p>}
        {dictError && <p className="text-xs text-red-400 mt-1">Dictionary failed to load</p>}
        {!dictLoading && !dictError && (
          <p className="text-xs text-emerald-600 mt-1">238k words ready</p>
        )}
      </div>

      {/* Sync banner */}
      <SyncBanner
        status={syncStatus}
        onShare={broadcastGrid}
        onEndSession={endSession}
      />

      {/* Watcher notice */}
      {isWatcher && (
        <p className="text-xs text-slate-500 -mt-2">
          📡 Viewing host's grid — solve when they share it
        </p>
      )}

      {/* Controls — hidden for watchers */}
      {!isWatcher && (
        <div className="flex flex-col items-center gap-4 w-full max-w-sm">
          <GridSizeSelector />
          <LengthRangeSlider />
        </div>
      )}

      {/* Camera scan */}
      {!isWatcher && (
        <button
          onClick={() => setShowOcr(true)}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl border border-emerald-700 bg-emerald-950/60
            text-emerald-300 text-sm font-medium hover:bg-emerald-900/60 transition-colors"
        >
          📷 Scan Grid with Camera
        </button>
      )}

      {/* Grid */}
      <div className={isWatcher ? 'opacity-80 pointer-events-none' : ''}>
        <BoggleGrid selectedSolution={selectedSolution} />
      </div>

      {/* Action buttons */}
      <div className="flex gap-3">
        <button
          onClick={handleSolve}
          disabled={dictLoading || !gridFilled}
          className="px-6 py-3 rounded-xl bg-emerald-600 text-white font-semibold text-sm
            hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors min-w-[100px]"
        >
          Solve
        </button>
        {!isWatcher && (
          <button
            onClick={clearGrid}
            className="px-6 py-3 rounded-xl bg-slate-800 text-slate-300 font-semibold text-sm hover:bg-slate-700 transition-colors"
          >
            Clear
          </button>
        )}
      </div>

      {!isWatcher && (
        <p className="text-[11px] text-slate-600 -mt-2">
          Tab / arrows to navigate · Enter to solve
        </p>
      )}

      {/* Results */}
      <div className="w-full max-w-sm pb-8">
        <ResultsPanel />
      </div>

      {/* OCR modal */}
      {showOcr && <OcrCapture onClose={() => setShowOcr(false)} />}
    </div>
  )
}
