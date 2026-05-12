import { useRef, useState, useCallback } from 'react'
import { useBoggleStore } from '../store/boggleStore'

interface Props {
  onClose: () => void
}

type Stage = 'pick' | 'preview' | 'processing' | 'done' | 'error' | 'api-keys'

interface CropBox {
  x: number  // percent of image width
  y: number  // percent of image height
  w: number
  h: number
}

interface DragState {
  mode: 'move' | 'resize'
  startX: number
  startY: number
  startCrop: CropBox
}

function ApiKeysForm({
  initialGroq, initialGemini, onSave, onCancel,
}: {
  initialGroq: string
  initialGemini: string
  onSave: (groq: string, gemini: string) => void
  onCancel: () => void
}) {
  const [groq, setGroq] = useState(initialGroq)
  const [gemini, setGemini] = useState(initialGemini)
  return (
    <>
      <p className="text-xs text-slate-400">
        Paste a vision-model API key to get near-100% OCR accuracy. Keys are
        stored locally on this device only and sent only to the provider when you scan.
      </p>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <label className="text-xs text-slate-300 font-medium">Groq (primary)</label>
          <a
            href="https://console.groq.com/keys"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] text-violet-400 hover:text-violet-300 underline"
          >
            Get a free key ↗
          </a>
        </div>
        <input
          type="password"
          value={groq}
          onChange={(e) => setGroq(e.target.value.trim())}
          placeholder="gsk_…"
          className="w-full px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 text-sm font-mono focus:outline-none focus:border-violet-500"
        />
        <p className="text-[10px] text-slate-600">Free: 1,000 requests/day · Llama-4-Scout vision · ~1s per scan</p>
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <label className="text-xs text-slate-300 font-medium">Gemini (fallback)</label>
          <a
            href="https://aistudio.google.com/apikey"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] text-violet-400 hover:text-violet-300 underline"
          >
            Get a free key ↗
          </a>
        </div>
        <input
          type="password"
          value={gemini}
          onChange={(e) => setGemini(e.target.value.trim())}
          placeholder="AIza…"
          className="w-full px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 text-sm font-mono focus:outline-none focus:border-violet-500"
        />
        <p className="text-[10px] text-slate-600">Free: 500 requests/day · Gemini 2.5 Flash · ~4s per scan</p>
      </div>

      <p className="text-[10px] text-slate-600">
        If both fail or are blank, the app falls back to on-device OCR (slower and less accurate).
      </p>

      <div className="flex gap-2 mt-1">
        <button
          onClick={onCancel}
          className="flex-1 py-2.5 rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700 font-medium text-sm transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={() => onSave(groq, gemini)}
          className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm transition-colors"
        >
          Save
        </button>
      </div>
    </>
  )
}

// Crop the file to the given percentage box and return a new File
async function cropImageFile(file: File, crop: CropBox): Promise<File> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      const sx = (crop.x / 100) * img.naturalWidth
      const sy = (crop.y / 100) * img.naturalHeight
      const sw = (crop.w / 100) * img.naturalWidth
      const sh = (crop.h / 100) * img.naturalHeight
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(sw))
      canvas.height = Math.max(1, Math.round(sh))
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height)
      canvas.toBlob(
        (blob) => {
          if (!blob) { reject(new Error('Failed to crop image')); return }
          resolve(new File([blob], 'cropped.jpg', { type: 'image/jpeg' }))
        },
        'image/jpeg',
        0.92,
      )
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Failed to load image for crop')) }
    img.src = url
  })
}

export function OcrCapture({ onClose }: Props) {
  const {
    setLetter, setGridSize, gridSize: storeGridSize,
    groqApiKey, geminiApiKey, setGroqApiKey, setGeminiApiKey,
  } = useBoggleStore()
  const fileRef = useRef<HTMLInputElement>(null)
  const cameraRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<DragState | null>(null)

  const [stage, setStage] = useState<Stage>('pick')
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [progressMsg, setProgressMsg] = useState('')
  const [diagLog, setDiagLog] = useState<string[]>([])
  const [resultSummary, setResultSummary] = useState('')
  const [errorMsg, setErrorMsg] = useState('')
  const [crop, setCrop] = useState<CropBox>({ x: 10, y: 25, w: 80, h: 50 })

  const handleFile = useCallback((f: File) => {
    setFile(f)
    setImageUrl(URL.createObjectURL(f))
    setStage('preview')
    setCrop({ x: 10, y: 25, w: 80, h: 50 })
  }, [])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (f) handleFile(f)
  }

  const startDrag = (e: React.PointerEvent, mode: 'move' | 'resize') => {
    e.preventDefault()
    e.stopPropagation()
    dragRef.current = { mode, startX: e.clientX, startY: e.clientY, startCrop: { ...crop } }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }

  const onContainerPointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current
    if (!drag || !containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    const dx = ((e.clientX - drag.startX) / rect.width) * 100
    const dy = ((e.clientY - drag.startY) / rect.height) * 100

    if (drag.mode === 'move') {
      setCrop({
        ...drag.startCrop,
        x: Math.max(0, Math.min(100 - drag.startCrop.w, drag.startCrop.x + dx)),
        y: Math.max(0, Math.min(100 - drag.startCrop.h, drag.startCrop.y + dy)),
      })
    } else {
      setCrop({
        ...drag.startCrop,
        w: Math.max(15, Math.min(100 - drag.startCrop.x, drag.startCrop.w + dx)),
        h: Math.max(15, Math.min(100 - drag.startCrop.y, drag.startCrop.h + dy)),
      })
    }
  }

  const endDrag = () => { dragRef.current = null }

  const runOcr = async () => {
    if (!file) return
    setStage('processing')
    setProgressMsg('Cropping…')
    setDiagLog([])
    const log: string[] = []
    try {
      const cropped = await cropImageFile(file, crop)
      log.push(`Cropped to ${Math.round(crop.w)}%×${Math.round(crop.h)}% · ${Math.round(cropped.size / 1024)}KB`)
      setDiagLog([...log])

      const { ocrGrid } = await import('../ocr/gridOcr')
      const { grid, gridSize } = await ocrGrid(
        cropped,
        (msg) => {
          setProgressMsg(msg)
          log.push(msg)
          setDiagLog([...log])
        },
        storeGridSize,
        { groqApiKey, geminiApiKey },
      )

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
      if (filled === total) setTimeout(onClose, 1800)
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'OCR failed — try a clearer photo')
      setDiagLog([...log])
      setStage('error')
    }
  }

  const reset = () => {
    if (imageUrl) URL.revokeObjectURL(imageUrl)
    setImageUrl(null)
    setFile(null)
    setProgressMsg('')
    setDiagLog([])
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
            <h2 className="font-semibold text-slate-100">
              {stage === 'api-keys' ? 'Vision API keys' : 'Scan Boggle Grid'}
            </h2>
            <p className="text-[11px] text-slate-500 mt-0.5">
              {stage === 'preview' && 'Drag the box to cover just the tiles'}
              {stage === 'api-keys' && 'Optional — for higher OCR accuracy'}
              {stage !== 'preview' && stage !== 'api-keys' && 'Grid size is detected automatically'}
            </p>
          </div>
          <div className="flex items-center gap-1">
            {stage === 'pick' && (
              <button
                onClick={() => setStage('api-keys')}
                className="text-slate-500 hover:text-slate-300 text-lg leading-none w-8 h-8 flex items-center justify-center"
                aria-label="Vision API settings"
              >
                ⚙
              </button>
            )}
            <button onClick={onClose} className="text-slate-400 hover:text-slate-200 text-2xl leading-none w-8 h-8 flex items-center justify-center">×</button>
          </div>
        </div>

        <div className="p-5 flex flex-col gap-4">

          {/* PICK */}
          {stage === 'pick' && (
            <>
              <p className="text-sm text-slate-400">
                Take a photo of the Boggle grid or upload one. You'll then drag a box around just the tiles before extraction.
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
              <input ref={cameraRef} type="file" accept="image/*" capture="environment" onChange={handleInputChange} className="hidden" />
              <input ref={fileRef} type="file" accept="image/*" onChange={handleInputChange} className="hidden" />

              {(groqApiKey || geminiApiKey) ? (
                <p className="text-[11px] text-emerald-500 text-center">
                  ✓ Vision API configured — high-accuracy OCR enabled
                </p>
              ) : (
                <button
                  onClick={() => setStage('api-keys')}
                  className="text-[11px] text-violet-400 hover:text-violet-300 text-center underline"
                >
                  Add a Vision API key for ~100% accuracy →
                </button>
              )}
            </>
          )}

          {/* API KEYS */}
          {stage === 'api-keys' && (
            <ApiKeysForm
              initialGroq={groqApiKey}
              initialGemini={geminiApiKey}
              onSave={(g, m) => { setGroqApiKey(g); setGeminiApiKey(m); setStage('pick') }}
              onCancel={() => setStage('pick')}
            />
          )}

          {/* PREVIEW with draggable crop */}
          {stage === 'preview' && imageUrl && (
            <>
              <div className="flex justify-center">
                <div
                  ref={containerRef}
                  className="relative inline-block bg-black rounded-xl overflow-hidden select-none"
                  onPointerMove={onContainerPointerMove}
                  onPointerUp={endDrag}
                  onPointerCancel={endDrag}
                  style={{ touchAction: 'none' }}
                >
                  <img
                    src={imageUrl}
                    alt="Grid preview"
                    className="block max-h-72 max-w-full pointer-events-none"
                    draggable={false}
                  />

                  {/* Dark mask outside crop */}
                  <div
                    className="absolute inset-0 pointer-events-none"
                    style={{
                      boxShadow: `inset 0 0 0 9999px rgba(0,0,0,0.55)`,
                      clipPath: `polygon(
                        0 0, 100% 0, 100% 100%, 0 100%, 0 0,
                        ${crop.x}% ${crop.y}%,
                        ${crop.x}% ${crop.y + crop.h}%,
                        ${crop.x + crop.w}% ${crop.y + crop.h}%,
                        ${crop.x + crop.w}% ${crop.y}%,
                        ${crop.x}% ${crop.y}%
                      )`,
                    }}
                  />

                  {/* Crop rectangle */}
                  <div
                    className="absolute border-2 border-emerald-400"
                    style={{
                      left: `${crop.x}%`,
                      top: `${crop.y}%`,
                      width: `${crop.w}%`,
                      height: `${crop.h}%`,
                      touchAction: 'none',
                      cursor: 'move',
                    }}
                    onPointerDown={(e) => startDrag(e, 'move')}
                  >
                    {/* Resize handle (bottom-right) */}
                    <div
                      className="absolute w-7 h-7 bg-emerald-400 rounded border-2 border-slate-900"
                      style={{
                        right: '-14px',
                        bottom: '-14px',
                        touchAction: 'none',
                        cursor: 'nwse-resize',
                      }}
                      onPointerDown={(e) => startDrag(e, 'resize')}
                    />
                  </div>
                </div>
              </div>
              <p className="text-[11px] text-slate-500 text-center -mt-1">
                Drag the box to move · drag the green corner to resize
              </p>
              <p className="text-[11px] text-slate-600 text-center -mt-2">
                Extracting as <span className="text-slate-400 font-semibold">{storeGridSize}×{storeGridSize}</span>
                {' '}— change in the main screen if wrong
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
              <div className="w-12 h-12 rounded-full border-4 border-slate-700 border-t-emerald-500 animate-spin" />
              <div className="text-center w-full">
                <p className="text-sm text-slate-200 font-medium">{progressMsg}</p>
                <p className="text-[11px] text-slate-600 mt-1">First run downloads ~3 MB engine · cached after that</p>
                {diagLog.length > 1 && (
                  <div className="mt-3 text-left bg-slate-800 rounded-lg p-2 max-h-32 overflow-y-auto">
                    {diagLog.map((l, i) => (
                      <p key={i} className="text-[10px] text-slate-500 font-mono leading-relaxed">{l}</p>
                    ))}
                  </div>
                )}
              </div>
              <button
                onClick={reset}
                className="px-5 py-2 rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700 font-medium text-sm transition-colors"
              >
                Cancel
              </button>
            </div>
          )}

          {/* DONE */}
          {stage === 'done' && (
            <div className="flex flex-col items-center gap-3 py-5">
              <div className="text-5xl">✅</div>
              <p className="text-slate-200 font-semibold text-center">{resultSummary}</p>
              <p className="text-xs text-slate-500 text-center">Check any empty cells and correct misreads, then hit Solve</p>

              {diagLog.length > 0 && (
                <div className="w-full bg-slate-800 rounded-xl p-3 max-h-40 overflow-y-auto">
                  <p className="text-[10px] text-slate-500 font-semibold mb-1 uppercase tracking-wide">Diagnostic log</p>
                  {diagLog.map((l, i) => (
                    <p key={i} className="text-[10px] text-slate-400 font-mono leading-relaxed break-all">{l}</p>
                  ))}
                </div>
              )}

              <button
                onClick={onClose}
                className="mt-1 px-6 py-2.5 rounded-xl bg-emerald-600 text-white font-semibold text-sm hover:bg-emerald-500"
              >
                Done
              </button>
            </div>
          )}

          {/* ERROR */}
          {stage === 'error' && (
            <div className="flex flex-col gap-4">
              <div className="bg-red-950/40 border border-red-800 rounded-xl p-4">
                <p className="text-red-300 text-sm">{errorMsg}</p>
              </div>

              {diagLog.length > 0 && (
                <div className="bg-slate-800 rounded-xl p-3 max-h-40 overflow-y-auto">
                  <p className="text-[10px] text-slate-500 font-semibold mb-1 uppercase tracking-wide">Diagnostic log</p>
                  {diagLog.map((l, i) => (
                    <p key={i} className="text-[10px] text-slate-400 font-mono leading-relaxed">{l}</p>
                  ))}
                </div>
              )}

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
