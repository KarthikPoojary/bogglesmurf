import type { SyncStatus } from '../hooks/useGridSync'

interface Props {
  status: SyncStatus
  onShare: () => void
  onEndSession: () => void
}

function fmt(ms: number): string {
  const s = Math.ceil(ms / 1000)
  return s > 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`
}

export function SyncBanner({ status, onShare, onEndSession }: Props) {
  if (!status.connected) return null

  // No session — show "Share Grid" button (only useful once grid is filled)
  if (!status.sessionActive) {
    return (
      <button
        onClick={onShare}
        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 border border-slate-700
          text-slate-300 text-xs font-medium hover:bg-slate-700 transition-colors"
      >
        🔗 Share Grid with Others ({fmt(120_000)})
      </button>
    )
  }

  // Active session
  const timerColor = status.remainingMs < 30_000
    ? 'text-red-400'
    : status.remainingMs < 60_000
    ? 'text-amber-400'
    : 'text-emerald-400'

  return (
    <div className={`flex items-center gap-3 px-4 py-2.5 rounded-xl text-xs font-medium w-full max-w-sm
      border ${status.isHost ? 'bg-emerald-950/40 border-emerald-800' : 'bg-slate-800/60 border-slate-700'}`}>
      <span className="relative flex h-2 w-2 shrink-0">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
      </span>

      <span className="flex-1 text-slate-300">
        {status.isHost ? 'You are sharing this grid' : 'Viewing shared grid'}
      </span>

      <span className={`font-mono font-bold ${timerColor}`}>
        {fmt(status.remainingMs)}
      </span>

      {status.isHost && (
        <button onClick={onEndSession} className="text-slate-500 hover:text-red-400 transition-colors ml-1">
          ✕
        </button>
      )}

      {status.error && (
        <span className="text-red-400 text-[10px]">{status.error}</span>
      )}
    </div>
  )
}
