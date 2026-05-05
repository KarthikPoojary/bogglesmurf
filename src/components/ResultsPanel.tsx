import { useBoggleStore } from '../store/boggleStore'

function boggleScore(len: number): number {
  if (len <= 4) return 1
  if (len === 5) return 2
  if (len === 6) return 3
  if (len === 7) return 5
  return 11
}

export function ResultsPanel() {
  const { solutions, selectedWord, setSelectedWord, isSolving } = useBoggleStore()

  if (isSolving) {
    return (
      <div className="flex items-center justify-center h-32 text-slate-400 text-sm">
        Solving…
      </div>
    )
  }

  if (solutions.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-slate-500 text-sm">
        Fill the grid and tap Solve
      </div>
    )
  }

  // Group by length
  const grouped = new Map<number, typeof solutions>()
  for (const s of solutions) {
    const g = grouped.get(s.word.length) ?? []
    g.push(s)
    grouped.set(s.word.length, g)
  }
  const lengths = [...grouped.keys()].sort((a, b) => b - a)

  const copyAll = () => navigator.clipboard.writeText(solutions.map((s) => s.word).join('\n'))

  return (
    <div className="flex flex-col gap-2 w-full">
      <div className="flex justify-between items-center">
        <p className="text-xs text-slate-400">{solutions.length} words found</p>
        <button
          onClick={copyAll}
          className="text-xs text-emerald-400 hover:text-emerald-300 transition-colors"
        >
          Copy all
        </button>
      </div>

      <div className="overflow-y-auto max-h-[50vh] flex flex-col gap-3 pr-1">
        {lengths.map((len) => (
          <div key={len}>
            <div className="sticky top-0 bg-slate-900/90 backdrop-blur-sm py-1 flex items-center gap-2 mb-1.5">
              <span className="text-xs font-semibold text-slate-300">{len} letters</span>
              <span className="text-[10px] text-slate-500 bg-slate-800 rounded-full px-2 py-0.5">
                {grouped.get(len)!.length} · {boggleScore(len)} pts
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {grouped.get(len)!.map((s) => (
                <button
                  key={s.word}
                  onClick={() => setSelectedWord(selectedWord === s.word ? null : s.word)}
                  className={`px-2.5 py-1 rounded-md text-sm font-medium transition-colors ${
                    selectedWord === s.word
                      ? 'bg-emerald-600 text-white'
                      : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
                  }`}
                >
                  {s.word}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
