import { useRef, useState, useCallback } from 'react'
import { useBoggleStore } from '../store/boggleStore'

interface Props {
  onClose: () => void
}

type Stage = 'pick' | 'preview' | 'processing' | 'done' | 'error'

export function OcrCapture({ onClose }: Props) {
  const { setLetter, setGridSize } = useBoggleStore()
  const fileRef = useRef<HTMLInputElement>(null)
  const cameraRef = useRef<HTMLInputElement>(null)

  const [stage, setStage] = useState<Stage>('pick')
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [progressMsg, setProgressMsg] = useState('')
  const [resultSummary, setResultSummary] = useState('')
  const [errorMsg, setErrorMsg] = useState('')

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
    setProgressMsg('Starting…')
    try {
      const { ocrGrid } = await import('../ocr/gridOcr')
      const { grid, gridSize } = await ocrGrid(file, setProgressMsg)

      setGridSize(gridSize)
      for (let r = 0; r < gridSize; r++) {
        for (let c = 0; c < gridSize; c++) {
          setLetter(r, c, grid[r][c])
        }
      }

      const filled = grid.flat().filter(Boolean).length
      const total = gridSize * gridSize
      setResultSummary(`${gridSize}×${gridSize} grid detected · ${filled}/${total} letters read`)
      setStage('done')
      // Auto-close after a moment so user can correct any misreads
      setTimeout(onClose, 1800)
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'OCR failed — try a clearer photo')
      setStage('error')
    }
  }

  const reset = () => {
    if (imageUrl) URL.revokeObjectURL(imageUrl)
    setImageUrl(null)
    setFile(null)
    setProgressMsg('')
    setStage('pick')
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
          <div>
            <h2 className="font-semibold text-slate-100">Scan Boggle Grid</h2>
            <p className="text-[11px] text-slate-500 mt-0.5">Grid size is detected automatically</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200 text-2xl leading-none w-8 h-8 flex items-center justify-center">×</button>
        </div>

        <div className="p-5 flex flex-col gap-4">

          {/* PICK */}
          {stage === 'pick' && (
            <>
              <p className="text-sm text-slate-400">
                Take a photo of the Boggle grid or upload one. Try to capture the full grid squarely — the app detects size and letters automatically.
              </p>
              <div className="flex flex-col gap-2.5">
                <button onClick={() => cameraRef.current?.click()}
                  className="flex items-center justify-center gap-2 w-full py-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold transition-colors text-base">
                  📷 Take Photo
                </button>
                <button onClick={() => fileRef.current?.click()}
                  className="flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium transition-colors">
                  🖼 Upload from Gallery
                </button>
              </div>
              <p className="text-[11px] text-slate-600 text-center">
                Works best with good lighting and the grid filling most of the frame
              </p>
              <input ref={cameraRef} type="file" accept="image/*" capture="environment" onChange={handleInputChange} className="hidden" />
              <input ref={fileRef} type="file" accept="image/*" onChange={handleInputChange} className="hidden" />
            </>
          )}

          {/* PREVIEW */}
          {stage === 'preview' && imageUrl && (
            <>
              <div className="rounded-xl overflow-hidden bg-black">
                <img src={imageUrl} alt="Grid preview" className="w-full object-contain max-h-72" />
              </div>
              <p className="text-xs text-slate-500 text-center -mt-1">
                Make sure the entire grid is visible and not cut off
              </p>
              <div className="flex gap-2">
                <button onClick={reset}
                  className="flex-1 py-3 rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700 font-medium text-sm transition-colors">
                  Retake
                </button>
                <button onClick={runOcr}
                  className="flex-1 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm transition-colors">
                  Extract Letters →
                </button>
              </div>
            </>
          )}

          {/* PROCESSING */}
          {stage === 'processing' && (
            <div className="flex flex-col items-center gap-5 py-6">
              {/* Animated spinner */}
              <div className="w-12 h-12 rounded-full border-4 border-slate-700 border-t-emerald-500 animate-spin" />
              <div className="text-center">
                <p className="text-sm text-slate-200 font-medium">{progressMsg}</p>
                <p className="text-[11px] text-slate-600 mt-1">First run downloads ~3 MB engine · cached after that</p>
              </div>
            </div>
          )}

          {/* DONE */}
          {stage === 'done' && (
            <div className="flex flex-col items-center gap-3 py-5">
              <div className="text-5xl">✅</div>
              <p className="text-slate-200 font-semibold text-center">{resultSummary}</p>
              <p className="text-xs text-slate-500">Check any empty cells and correct misreads, then hit Solve</p>
            </div>
          )}

          {/* ERROR */}
          {stage === 'error' && (
            <div className="flex flex-col gap-4">
              <div className="bg-red-950/40 border border-red-800 rounded-xl p-4">
                <p className="text-red-300 text-sm">{errorMsg}</p>
              </div>
              <div className="text-xs text-slate-500 space-y-1">
                <p>Tips for better results:</p>
                <ul className="list-disc list-inside space-y-0.5 text-slate-600">
                  <li>Hold the phone directly above the grid</li>
                  <li>Make sure all tiles are in frame</li>
                  <li>Use bright, even lighting</li>
                  <li>Avoid glare on the tiles</li>
                </ul>
              </div>
              <div className="flex gap-2">
                <button onClick={reset}
                  className="flex-1 py-2.5 rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700 font-medium text-sm">
                  Try Again
                </button>
                <button onClick={onClose}
                  className="flex-1 py-2.5 rounded-xl bg-slate-700 text-slate-300 hover:bg-slate-600 font-medium text-sm">
                  Type Manually
                </button>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}
