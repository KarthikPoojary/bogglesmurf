import { Capacitor } from '@capacitor/core'

export type OcrProgressMsg = string

interface LetterPoint {
  char: string
  cx: number
  cy: number
  height: number
}

// ─── shared helpers ───────────────────────────────────────────────────────────

// Cluster a list of coordinate values into groups.
// Handles two distinct input shapes:
//   (a) Regular grid (ML Kit case): a few well-separated values with all gaps
//       roughly equal. Each unique value IS a cluster.
//   (b) Noisy data (Tesseract case): many values with bimodal gap distribution
//       (small gaps within a row, large gaps between rows). Use gap threshold
//       to separate clusters.
function clusterCenters(rawValues: number[]): number[] {
  if (rawValues.length === 0) return []
  const sorted = [...new Set(rawValues.map((v) => Math.round(v / 2) * 2))].sort((a, b) => a - b)
  if (sorted.length <= 1) return sorted

  const gaps = sorted.slice(1).map((v, i) => v - sorted[i])

  // Regular grid detection: all gaps within ±30% of the mean → each unique
  // value is its own cluster.
  const meanGap = gaps.reduce((a, b) => a + b, 0) / gaps.length
  const allSimilar = sorted.length <= 8 && gaps.every((g) => Math.abs(g - meanGap) <= meanGap * 0.3)
  if (allSimilar) return sorted

  // Bimodal fallback: gaps > 2× median are cluster separators.
  const sortedGaps = [...gaps].sort((a, b) => a - b)
  const medGap = sortedGaps[Math.floor(sortedGaps.length / 2)]
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

function buildGrid(letters: LetterPoint[]): { grid: string[][]; gridSize: 4 | 5 | 6 } {
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

  const grid: string[][] = Array.from({ length: gridSize }, () => Array(gridSize).fill(''))
  const filled: boolean[][] = Array.from({ length: gridSize }, () => Array(gridSize).fill(false))

  // First pass: tallest letter wins each cell
  letters.sort((a, b) => b.height - a.height)
  for (const l of letters) {
    const r = nearestIndex(rowCenters, l.cy)
    const c = nearestIndex(colCenters, l.cx)
    if (r < gridSize && c < gridSize && !filled[r][c]) {
      grid[r][c] = l.char
      filled[r][c] = true
    }
  }

  return { grid, gridSize }
}

// ─── ML Kit (native Android / iOS) ────────────────────────────────────────────

// Render an image through a canvas so EXIF rotation is applied and the image
// is sized down. Phone cameras save photos in landscape with a "rotate 90°"
// EXIF tag — without this step, ML Kit receives a sideways image and can only
// read a fraction of the letters.
//
// Cap at 1200px — ML Kit text recognition is trained for ~720p input; bigger
// images just slow down the JS-to-native bridge serialization without
// improving accuracy. Quality 0.85 is plenty for text.
function imageToBase64Canvas(img: HTMLImageElement, maxSize = 1000): { base64: string; w: number; h: number } {
  const scale = Math.min(1, maxSize / Math.max(img.width, img.height))
  const w = Math.round(img.width * scale)
  const h = Math.round(img.height * scale)
  const canvas = document.createElement('canvas')
  canvas.width = w; canvas.height = h
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, w, h)
  ctx.drawImage(img, 0, 0, w, h)
  return { base64: canvas.toDataURL('image/jpeg', 0.85).split(',')[1], w, h }
}

async function ocrWithMlKit(
  file: File, onProgress?: (msg: OcrProgressMsg) => void
): Promise<{ grid: string[][]; gridSize: 4 | 5 | 6 }> {
  onProgress?.('Reading image…')
  const img = await loadImageFromFile(file)
  onProgress?.(`Image: ${img.width}×${img.height}px`)

  const { base64, w, h } = imageToBase64Canvas(img)
  onProgress?.(`Resized: ${w}×${h}px (${Math.round(base64.length / 1024)}KB)`)

  onProgress?.('ML Kit scanning…')
  const { CapacitorPluginMlKitTextRecognition } = await import(
    '@pantrist/capacitor-plugin-ml-kit-text-recognition'
  )
  // Race the native call against a 15s timeout so a hung plugin can't freeze
  // the UI forever.
  const TIMEOUT_MS = 15_000
  const result = await Promise.race([
    CapacitorPluginMlKitTextRecognition.detectText({ base64Image: base64 }),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`ML Kit timed out after ${TIMEOUT_MS / 1000}s`)), TIMEOUT_MS),
    ),
  ])

  // ML Kit returns elements in reading order (top-to-bottom, left-to-right).
  // Walk that order, drop elements that are mostly non-letters (UI noise like
  // "0:39" timer), then keep only elements whose height matches the tallest
  // text in the image — Netflix Boggle tile letters are visibly larger than
  // any UI text (player banners, "Scan to join!", timer), so this filter
  // isolates the grid even in wide photos.
  const allTexts: string[] = []
  const candidates: { letters: string; height: number }[] = []
  for (const block of result.blocks) {
    for (const line of block.lines) {
      for (const el of line.elements) {
        allTexts.push(el.text)
        const letters = el.text.replace(/[^A-Za-z]/g, '').toUpperCase()
        const ratio = letters.length / Math.max(1, el.text.length)
        if (ratio < 0.6 || letters.length === 0) continue
        const h = el.boundingBox.bottom - el.boundingBox.top
        candidates.push({ letters, height: h })
      }
    }
  }

  onProgress?.(`Texts: ${allTexts.map((t) => `"${t}"`).join(' ') || '(none)'}`)

  // Filter to elements whose height is within 30% of the tallest — these are
  // the grid tiles. Smaller UI text is dropped.
  let allLetters = ''
  if (candidates.length > 0) {
    const maxH = Math.max(...candidates.map((c) => c.height))
    const minH = maxH * 0.7
    const kept = candidates.filter((c) => c.height >= minH)
    allLetters = kept.map((c) => c.letters).join('')
    onProgress?.(`Tile height: ~${Math.round(maxH)}px (filter ≥${Math.round(minH)}px)`)
    onProgress?.(`Kept ${kept.length}/${candidates.length} elements`)
  }
  onProgress?.(`Letters: "${allLetters}" (${allLetters.length})`)

  // Snap to grid size. Allow some slack (one missed/extra char per row).
  const n = allLetters.length
  let gridSize: 4 | 5 | 6
  if (n >= 14 && n <= 18) gridSize = 4
  else if (n >= 22 && n <= 28) gridSize = 5
  else if (n >= 32 && n <= 39) gridSize = 6
  else throw new Error(
    `Found ${n} letters — need 16, 25, or 36 for a 4×4, 5×5, or 6×6 grid.`
  )

  // Truncate or pad to exact size
  const expected = gridSize * gridSize
  if (allLetters.length > expected) allLetters = allLetters.slice(0, expected)
  while (allLetters.length < expected) allLetters += ''

  const grid: string[][] = []
  for (let r = 0; r < gridSize; r++) {
    const row = allLetters.slice(r * gridSize, (r + 1) * gridSize).padEnd(gridSize, '\0')
    grid.push(row.split('').map((c) => (c === '\0' ? '' : c)))
  }

  onProgress?.(`Grid: ${grid.map((r) => r.map((c) => c || '·').join('')).join(' / ')}`)
  return { grid, gridSize }
}

// ─── Tesseract.js (web PWA fallback) ──────────────────────────────────────────

function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    const cleanup = () => URL.revokeObjectURL(url)
    const timer = setTimeout(() => { cleanup(); reject(new Error('Image load timed out (10s)')) }, 10_000)
    img.onload = () => { clearTimeout(timer); cleanup(); resolve(img) }
    img.onerror = () => { clearTimeout(timer); cleanup(); reject(new Error('Image failed to load')) }
    img.src = url
  })
}

function drawToCanvas(img: HTMLImageElement, maxSize = 2000): HTMLCanvasElement {
  const scale = Math.min(1, maxSize / Math.max(img.width, img.height))
  const w = Math.round(img.width * scale)
  const h = Math.round(img.height * scale)
  const canvas = document.createElement('canvas')
  canvas.width = w; canvas.height = h
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, w, h)
  ctx.drawImage(img, 0, 0, w, h)
  return canvas
}

async function ocrWithTesseract(
  file: File, onProgress?: (msg: OcrProgressMsg) => void
): Promise<{ grid: string[][]; gridSize: 4 | 5 | 6 }> {
  const { createWorker, PSM } = await import('tesseract.js')

  onProgress?.('Loading OCR engine…')
  const img = await loadImageFromFile(file)
  const canvas = drawToCanvas(img)

  const worker = await createWorker('eng')
  await worker.setParameters({
    tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
    tessedit_pageseg_mode: PSM.SPARSE_TEXT,
  })

  onProgress?.('Scanning for letters…')
  const { data } = await worker.recognize(canvas)
  await worker.terminate()

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
                height: sym.bbox.y1 - sym.bbox.y0,
              })
            }
          }
        }
      }
    }
  }

  if (letters.length > 0) {
    const heights = letters.map((l) => l.height).sort((a, b) => a - b)
    const medH = heights[Math.floor(heights.length / 2)]
    const minH = medH * 0.55
    return buildGrid(letters.filter((l) => l.height >= minH))
  }

  return buildGrid(letters)
}

// ─── main export ──────────────────────────────────────────────────────────────

export async function ocrGrid(
  file: File,
  onProgress?: (msg: OcrProgressMsg) => void
): Promise<{ grid: string[][]; gridSize: 4 | 5 | 6 }> {
  if (Capacitor.isNativePlatform()) {
    return ocrWithMlKit(file, onProgress)
  }
  return ocrWithTesseract(file, onProgress)
}
