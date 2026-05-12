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

  // ML Kit groups spatially-close text into "blocks". For a Boggle photo:
  // the grid forms one block; player banners, timer, and QR text form others.
  // Strategy: extract letters from each block separately, then pick the block
  // whose letter count is closest to a perfect square (16/25/36). This works
  // regardless of how zoomed-out the photo is.
  const allTexts: string[] = []
  const blockLetters: string[] = []
  for (const block of result.blocks) {
    let bl = ''
    for (const line of block.lines) {
      for (const el of line.elements) {
        allTexts.push(el.text)
        const letters = el.text.replace(/[^A-Za-z]/g, '').toUpperCase()
        const ratio = letters.length / Math.max(1, el.text.length)
        if (ratio < 0.6 || letters.length === 0) continue
        bl += letters
      }
    }
    if (bl) blockLetters.push(bl)
  }

  onProgress?.(`Texts: ${allTexts.map((t) => `"${t}"`).join(' ') || '(none)'}`)
  onProgress?.(`Blocks: ${blockLetters.map((b) => `"${b}"(${b.length})`).join(' ')}`)

  // Score each block by distance to nearest perfect-square grid size
  function scoreBlock(b: string): { gridSize: 4 | 5 | 6; distance: number } | null {
    const n = b.length
    const targets: [number, 4 | 5 | 6][] = [[16, 4], [25, 5], [36, 6]]
    let best: { gridSize: 4 | 5 | 6; distance: number } | null = null
    for (const [target, gs] of targets) {
      const dist = Math.abs(n - target)
      // Allow ±2 chars slack from a perfect square
      if (dist <= 2 && (!best || dist < best.distance)) {
        best = { gridSize: gs, distance: dist }
      }
    }
    return best
  }

  let allLetters: string
  let gridSize: 4 | 5 | 6
  let bestBlock: string | null = null
  let bestScore: { gridSize: 4 | 5 | 6; distance: number } | null = null
  for (const b of blockLetters) {
    const s = scoreBlock(b)
    if (s && (!bestScore || s.distance < bestScore.distance)) {
      bestScore = s
      bestBlock = b
    }
  }

  if (bestBlock && bestScore) {
    allLetters = bestBlock
    gridSize = bestScore.gridSize
    onProgress?.(`Selected block: "${bestBlock}" → ${gridSize}×${gridSize}`)
  } else {
    // Fallback: concatenate everything and try to snap
    allLetters = blockLetters.join('')
    onProgress?.(`No clean block — concat all: "${allLetters}"`)
    const n = allLetters.length
    if (n >= 14 && n <= 18) gridSize = 4
    else if (n >= 22 && n <= 28) gridSize = 5
    else if (n >= 32 && n <= 39) gridSize = 6
    else throw new Error(
      `Found ${n} letters across ${blockLetters.length} blocks — need 16/25/36 for a grid.`,
    )
  }

  // Truncate or pad to exact grid size
  const expected = gridSize * gridSize
  if (allLetters.length > expected) allLetters = allLetters.slice(0, expected)

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

// ─── per-cell ML Kit (most accurate when grid size is known) ──────────────────

// Common ML Kit misreads of stylised Boggle font characters.
// e.g. an "I" tile often reads back as "1", "[", "|", or "]".
const CHAR_SUBS: Record<string, string> = {
  '0': 'O', '1': 'I', '5': 'S', '8': 'B', '3': 'E', '4': 'A',
  '[': 'I', ']': 'I', '|': 'I', '!': 'I', '/': 'I', '\\': 'I', '@': 'A',
}

function normalizeLetter(s: string): string {
  return s.split('').map((c) => CHAR_SUBS[c] ?? c).join('').toUpperCase().replace(/[^A-Z]/g, '')
}

function renderCellCanvas(
  fullCanvas: HTMLCanvasElement, sx: number, sy: number, sw: number, sh: number,
  invert: boolean,
): HTMLCanvasElement {
  // 6% inset strips tile edges/shadows; 3× scale gives ML Kit sharp input.
  const inset = 0.06
  const insetX = sw * inset, insetY = sh * inset
  const ix = sx + insetX, iy = sy + insetY
  const iw = sw - 2 * insetX, ih = sh - 2 * insetY
  const scaleUp = 3
  const cellCanvas = document.createElement('canvas')
  cellCanvas.width = Math.max(1, Math.round(iw * scaleUp))
  cellCanvas.height = Math.max(1, Math.round(ih * scaleUp))
  const ctx = cellCanvas.getContext('2d')!
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, cellCanvas.width, cellCanvas.height)
  ctx.drawImage(fullCanvas, ix, iy, iw, ih, 0, 0, cellCanvas.width, cellCanvas.height)

  if (invert) {
    // Invert colors so white-on-dark tile letters become dark-on-light text,
    // which is what ML Kit's text-detection phase is trained on.
    const id = ctx.getImageData(0, 0, cellCanvas.width, cellCanvas.height)
    const d = id.data
    for (let i = 0; i < d.length; i += 4) {
      d[i] = 255 - d[i]
      d[i + 1] = 255 - d[i + 1]
      d[i + 2] = 255 - d[i + 2]
    }
    ctx.putImageData(id, 0, 0)
  }
  return cellCanvas
}

async function ocrCanvasOnce(canvas: HTMLCanvasElement): Promise<string> {
  const base64 = canvas.toDataURL('image/jpeg', 0.9).split(',')[1]
  const { CapacitorPluginMlKitTextRecognition } = await import(
    '@pantrist/capacitor-plugin-ml-kit-text-recognition'
  )
  try {
    const result = await CapacitorPluginMlKitTextRecognition.detectText({ base64Image: base64 })
    let best: { ch: string; area: number } | null = null
    for (const block of result.blocks) {
      for (const line of block.lines) {
        for (const el of line.elements) {
          const letters = normalizeLetter(el.text)
          if (!letters.length) continue
          const w = el.boundingBox.right - el.boundingBox.left
          const h = el.boundingBox.bottom - el.boundingBox.top
          const area = Math.abs(w * h)
          if (!best || area > best.area) best = { ch: letters[0], area }
        }
      }
    }
    return best?.ch ?? ''
  } catch {
    return ''
  }
}

async function ocrSingleCell(
  fullCanvas: HTMLCanvasElement, sx: number, sy: number, sw: number, sh: number,
): Promise<string> {
  // First try: inverted (dark-on-light) — ML Kit's preferred orientation
  const inverted = renderCellCanvas(fullCanvas, sx, sy, sw, sh, true)
  const fromInverted = await ocrCanvasOnce(inverted)
  if (fromInverted) return fromInverted
  // Fallback: original colors. Some letters (I, O) sometimes only detect this way.
  const original = renderCellCanvas(fullCanvas, sx, sy, sw, sh, false)
  return await ocrCanvasOnce(original)
}

// Per-row OCR fallback: when individual cells return empty (common for I and O
// in isolation), OCR the whole row as a single text strip. Returns an array of
// {col, ch} placements — each detected letter mapped to its grid column based
// on x-position. The caller fills any empty cell whose column matches.
async function ocrRow(
  fullCanvas: HTMLCanvasElement, sx: number, sy: number, sw: number, sh: number, gridSize: number,
): Promise<{ col: number; ch: string }[]> {
  const insetFrac = 0.03
  const ix = sx + sw * insetFrac, iy = sy + sh * insetFrac
  const iw = sw - 2 * sw * insetFrac, ih = sh - 2 * sh * insetFrac
  const rowCanvas = document.createElement('canvas')
  rowCanvas.width = Math.max(1, Math.round(iw * 1.5))
  rowCanvas.height = Math.max(1, Math.round(ih * 1.5))
  const ctx = rowCanvas.getContext('2d')!
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, rowCanvas.width, rowCanvas.height)
  ctx.drawImage(fullCanvas, ix, iy, iw, ih, 0, 0, rowCanvas.width, rowCanvas.height)
  // Invert colors so white-on-dark Boggle tiles become dark-on-light text
  const id = ctx.getImageData(0, 0, rowCanvas.width, rowCanvas.height)
  const d = id.data
  for (let i = 0; i < d.length; i += 4) {
    d[i] = 255 - d[i]
    d[i + 1] = 255 - d[i + 1]
    d[i + 2] = 255 - d[i + 2]
  }
  ctx.putImageData(id, 0, 0)
  const base64 = rowCanvas.toDataURL('image/jpeg', 0.9).split(',')[1]

  const { CapacitorPluginMlKitTextRecognition } = await import(
    '@pantrist/capacitor-plugin-ml-kit-text-recognition'
  )
  const placements: { col: number; ch: string }[] = []
  try {
    const result = await CapacitorPluginMlKitTextRecognition.detectText({ base64Image: base64 })
    for (const block of result.blocks) {
      for (const line of block.lines) {
        for (const el of line.elements) {
          const chars = normalizeLetter(el.text)
          if (chars.length === 0) continue
          const elLeft = el.boundingBox.left
          const elRight = el.boundingBox.right
          const elW = Math.max(1, elRight - elLeft)
          // For multi-character elements, distribute positions evenly
          const subW = elW / chars.length
          for (let i = 0; i < chars.length; i++) {
            const cx = elLeft + subW * (i + 0.5)
            // Map canvas-x to grid column. Canvas width spans (1 - 2*insetFrac)
            // of the source row, so the visible portion roughly equals the row.
            const frac = cx / rowCanvas.width
            const col = Math.max(0, Math.min(gridSize - 1, Math.floor(frac * gridSize)))
            placements.push({ col, ch: chars[i] })
          }
        }
      }
    }
  } catch { /* swallow */ }
  return placements
}

async function ocrWithMlKitPerCell(
  file: File, gridSize: 4 | 5 | 6, onProgress?: (msg: OcrProgressMsg) => void,
): Promise<{ grid: string[][]; gridSize: 4 | 5 | 6 }> {
  onProgress?.('Reading image…')
  const img = await loadImageFromFile(file)
  onProgress?.(`Image: ${img.width}×${img.height}px`)

  // Render at high resolution so each cell has enough detail for ML Kit
  const maxFull = 1600
  const scale = Math.min(1, maxFull / Math.max(img.width, img.height))
  const fw = Math.round(img.width * scale)
  const fh = Math.round(img.height * scale)
  const fullCanvas = document.createElement('canvas')
  fullCanvas.width = fw; fullCanvas.height = fh
  const fctx = fullCanvas.getContext('2d')!
  fctx.fillStyle = '#fff'
  fctx.fillRect(0, 0, fw, fh)
  fctx.drawImage(img, 0, 0, fw, fh)

  const cellW = fw / gridSize
  const cellH = fh / gridSize
  const total = gridSize * gridSize

  onProgress?.(`Per-cell OCR · ${total} cells · ${Math.round(cellW)}×${Math.round(cellH)}px each`)

  // Fire all cells in parallel — ML Kit calls are independent
  const promises: Promise<string>[] = []
  for (let r = 0; r < gridSize; r++) {
    for (let c = 0; c < gridSize; c++) {
      promises.push(ocrSingleCell(fullCanvas, c * cellW, r * cellH, cellW, cellH))
    }
  }
  const results = await Promise.all(promises)

  const grid: string[][] = Array.from({ length: gridSize }, () => Array(gridSize).fill(''))
  for (let r = 0; r < gridSize; r++) {
    for (let c = 0; c < gridSize; c++) {
      grid[r][c] = results[r * gridSize + c]
    }
  }

  let filled = grid.flat().filter(Boolean).length
  onProgress?.(`After per-cell: ${filled}/${total} filled`)

  // Per-row fallback for rows with empty cells
  const rowsNeedingHelp: number[] = []
  for (let r = 0; r < gridSize; r++) {
    if (grid[r].some((c) => !c)) rowsNeedingHelp.push(r)
  }

  if (rowsNeedingHelp.length > 0) {
    onProgress?.(`Per-row fallback on ${rowsNeedingHelp.length} row(s)…`)
    const rowResults = await Promise.all(
      rowsNeedingHelp.map((r) => ocrRow(fullCanvas, 0, r * cellH, fw, cellH, gridSize)),
    )
    for (let i = 0; i < rowsNeedingHelp.length; i++) {
      const r = rowsNeedingHelp[i]
      const placements = rowResults[i]
      // Fill each empty cell from any placement whose column matches.
      // First placement wins per column (don't overwrite).
      const used = new Set<number>()
      for (const p of placements) {
        if (used.has(p.col)) continue
        used.add(p.col)
        if (!grid[r][p.col]) grid[r][p.col] = p.ch
      }
    }
    filled = grid.flat().filter(Boolean).length
    onProgress?.(`After row fallback: ${filled}/${total} filled`)
  }

  onProgress?.(`Grid: ${grid.map((row) => row.map((c) => c || '·').join('')).join(' / ')}`)

  return { grid, gridSize }
}

// ─── main export ──────────────────────────────────────────────────────────────

export async function ocrGrid(
  file: File,
  onProgress?: (msg: OcrProgressMsg) => void,
  knownGridSize?: 4 | 5 | 6,
): Promise<{ grid: string[][]; gridSize: 4 | 5 | 6 }> {
  if (Capacitor.isNativePlatform()) {
    if (knownGridSize) return ocrWithMlKitPerCell(file, knownGridSize, onProgress)
    return ocrWithMlKit(file, onProgress)
  }
  return ocrWithTesseract(file, onProgress)
}
