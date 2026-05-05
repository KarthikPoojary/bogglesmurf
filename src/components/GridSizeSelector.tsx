import { useBoggleStore } from '../store/boggleStore'

const SIZES = [4, 5, 6] as const

export function GridSizeSelector() {
  const { gridSize, setGridSize } = useBoggleStore()

  return (
    <div className="flex rounded-lg overflow-hidden border border-slate-700 w-fit">
      {SIZES.map((size) => (
        <button
          key={size}
          onClick={() => setGridSize(size)}
          className={`px-4 py-2 text-sm font-medium transition-colors ${
            gridSize === size
              ? 'bg-emerald-600 text-white'
              : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
          }`}
        >
          {size}×{size}
        </button>
      ))}
    </div>
  )
}
