import { useBoggleStore } from '../store/boggleStore'

export function LengthRangeSlider() {
  const { minLen, maxLen, setMinLen, setMaxLen } = useBoggleStore()

  return (
    <div className="flex flex-col gap-2 w-full max-w-xs">
      <div className="flex justify-between text-xs text-slate-400">
        <span>Min length: <span className="text-emerald-400 font-semibold">{minLen}</span></span>
        <span>Max length: <span className="text-emerald-400 font-semibold">{maxLen}</span></span>
      </div>
      <div className="flex gap-3 items-center">
        <input
          type="range" min={3} max={maxLen} value={minLen}
          onChange={(e) => setMinLen(Number(e.target.value))}
          className="w-full accent-emerald-500 h-1.5"
          aria-label="Minimum word length"
        />
        <input
          type="range" min={minLen} max={12} value={maxLen}
          onChange={(e) => setMaxLen(Number(e.target.value))}
          className="w-full accent-emerald-500 h-1.5"
          aria-label="Maximum word length"
        />
      </div>
    </div>
  )
}
