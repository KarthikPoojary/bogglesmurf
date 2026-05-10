import { Capacitor } from '@capacitor/core'

export type OcrProgressMsg = string

interface LetterPoint {
  char: string
  cx: number
  cy: number
  height: number
}

// ─── shared helpers ───────────────────────────────────────────────────────────

// Cluster a list of coordinate values into groups by finding large gaps.
// Returns the center of each cluster, sorted ascending.
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
function imageToBase64Canvas(img: HTMLImageElement, maxSize = 2000): string {
  const scale = Math.min(1, maxSize / Math.max(img.width, img.height))
  const w = Math.round(img.width * scale)
  const h = Math.round(img.height * scale)
  const canvas = document.createElement('canvas')
  canvas.width = w; canvas.height = h
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, w, h)
  ctx.drawImage(img, 0, 0, w, h)
  return canvas.toDataURL('image/jpeg', 0.92).split(',')[1]
}

async function ocrWithMlKit(
  file: File, onProgress?: (msg: OcrProgressMsg) => void
): Promise<{ grid: string[][]; gridSize: 4 | 5 | 6 }> {
  onProgress?.('Reading image…')
  const img = await loadImageFromFile(file)
  onProgress?.(`Image: ${img.width}×${img.height}px`)

  const base64 = imageToBase64Canvas(img)

  onProgress?.('ML Kit scanning…')
  const { CapacitorPluginMlKitTextRecognition } = await import(
    '@pantrist/capacitor-plugin-ml-kit-text-recognition'
  )
  const result = await CapacitorPluginMlKitTextRecognition.detectText({ base64Image: base64 })

  // Walk blocks → lines → elements
  const letters: LetterPoint[] = []
  const allTexts: string[] = []
  let elementCount = 0
  for (const block of result.blocks) {
    for (const line of block.lines) {
      for (const el of line.elements) {
        elementCount++
        allTexts.push(el.text)
        const text = el.text.replace(/[^A-Za-z]/g, '').toUpperCase()
        if (!text) continue
        const w = el.boundingBox.right - el.boundingBox.left
        const h = el.boundingBox.bottom - el.boundingBox.top

        if (text.length === 1) {
          letters.push({
            char: text,
            cx: (el.boundingBox.left + el.boundingBox.right) / 2,
            cy: (el.boundingBox.top + el.boundingBox.bottom) / 2,
            height: h,
          })
        } else {
          // Multi-character element — split positions evenly across the bbox
          const cellW = w / text.length
          for (let i = 0; i < text.length; i++) {
            letters.push({
              char: text[i],
              cx: el.boundingBox.left + cellW * (i + 0.5),
              cy: (el.boundingBox.top + el.boundingBox.bottom) / 2,
              height: h,
            })
          }
        }
      }
    }
  }

  onProgress?.(`ML Kit: ${result.blocks.length} blocks, ${elementCount} elements`)
  // Emit all element texts so we can see exactly what ML Kit found
  onProgress?.(`Texts: ${allTexts.map((t) => `"${t}"`).join(' ') || '(none)'}`)
  onProgress?.(`Letters extracted: ${letters.length}`)

  return buildGrid(letters)
}

// ─── Tesseract.js (web PWA fallback) ──────────────────────────────────────────

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
