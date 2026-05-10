export type OcrProgressMsg = string

interface LetterPoint {
  char: string
  cx: number
  cy: number
  confidence: number
  height: number
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

function drawToCanvas(img: HTMLImageElement, maxSize = 2000): HTMLCanvasElement {
  const scale = Math.min(1, maxSize / Math.max(img.width, img.height))
  const w = Math.round(img.width * scale)
  const h = Math.round(img.height * scale)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, w, h)
  ctx.drawImage(img, 0, 0, w, h)
  return canvas
}

// Detect the bounding box of dark-purple Boggle tiles using a 1-D projection:
// count purple-ish pixels per row and per column, find the span where they're dense.
// Returns pixel bounds, or null if not enough purple pixels found.
function detectTileRegion(
  d: Uint8ClampedArray, imgW: number, imgH: number
): { x: number; y: number; w: number; h: number } | null {
  const rowHits = new Uint32Array(imgH)
  const colHits = new Uint32Array(imgW)

  for (let y = 0; y < imgH; y++) {
    for (let x = 0; x < imgW; x++) {
      const i = (y * imgW + x) * 4
      const r = d[i], g = d[i + 1], b = d[i + 2]
      const sum = r + g + b
      // Dark purple: not near-black (sum>90), not bright (sum<420), blue dominates
      if (sum > 90 && sum < 420 && b > r * 1.05 && b > g * 1.15) {
        rowHits[y]++
        colHits[x]++
      }
    }
  }

  // A row/col counts as "tile-containing" when enough purple pixels are present
  const rowThresh = imgW * 0.025
  const colThresh = imgH * 0.025

  let y0 = -1, y1 = -1, x0 = -1, x1 = -1
  for (let y = 0; y < imgH; y++) {
    if (rowHits[y] > rowThresh) { if (y0 < 0) y0 = y; y1 = y }
  }
  for (let x = 0; x < imgW; x++) {
    if (colHits[x] > colThresh) { if (x0 < 0) x0 = x; x1 = x }
  }

  if (x0 < 0 || y0 < 0) return null
  const gw = x1 - x0, gh = y1 - y0
  if (gw < imgW * 0.05 || gh < imgH * 0.05) return null

  // Pad by 8% so we don't clip tile edges
  const px = Math.round(gw * 0.08), py = Math.round(gh * 0.08)
  const rx = Math.max(0, x0 - px)
  const ry = Math.max(0, y0 - py)
  return {
    x: rx, y: ry,
    w: Math.min(imgW - rx, gw + 2 * px),
    h: Math.min(imgH - ry, gh + 2 * py),
  }
}

function cropCanvas(
  src: HTMLCanvasElement, x: number, y: number, cw: number, ch: number
): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = cw; c.height = ch
  c.getContext('2d')!.drawImage(src, x, y, cw, ch, 0, 0, cw, ch)
  return c
}

// Percentile contrast stretch then invert.
// Inversion is required: Boggle tiles have WHITE letters on DARK tiles;
// Tesseract expects dark text on a light background.
function preprocessForOcr(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const id = ctx.getImageData(0, 0, w, h)
  const d = id.data
  const n = d.length >> 2

  // Pass 1: grayscale
  const lum = new Uint8Array(n)
  for (let i = 0; i < n; i++) {
    lum[i] = (0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2] + 0.5) | 0
  }

  // Pass 2: 5th/95th percentile stretch
  const sorted = lum.slice().sort((a, b) => a - b)
  const lo = sorted[(n * 0.05) | 0]
  const hi = sorted[(n * 0.95) | 0]
  const range = hi - lo || 1

  // Pass 3: stretch then invert
  for (let i = 0; i < n; i++) {
    const s = Math.max(0, Math.min(255, (((lum[i] - lo) / range) * 255 + 0.5) | 0))
    d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = 255 - s
  }
  ctx.putImageData(id, 0, 0)
}

// ─── 1-D clustering (gap-based) ───────────────────────────────────────────────

function clusterCenters(rawValues: number[]): number[] {
  if (rawValues.length === 0) return []
  const sorted = [...new Set(rawValues.map((v) => Math.round(v / 2) * 2))].sort((a, b) => a - b)
  const gaps = sorted.slice(1).map((v, i) => v - sorted[i])
  if (gaps.length === 0) return [sorted[0]]
  const medGap = [...gaps].sort((a, b) => a - b)[Math.floor(gaps.length / 2)]
  const threshold = Math.max(medGap * 2, 5)
  const clusters: number[][] = [[sorted[0]]]
  for (let i = 0; i < gaps.length; i++) {
    if (gaps[i] > threshold) clusters.push([sorted[i + 1]])
    else clusters[clusters.length - 1].push(sorted[i + 1])
  }
  return clusters.map((c) => c.reduce((a, b) => a + b, 0) / c.length)
}

function nearestIndex(centers: number[], value: number): number {
  return centers.reduce(
    (best, c, i) => (Math.abs(c - value) < Math.abs(centers[best] - value) ? i : best), 0
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
  const { createWorker, PSM } = await import('tesseract.js')

  onProgress?.('Loading OCR engine…')
  const img = await loadImageFromFile(file)
  onProgress?.(`Image: ${img.width}×${img.height}px`)

  const fullCanvas = drawToCanvas(img)
  onProgress?.(`Canvas: ${fullCanvas.width}×${fullCanvas.height}px`)
  const fullCtx = fullCanvas.getContext('2d')!

  // Count purple pixels to see if tile detection will work
  const pixelData = fullCtx.getImageData(0, 0, fullCanvas.width, fullCanvas.height).data
  let purpleCount = 0
  for (let i = 0; i < pixelData.length; i += 4) {
    const r = pixelData[i], g = pixelData[i + 1], b = pixelData[i + 2]
    const sum = r + g + b
    if (sum > 90 && sum < 420 && b > r * 1.05 && b > g * 1.15) purpleCount++
  }
  onProgress?.(`Purple pixels: ${purpleCount} / ${fullCanvas.width * fullCanvas.height}`)

  const region = detectTileRegion(pixelData, fullCanvas.width, fullCanvas.height)
  if (region) {
    onProgress?.(`Grid crop: (${region.x},${region.y}) ${region.w}×${region.h}px`)
  } else {
    onProgress?.('No purple region — using full image')
  }

  const ocrCanvas = region
    ? cropCanvas(fullCanvas, region.x, region.y, region.w, region.h)
    : fullCanvas

  const ocrCtx = ocrCanvas.getContext('2d')!

  // Pixel stats before preprocessing
  const pre = ocrCtx.getImageData(0, 0, ocrCanvas.width, ocrCanvas.height).data
  let preDark = 0
  for (let i = 0; i < pre.length; i += 4) {
    if (0.299 * pre[i] + 0.587 * pre[i + 1] + 0.114 * pre[i + 2] < 128) preDark++
  }
  const preTotal = ocrCanvas.width * ocrCanvas.height
  onProgress?.(`Pre-process: ${Math.round(preDark / preTotal * 100)}% dark pixels`)

  preprocessForOcr(ocrCtx, ocrCanvas.width, ocrCanvas.height)

  // Pixel stats after preprocessing
  const post = ocrCtx.getImageData(0, 0, ocrCanvas.width, ocrCanvas.height).data
  let postDark = 0
  for (let i = 0; i < post.length; i += 4) {
    if (0.299 * post[i] + 0.587 * post[i + 1] + 0.114 * post[i + 2] < 128) postDark++
  }
  onProgress?.(`Post-process: ${Math.round(postDark / preTotal * 100)}% dark pixels`)

  const worker = await createWorker('eng')
  await worker.setParameters({
    tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
    tessedit_pageseg_mode: PSM.SPARSE_TEXT,
  })

  onProgress?.('Scanning for letters…')
  const { data } = await worker.recognize(ocrCanvas)
  await worker.terminate()

  // Count all raw symbols before any filtering
  let rawSymbols = 0, rawLetters = 0
  let minConf = 100, maxConf = 0
  for (const block of data.blocks ?? []) {
    for (const para of block.paragraphs) {
      for (const line of para.lines) {
        for (const word of line.words) {
          for (const sym of word.symbols) {
            rawSymbols++
            const ch = sym.text.trim().toUpperCase()
            if (/^[A-Z]$/.test(ch)) {
              rawLetters++
              if (sym.confidence < minConf) minConf = sym.confidence
              if (sym.confidence > maxConf) maxConf = sym.confidence
            }
          }
        }
      }
    }
  }
  onProgress?.(`Tesseract: ${rawSymbols} symbols, ${rawLetters} letters, conf ${rawLetters > 0 ? `${Math.round(minConf)}–${Math.round(maxConf)}` : 'n/a'}`)

  onProgress?.('Detecting grid layout…')

  const letters: LetterPoint[] = []
  for (const block of data.blocks ?? []) {
    for (const para of block.paragraphs) {
      for (const line of para.lines) {
        for (const word of line.words) {
          for (const sym of word.symbols) {
            const ch = sym.text.trim().toUpperCase()
            if (/^[A-Z]$/.test(ch) && sym.confidence > 5) {
              letters.push({
                char: ch,
                cx: (sym.bbox.x0 + sym.bbox.x1) / 2,
                cy: (sym.bbox.y0 + sym.bbox.y1) / 2,
                confidence: sym.confidence,
                height: sym.bbox.y1 - sym.bbox.y0,
              })
            }
          }
        }
      }
    }
  }
  onProgress?.(`After conf>5 filter: ${letters.length} letters`)

  // Filter to large letters only — removes small residual UI text
  if (letters.length > 0) {
    const heights = letters.map((l) => l.height).sort((a, b) => a - b)
    const medH = heights[Math.floor(heights.length / 2)]
    const minH = medH * 0.55
    letters.splice(0, letters.length, ...letters.filter((l) => l.height >= minH))
    onProgress?.(`After size filter (≥${Math.round(minH)}px): ${letters.length} letters`)
  }

  if (letters.length < 9) {
    throw new Error(
      `Only found ${letters.length} letter${letters.length === 1 ? '' : 's'}. ` +
      'Try a flatter photo with the whole grid filling the frame.'
    )
  }

  const rowCenters = clusterCenters(letters.map((l) => l.cy))
  const colCenters = clusterCenters(letters.map((l) => l.cx))

  const detectedSize = Math.round((rowCenters.length + colCenters.length) / 2)
  const gridSize = snap(detectedSize)

  onProgress?.(`Detected ${gridSize}×${gridSize} grid — mapping ${letters.length} letters…`)

  const grid: string[][] = Array.from({ length: gridSize }, () => Array(gridSize).fill(''))
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
