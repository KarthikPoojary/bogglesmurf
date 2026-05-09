export type OcrProgressMsg = string

interface LetterPoint {
  char: string
  cx: number
  cy: number
  confidence: number
}

// ─── image helpers ────────────────────────────────────────────────────────────

function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => { URL.revokeObjectURL(url); resolve(img) }
    img.onerror = reject
    img.src = url
  })
}

function imageToCanvas(img: HTMLImageElement, maxSize = 2000): HTMLCanvasElement {
  const scale = Math.min(1, maxSize / Math.max(img.width, img.height))
  const w = Math.round(img.width * scale)
  const h = Math.round(img.height * scale)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  // White background
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, w, h)
  ctx.drawImage(img, 0, 0, w, h)
  preprocessForOcr(ctx, w, h)
  return canvas
}

// Converts to grayscale, applies percentile-based contrast stretch, then inverts.
// Inversion is critical: Boggle tiles have WHITE letters on DARK tiles — Tesseract
// expects dark text on light background, so we flip it.
// Percentile stretch (5th–95th) avoids the dark TV bezel and bright hotspots
// dominating the range and making the normalization a near-no-op.
function preprocessForOcr(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const id = ctx.getImageData(0, 0, w, h)
  const d = id.data
  const n = d.length >> 2

  // Pass 1: grayscale luminance
  const lum = new Uint8Array(n)
  for (let i = 0; i < n; i++) {
    lum[i] = (0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2] + 0.5) | 0
  }

  // Pass 2: 5th / 95th percentile contrast stretch
  const sorted = lum.slice().sort((a, b) => a - b)
  const lo = sorted[(n * 0.05) | 0]
  const hi = sorted[(n * 0.95) | 0]
  const range = hi - lo || 1

  // Pass 3: stretch then invert
  for (let i = 0; i < n; i++) {
    const stretched = Math.max(0, Math.min(255, (((lum[i] - lo) / range) * 255 + 0.5) | 0))
    d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = 255 - stretched
  }

  ctx.putImageData(id, 0, 0)
}

// ─── 1-D clustering (gap-based) ───────────────────────────────────────────────
// Groups a list of coordinate values into clusters by finding large gaps.
// Returns the center of each cluster, sorted ascending.

function clusterCenters(rawValues: number[]): number[] {
  if (rawValues.length === 0) return []

  // Deduplicate by rounding to nearest 2px so near-identical values merge
  const sorted = [...new Set(rawValues.map((v) => Math.round(v / 2) * 2))].sort((a, b) => a - b)

  const gaps = sorted.slice(1).map((v, i) => v - sorted[i])
  if (gaps.length === 0) return [sorted[0]]

  // Use median gap as baseline — gaps > 2× median are row/column dividers
  const medGap = [...gaps].sort((a, b) => a - b)[Math.floor(gaps.length / 2)]
  const threshold = Math.max(medGap * 2, 5) // at least 5px

  const clusters: number[][] = [[sorted[0]]]
  for (let i = 0; i < gaps.length; i++) {
    if (gaps[i] > threshold) {
      clusters.push([sorted[i + 1]])
    } else {
      clusters[clusters.length - 1].push(sorted[i + 1])
    }
  }

  return clusters.map((c) => c.reduce((a, b) => a + b, 0) / c.length)
}

function nearestIndex(centers: number[], value: number): number {
  return centers.reduce(
    (best, c, i) => (Math.abs(c - value) < Math.abs(centers[best] - value) ? i : best),
    0
  )
}

function snap(n: number): 4 | 5 | 6 {
  if (n <= 4) return 4
  if (n <= 5) return 5
  return 6
}

// ─── main export ──────────────────────────────────────────────────────────────

export async function ocrGrid(
  file: File,
  onProgress?: (msg: OcrProgressMsg) => void
): Promise<{ grid: string[][]; gridSize: 4 | 5 | 6 }> {
  // Lazy-load Tesseract — only fetched when camera mode is opened
  const { createWorker, PSM } = await import('tesseract.js')

  onProgress?.('Loading OCR engine…')
  const img = await loadImageFromFile(file)
  const canvas = imageToCanvas(img)

  const worker = await createWorker('eng')
  await worker.setParameters({
    tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
    // SPARSE_TEXT: find characters scattered anywhere in the image — perfect for a grid
    tessedit_pageseg_mode: PSM.SPARSE_TEXT,
  })

  onProgress?.('Scanning for letters…')
  const { data } = await worker.recognize(canvas)
  await worker.terminate()

  onProgress?.('Detecting grid layout…')

  // Collect every individual symbol — traverse blocks→paragraphs→lines→words→symbols
  const letters: LetterPoint[] = []
  for (const block of data.blocks ?? []) {
    for (const para of block.paragraphs) {
      for (const line of para.lines) {
        for (const word of line.words) {
          for (const sym of word.symbols) {
            const ch = sym.text.trim().toUpperCase()
            if (/^[A-Z]$/.test(ch) && sym.confidence > 15) {
              letters.push({
                char: ch,
                cx: (sym.bbox.x0 + sym.bbox.x1) / 2,
                cy: (sym.bbox.y0 + sym.bbox.y1) / 2,
                confidence: sym.confidence,
              })
            }
          }
        }
      }
    }
  }

  if (letters.length < 9) {
    throw new Error(
      `Only found ${letters.length} letter${letters.length === 1 ? '' : 's'}. ` +
      'Try a flatter photo with even lighting and the whole grid in frame.'
    )
  }

  // Cluster Y-values into rows, X-values into columns
  const rowCenters = clusterCenters(letters.map((l) => l.cy))
  const colCenters = clusterCenters(letters.map((l) => l.cx))

  const detectedSize = Math.round((rowCenters.length + colCenters.length) / 2)
  const gridSize = snap(detectedSize)

  onProgress?.(`Detected ${gridSize}×${gridSize} grid — mapping ${letters.length} letters…`)

  // Map each letter to its closest row/col cluster
  const grid: string[][] = Array.from({ length: gridSize }, () => Array(gridSize).fill(''))

  // Where multiple letters map to the same cell, keep highest-confidence one
  const confidence: number[][] = Array.from({ length: gridSize }, () => Array(gridSize).fill(-1))

  for (const l of letters) {
    const r = nearestIndex(rowCenters, l.cy)
    const c = nearestIndex(colCenters, l.cx)
    if (r < gridSize && c < gridSize && l.confidence > confidence[r][c]) {
      grid[r][c] = l.char
      confidence[r][c] = l.confidence
    }
  }

  return { grid, gridSize }
}
