import { useRef, useCallback } from 'react'
import { useBoggleStore } from '../store/boggleStore'
import type { Solution } from '../solver/solver'

interface Props {
  selectedSolution: Solution | null
}

export function BoggleGrid({ selectedSolution }: Props) {
  const { gridSize, letters, setLetter } = useBoggleStore()
  const refs = useRef<(HTMLInputElement | null)[][]>(
    Array.from({ length: 6 }, () => Array(6).fill(null))
  )

  const focus = useCallback((row: number, col: number) => {
    refs.current[row]?.[col]?.focus()
  }, [])

  const handleChange = (row: number, col: number, value: string) => {
    const ch = value.replace(/[^a-zA-Z]/g, '').slice(-1)
    setLetter(row, col, ch)
    if (ch) {
      const next = col + 1 < gridSize ? [row, col + 1] : row + 1 < gridSize ? [row + 1, 0] : null
      if (next) focus(next[0], next[1])
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent, row: number, col: number) => {
    if (e.key === 'Backspace' && !letters[row][col]) {
      const prev = col > 0 ? [row, col - 1] : row > 0 ? [row - 1, gridSize - 1] : null
      if (prev) { focus(prev[0], prev[1]); e.preventDefault() }
    }
    if (e.key === 'ArrowRight') focus(row, Math.min(col + 1, gridSize - 1))
    if (e.key === 'ArrowLeft') focus(row, Math.max(col - 1, 0))
    if (e.key === 'ArrowDown') focus(Math.min(row + 1, gridSize - 1), col)
    if (e.key === 'ArrowUp') focus(Math.max(row - 1, 0), col)
  }

  const pathSet = new Set(
    selectedSolution?.path.map((c) => `${c.row},${c.col}`) ?? []
  )
  const pathIndex = new Map(
    selectedSolution?.path.map((c, i) => [`${c.row},${c.col}`, i]) ?? []
  )

  const cellSize = gridSize === 4 ? 'w-16 h-16 text-2xl' : gridSize === 5 ? 'w-13 h-13 text-xl' : 'w-11 h-11 text-lg'

  return (
    <div className="relative inline-block">
      <div
        className="grid gap-1.5"
        style={{ gridTemplateColumns: `repeat(${gridSize}, 1fr)` }}
      >
        {Array.from({ length: gridSize }, (_, row) =>
          Array.from({ length: gridSize }, (_, col) => {
            const key = `${row},${col}`
            const inPath = pathSet.has(key)
            const idx = pathIndex.get(key)
            return (
              <div key={key} className="relative">
                <input
                  ref={(el) => { refs.current[row][col] = el }}
                  type="text"
                  inputMode="text"
                  maxLength={2}
                  value={letters[row]?.[col] ?? ''}
                  onChange={(e) => handleChange(row, col, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(e, row, col)}
                  onFocus={(e) => e.target.select()}
                  className={`${cellSize} rounded-lg border-2 text-center font-bold uppercase tracking-widest transition-all outline-none
                    ${inPath
                      ? 'border-emerald-400 bg-emerald-900/60 text-emerald-200 shadow-lg shadow-emerald-500/20'
                      : 'border-slate-700 bg-slate-800 text-slate-100 focus:border-emerald-500 focus:bg-slate-700'
                    }`}
                  style={{ caretColor: 'transparent' }}
                  aria-label={`Row ${row + 1}, column ${col + 1}`}
                />
                {inPath && idx !== undefined && (
                  <span className="absolute -top-1.5 -right-1.5 text-[10px] font-bold bg-emerald-500 text-white rounded-full w-4 h-4 flex items-center justify-center leading-none">
                    {idx + 1}
                  </span>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
