export interface OcrProgress {
  current: number
  total: number
  letter: string
  row: number
  col: number
}

function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => { URL.revokeObjectURL(url); resolve(img) }
    img.onerror = reject
    img.src = url
  })
}

function extractCell(
  src: HTMLCanvasElement,
  row: number,
  col: number,
  gridSize: number,
  outSize = 128
): HTMLCanvasElement {
  const cellW = src.width / gridSize
  const cellH = src.height / gridSize
  // Trim 10% inward so border/shadow doesn't confuse OCR
  const trim = 0.10
  const sx = (col + trim) * cellW
  const sy = (row + trim) * cellH
  const sw = cellW * (1 - 2 * trim)
  const sh = cellH * (1 - 2 * trim)

  const out = document.createElement('canvas')
  out.width = outSize
  out.height = outSize
  const ctx = out.getContext('2d')!

  // White background so threshold is consistent
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, outSize, outSize)
  ctx.drawImage(src, sx, sy, sw, sh, 0, 0, outSize, outSize)

  // Grayscale + auto-contrast
  const id = ctx.getImageData(0, 0, outSize, outSize)
  const d = id.data
  let min = 255, max = 0
  for (let i = 0; i < d.length; i += 4) {
    const g = Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2])
    if (g < min) min = g
    if (g > max) max = g
    d[i] = d[i + 1] = d[i + 2] = g
  }
  // Stretch contrast to full range
  const range = max - min || 1
  for (let i = 0; i < d.length; i += 4) {
    const g = Math.round(((d[i] - min) / range) * 255)
    // Threshold at midpoint — keep dark letters on light background
    const v = g < 140 ? 0 : 255
    d[i] = d[i + 1] = d[i + 2] = v
  }
  ctx.putImageData(id, 0, 0)
  return out
}

export async function ocrGrid(
  file: File,
  gridSize: number,
  onProgress?: (p: OcrProgress) => void
): Promise<string[][]> {
  // Lazy-load Tesseract — only downloaded when this function is first called
  const { createWorker, PSM } = await import('tesseract.js')

  const img = await loadImageFromFile(file)
  const src = document.createElement('canvas')
  src.width = img.width
  src.height = img.height
  src.getContext('2d')!.drawImage(img, 0, 0)

  const worker = await createWorker('eng')
  await worker.setParameters({
    // Single character mode; whitelist uppercase only
    tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
    tessedit_pageseg_mode: PSM.SINGLE_CHAR,
  })

  const total = gridSize * gridSize
  const grid: string[][] = Array.from({ length: gridSize }, () => Array(gridSize).fill(''))

  for (let r = 0; r < gridSize; r++) {
    for (let c = 0; c < gridSize; c++) {
      const cell = extractCell(src, r, c, gridSize)
      const { data } = await worker.recognize(cell)
      const letter = data.text.replace(/[^A-Za-z]/g, '').toUpperCase()[0] ?? ''
      grid[r][c] = letter
      onProgress?.({ current: r * gridSize + c + 1, total, letter, row: r, col: c })
    }
  }

  await worker.terminate()
  return grid
}
