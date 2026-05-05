import { useRef, useState, useCallback } from 'react'
import { useBoggleStore } from '../store/boggleStore'
import type { OcrProgress } from '../ocr/gridOcr'

interface Props {
  onClose: () => void
}

type Stage = 'pick' | 'preview' | 'processing' | 'done' | 'error'

export function OcrCapture({ onClose }: Props) {
  const { gridSize, setLetter, setGridSize } = useBoggleStore()
  const fileRef = useRef<HTMLInputElement>(null)
  const cameraRef = useRef<HTMLInputElement>(null)

  const [stage, setStage] = useState<Stage>('pick')
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [progress, setProgress] = useState<OcrProgress | null>(null)
  const [errorMsg, setErrorMsg] = useState('')
  const [localSize, setLocalSize] = useState<4 | 5 | 6>(gridSize)

  const handleFile = useCallback((f: File) => {
    setFile(f)
    setImageUrl(URL.createObjectURL(f))
    setStage('preview')
  }, [])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (f) handleFile(f)
  }

  const runOcr = async () => {
    if (!file) return
    setStage('processing')
    setGridSize(localSize)
    try {
      const { ocrGrid } = await import('../ocr/gridOcr')
      const result = await ocrGrid(file, localSize, setProgress)
      // Populate store
      for (let r = 0; r < localSize; r++) {
        for (let c = 0; c < localSize; c++) {
          setLetter(r, c, result[r][c])
        }
      }
      setStage('done')
      setTimeout(onClose, 800)
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'OCR failed')
      setStage('error')
    }
  }

  const reset = () => {
    if (imageUrl) URL.revokeObjectURL(imageUrl)
    setImageUrl(null)
    setFile(null)
    setProgress(null)
    setStage('pick')
  }

  const pct = progress ? Math.round((progress.current / progress.total) * 100) : 0

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
          <h2 className="font-semibold text-slate-100">Scan Boggle Grid</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200 text-xl leading-none">×</button>
        </div>

        <div className="p-5 flex flex-col gap-4">

          {/* PICK stage */}
          {stage === 'pick' && (
            <>
              <p className="text-sm text-slate-400">
                Point your camera at the Boggle grid (or upload a photo). Try to fill the frame with just the grid.
              </p>

              {/* Grid size selector */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-slate-500 font-medium">Grid size in the photo</label>
                <div className="flex rounded-lg overflow-hidden border border-slate-700 w-fit">
                  {([4, 5, 6] as const).map((s) => (
                    <button key={s} onClick={() => setLocalSize(s)}
                      className={`px-4 py-2 text-sm font-medium transition-colors ${localSize === s ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}>
                      {s}×{s}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-2.5">
                {/* Camera capture — opens rear camera on mobile */}
                <button
                  onClick={() => cameraRef.current?.click()}
                  className="flex items-center justify-center gap-2 w-full py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold transition-colors"
                >
                  📷 Take Photo
                </button>

                {/* File upload */}
                <button
                  onClick={() => fileRef.current?.click()}
                  className="flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium transition-colors"
                >
                  🖼 Upload Image
                </button>
              </div>

              {/* Hidden inputs */}
              <input ref={cameraRef} type="file" accept="image/*" capture="environment"
                onChange={handleInputChange} className="hidden" />
              <input ref={fileRef} type="file" accept="image/*"
                onChange={handleInputChange} className="hidden" />
            </>
          )}

          {/* PREVIEW stage */}
          {stage === 'preview' && imageUrl && (
            <>
              <div className="relative rounded-xl overflow-hidden bg-black">
                <img src={imageUrl} alt="Grid preview" className="w-full object-contain max-h-64" />
                {/* SVG grid overlay */}
                <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
                  {Array.from({ length: localSize - 1 }, (_, i) => {
                    const pct = ((i + 1) / localSize) * 100
                    return (
                      <g key={i}>
                        <line x1={pct} y1="0" x2={pct} y2="100" stroke="rgba(52,211,153,0.7)" strokeWidth="0.5" />
                        <line x1="0" y1={pct} x2="100" y2={pct} stroke="rgba(52,211,153,0.7)" strokeWidth="0.5" />
                      </g>
                    )
                  })}
                  <rect x="0" y="0" width="100" height="100" fill="none" stroke="rgba(52,211,153,0.9)" strokeWidth="1" />
                </svg>
              </div>
              <p className="text-xs text-slate-500 text-center">
                Green lines show where the {localSize}×{localSize} cells will be split. Make sure the grid fills the photo.
              </p>
              <div className="flex gap-2">
                <button onClick={reset}
                  className="flex-1 py-2.5 rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700 font-medium text-sm transition-colors">
                  Retake
                </button>
                <button onClick={runOcr}
                  className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm transition-colors">
                  Extract Letters
                </button>
              </div>
            </>
          )}

          {/* PROCESSING stage */}
          {stage === 'processing' && (
            <div className="flex flex-col items-center gap-4 py-4">
              <div className="w-full bg-slate-800 rounded-full h-2.5">
                <div
                  className="bg-emerald-500 h-2.5 rounded-full transition-all duration-300"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <p className="text-sm text-slate-300">
                {progress ? (
                  <>Reading cell <span className="text-emerald-400 font-mono">{progress.current}/{progress.total}</span>
                  {progress.letter && <> — found <span className="font-bold text-emerald-300">{progress.letter}</span></>}</>
                ) : 'Loading OCR engine…'}
              </p>
              <p className="text-xs text-slate-600">First run downloads ~3 MB engine. Cached after that.</p>
            </div>
          )}

          {/* DONE stage */}
          {stage === 'done' && (
            <div className="flex flex-col items-center gap-3 py-4">
              <div className="text-4xl">✅</div>
              <p className="text-slate-200 font-medium">Grid populated! Check for any misreads.</p>
            </div>
          )}

          {/* ERROR stage */}
          {stage === 'error' && (
            <div className="flex flex-col gap-3">
              <p className="text-red-400 text-sm">{errorMsg}</p>
              <button onClick={reset}
                className="py-2.5 rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700 font-medium text-sm">
                Try Again
              </button>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}
