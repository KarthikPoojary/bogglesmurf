import { useEffect, useState } from 'react'
import { useBoggleStore } from '../store/boggleStore'
import { loadCommonWords } from '../solver/loadCommonWords'
import { useOverlay } from '../hooks/useOverlay'
import { Overlay } from '../plugins/OverlayPlugin'

type Tab = 'common' | 'unusual' | 'all'

function boggleScore(len: number): number {
  if (len <= 4) return 1
  if (len === 5) return 2
  if (len === 6) return 3
  if (len === 7) return 5
  return 11
}

export function ResultsPanel() {
  const { solutions, selectedWord, setSelectedWord, isSolving, overlayAlpha, setOverlayAlpha } = useBoggleStore()
  const [commonWords, setCommonWords] = useState<Set<string>>(new Set())
  const [tab, setTab] = useState<Tab>('common')
  const { isSupported: overlaySupported, isVisible: overlayVisible, floatWords, hideOverlay, updateAlpha } = useOverlay()

  useEffect(() => {
    loadCommonWords().then(setCommonWords)
  }, [])

  if (isSolving) {
    return <div className="flex items-center justify-center h-32 text-slate-400 text-sm">Solving…</div>
  }

  if (solutions.length === 0) {
    return <div className="flex items-center justify-center h-32 text-slate-500 text-sm">Fill the grid and tap Solve</div>
  }

  const commonList = solutions.filter((s) => commonWords.has(s.word))
  const unusualList = solutions.filter((s) => !commonWords.has(s.word))

  const displayed = tab === 'all' ? solutions : tab === 'common' ? commonList : unusualList

  // Group by word length
  const grouped = new Map<number, typeof solutions>()
  for (const s of displayed) {
    const g = grouped.get(s.word.length) ?? []
    g.push(s)
    grouped.set(s.word.length, g)
  }
  const lengths = [...grouped.keys()].sort((a, b) => b - a)

  const copyAll = () =>
    navigator.clipboard.writeText(displayed.map((s) => s.word).join('\n'))

  const tabClass = (t: Tab) =>
    `flex-1 py-2 text-xs font-semibold rounded-lg transition-colors ${
      tab === t
        ? 'bg-slate-700 text-slate-100'
        : 'text-slate-500 hover:text-slate-300'
    }`

  return (
    <div className="flex flex-col gap-3 w-full">
      {/* Tabs */}
      <div className="flex gap-1 bg-slate-900 border border-slate-800 rounded-xl p-1">
        <button className={tabClass('common')} onClick={() => setTab('common')}>
          Common
          <span className="ml-1.5 text-[10px] bg-slate-600 text-slate-300 rounded-full px-1.5 py-0.5">
            {commonList.length}
          </span>
        </button>
        <button className={tabClass('unusual')} onClick={() => setTab('unusual')}>
          Unusual
          <span className="ml-1.5 text-[10px] bg-slate-600 text-slate-300 rounded-full px-1.5 py-0.5">
            {unusualList.length}
          </span>
        </button>
        <button className={tabClass('all')} onClick={() => setTab('all')}>
          All
          <span className="ml-1.5 text-[10px] bg-slate-600 text-slate-300 rounded-full px-1.5 py-0.5">
            {solutions.length}
          </span>
        </button>
      </div>

      {/* Tab description */}
      {tab === 'common' && (
        <p className="text-[11px] text-slate-600 -mt-1">
          Everyday words — safe to play, likely accepted
        </p>
      )}
      {tab === 'unusual' && (
        <p className="text-[11px] text-slate-600 -mt-1">
          SOWPODS-only — valid in Scrabble but might raise eyebrows 🤨
        </p>
      )}

      {/* Header row */}
      <div className="flex justify-between items-center">
        <p className="text-xs text-slate-400">{displayed.length} words</p>
        <div className="flex gap-3 items-center">
          {overlaySupported && (
            <button
              onClick={() => {
                if (overlayVisible) {
                  hideOverlay()
                } else {
                  const allWords = solutions.map((s) => s.word)
                  const commonList = solutions.filter((s) => commonWords.has(s.word)).map((s) => s.word)
                  floatWords(allWords, commonList)
                }
              }}
              className="text-xs text-violet-400 hover:text-violet-300 transition-colors"
            >
              {overlayVisible ? 'Hide overlay' : 'Float ↗'}
            </button>
          )}
          <button onClick={copyAll} className="text-xs text-emerald-400 hover:text-emerald-300 transition-colors">
            Copy all
          </button>
        </div>
      </div>

      {/* Overlay alpha setting — Android only */}
      {overlaySupported && (
        <div className="flex flex-col gap-2 bg-slate-900/60 rounded-xl p-3 border border-slate-800">
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-slate-400 font-medium">Overlay transparency</span>
            <span className="text-[11px] text-slate-500">{Math.round((1 - overlayAlpha) * 100)}%</span>
          </div>
          <input
            type="range" min={0.3} max={1} step={0.05}
            value={overlayAlpha}
            onChange={(e) => {
              const v = parseFloat(e.target.value)
              setOverlayAlpha(v)
              updateAlpha(v)
              if (!overlayVisible) Overlay.setAlpha({ alpha: v }).catch(() => {})
            }}
            className="w-full accent-violet-500"
          />
          {/* Live preview card */}
          <div
            className="rounded-lg overflow-hidden border border-slate-700 text-[10px]"
            style={{ opacity: overlayAlpha }}
          >
            <div className="bg-slate-800 px-2 py-1 flex justify-between items-center">
              <span className="text-violet-400 font-bold">BoggleSmurf ⚡</span>
              <span className="text-slate-500">✕</span>
            </div>
            <div className="bg-slate-900/90 flex">
              <span className="flex-1 text-center py-0.5 bg-indigo-900 text-violet-400 font-bold">COM</span>
              <span className="flex-1 text-center py-0.5 text-slate-500">UNQ</span>
              <span className="flex-1 text-center py-0.5 text-slate-500">ALL</span>
            </div>
            <div className="bg-slate-900/90 px-2 py-1 flex flex-col gap-0.5">
              {['STONE', 'TONE', 'NOTE', 'ONES'].map((w) => (
                <span key={w} className="text-slate-300">{w}</span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Word groups */}
      {displayed.length === 0 ? (
        <p className="text-sm text-slate-600 text-center py-6">
          {tab === 'common' ? 'No common words found in this grid.' : 'No unusual words found.'}
        </p>
      ) : (
        <div className="overflow-y-auto max-h-[50vh] flex flex-col gap-3 pr-1">
          {lengths.map((len) => (
            <div key={len}>
              <div className="sticky top-0 bg-slate-950/95 backdrop-blur-sm py-1 flex items-center gap-2 mb-1.5">
                <span className="text-xs font-semibold text-slate-300">{len} letters</span>
                <span className="text-[10px] text-slate-500 bg-slate-800 rounded-full px-2 py-0.5">
                  {grouped.get(len)!.length} · {boggleScore(len)} pts each
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
                        : tab === 'unusual'
                        ? 'bg-violet-900/50 text-violet-200 hover:bg-violet-800/60'
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
      )}
    </div>
  )
}
