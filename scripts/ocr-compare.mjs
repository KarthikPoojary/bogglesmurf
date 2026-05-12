#!/usr/bin/env node
// Compare Gemini and Groq+Llama vision OCR on cropped Boggle grid images.
// Usage:
//   GEMINI_API_KEY=... GROQ_API_KEY=... node scripts/ocr-compare.mjs <img1> [img2 …]
//
// Each image is sent to both APIs with the same prompt asking for a JSON grid.
// Output is a side-by-side per-cell comparison against a hard-coded ground
// truth (see GROUND_TRUTH below). Add entries there for any new test images.

import fs from 'node:fs/promises'
import path from 'node:path'

// ─── Ground truth ─────────────────────────────────────────────────────────────
// Keyed by filename (basename). Each value is a row-by-row grid of letters.
// "QU" cells use the literal string "QU".
const GROUND_TRUTH = {
  'f9ba5710-1000071921.jpg': [
    ['E', 'C', 'H', 'D', 'A', 'R'],
    ['K', 'I', 'D', 'A', 'P', 'H'],
    ['L', 'A', 'B', 'U', 'F', 'O'],
    ['E', 'Y', 'F', 'R', 'T', 'J'],
    ['P', 'O', 'O', 'N', 'O', 'M'],
    ['O', 'M', 'L', 'T', 'T', 'I'],
  ],
  'd109d901-1000071919.jpg': [
    ['G', 'Z', 'D', 'U', 'J', 'I'],
    ['D', 'I', 'I', 'T', 'P', 'H'],
    ['O', 'X', 'P', 'A', 'L', 'O'],
    ['M', 'S', 'O', 'D', 'N', 'O'],
    ['I', 'H', 'S', 'L', 'A', 'L'],
    ['U', 'T', 'A', 'E', 'QU', 'C'],
  ],
  '0ae8eeb5-1000071917.jpg': [
    ['A', 'A', 'A', 'Z', 'C', 'F'],
    ['C', 'QU', 'M', 'E', 'N', 'I'],
    ['L', 'E', 'D', 'E', 'D', 'I'],
    ['V', 'X', 'A', 'P', 'I', 'R'],
    ['F', 'O', 'N', 'I', 'T', 'L'],
    ['O', 'G', 'W', 'U', 'S', 'E'],
  ],
}

const PROMPT = `You are reading a Boggle grid from a photograph.
The grid is N×N where N is 4, 5, or 6. Tiles contain a single uppercase letter,
except occasional "QU" tiles which contain two letters as one tile.

Return ONLY a JSON object with two fields, no prose:
{
  "size": <4|5|6>,
  "grid": [["A","B",...], ["C","D",...], ...]
}

Each inner array represents one row in reading order (top→bottom, left→right).
Each cell is a single uppercase letter, or "QU" for a Qu-tile. No extra
characters, no quotes inside cells, no markdown fences.`

// ─── Provider calls ───────────────────────────────────────────────────────────

async function callGemini(base64, mimeType = 'image/jpeg') {
  const key = process.env.GEMINI_API_KEY
  if (!key) throw new Error('GEMINI_API_KEY not set')
  // gemini-2.5-flash is the recommended free-tier vision model
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`
  const body = {
    contents: [{
      parts: [
        { text: PROMPT },
        { inline_data: { mime_type: mimeType, data: base64 } },
      ],
    }],
    generationConfig: {
      response_mime_type: 'application/json',
      temperature: 0,
    },
  }
  const t0 = Date.now()
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const dt = Date.now() - t0
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Gemini ${res.status}: ${text.slice(0, 300)}`)
  }
  const data = await res.json()
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
  return { text, dt, raw: data }
}

async function callGroq(base64, mimeType = 'image/jpeg') {
  const key = process.env.GROQ_API_KEY
  if (!key) throw new Error('GROQ_API_KEY not set')
  // llama-3.2-11b-vision-preview was the original; check Groq docs for current
  // vision model name if this fails.
  const model = process.env.GROQ_MODEL || 'meta-llama/llama-4-scout-17b-16e-instruct'
  const url = 'https://api.groq.com/openai/v1/chat/completions'
  const body = {
    model,
    temperature: 0,
    response_format: { type: 'json_object' },
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: PROMPT },
        { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64}` } },
      ],
    }],
  }
  const t0 = Date.now()
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${key}`,
    },
    body: JSON.stringify(body),
  })
  const dt = Date.now() - t0
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Groq ${res.status}: ${text.slice(0, 300)}`)
  }
  const data = await res.json()
  const text = data?.choices?.[0]?.message?.content ?? ''
  return { text, dt, raw: data }
}

// ─── Parsing ──────────────────────────────────────────────────────────────────

function tryParseGrid(text) {
  // Strip any markdown fences just in case
  const cleaned = text.replace(/```(?:json)?/g, '').trim()
  try {
    const obj = JSON.parse(cleaned)
    if (Array.isArray(obj?.grid)) return obj.grid
    if (Array.isArray(obj)) return obj  // model returned just an array
    return null
  } catch {
    return null
  }
}

// ─── Comparison ───────────────────────────────────────────────────────────────

function compare(expected, actual) {
  if (!Array.isArray(actual) || actual.length !== expected.length) {
    return { correct: 0, total: expected.length * expected.length, errors: ['SHAPE_MISMATCH'] }
  }
  let correct = 0
  let total = 0
  const errors = []
  for (let r = 0; r < expected.length; r++) {
    for (let c = 0; c < expected[r].length; c++) {
      total++
      const exp = (expected[r][c] || '').toUpperCase()
      const got = ((actual[r] || [])[c] || '').toString().toUpperCase()
      if (exp === got) correct++
      else errors.push(`(${r},${c}) expected "${exp}", got "${got}"`)
    }
  }
  return { correct, total, errors }
}

function renderGrid(grid) {
  if (!Array.isArray(grid)) return '(invalid)'
  return grid.map(row =>
    (Array.isArray(row) ? row : []).map(c => (c || '·').padEnd(2, ' ')).join(' ')
  ).join('\n')
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2)
  if (args.length === 0) {
    console.error('Usage: ocr-compare.mjs <img1> [img2 …]')
    process.exit(1)
  }

  const haveGemini = !!process.env.GEMINI_API_KEY
  const haveGroq = !!process.env.GROQ_API_KEY
  if (!haveGemini && !haveGroq) {
    console.error('Set GEMINI_API_KEY and/or GROQ_API_KEY')
    process.exit(1)
  }
  console.log(`Providers: ${[haveGemini && 'Gemini', haveGroq && 'Groq'].filter(Boolean).join(', ')}`)
  console.log()

  const summary = []

  for (const filePath of args) {
    const fileName = path.basename(filePath)
    const buf = await fs.readFile(filePath)
    const base64 = buf.toString('base64')
    const truth = GROUND_TRUTH[fileName]

    console.log(`━━━ ${fileName} ━━━`)
    console.log(`Size: ${(buf.length / 1024).toFixed(0)} KB`)
    if (!truth) console.log('(no ground truth — will only show outputs)')
    else console.log(`Ground truth ${truth.length}×${truth[0].length}:\n${renderGrid(truth)}`)
    console.log()

    const providers = []
    if (haveGemini) providers.push(['Gemini 2.5 Flash', () => callGemini(base64)])
    if (haveGroq)   providers.push([`Groq ${process.env.GROQ_MODEL || 'llama-4-scout'}`, () => callGroq(base64)])

    for (const [name, fn] of providers) {
      try {
        const { text, dt } = await fn()
        const grid = tryParseGrid(text)
        if (!grid) {
          console.log(`  ${name} [${dt}ms]: COULD NOT PARSE — raw response:`)
          console.log('    ' + text.slice(0, 300).replace(/\n/g, '\n    '))
          summary.push({ image: fileName, provider: name, correct: 0, total: truth ? truth.length * truth.length : 0, dt, parsed: false })
          continue
        }
        console.log(`  ${name} [${dt}ms]:`)
        console.log(renderGrid(grid).replace(/^/gm, '    '))
        if (truth) {
          const cmp = compare(truth, grid)
          console.log(`    Score: ${cmp.correct}/${cmp.total} (${(cmp.correct / cmp.total * 100).toFixed(0)}%)`)
          if (cmp.errors.length && cmp.errors.length <= 12) {
            for (const e of cmp.errors) console.log(`      ${e}`)
          } else if (cmp.errors.length > 12) {
            console.log(`      (${cmp.errors.length} errors — too many to list)`)
          }
          summary.push({ image: fileName, provider: name, correct: cmp.correct, total: cmp.total, dt, parsed: true })
        }
      } catch (err) {
        console.log(`  ${name}: ERROR — ${err.message}`)
        summary.push({ image: fileName, provider: name, correct: 0, total: 0, dt: 0, parsed: false, error: err.message })
      }
      console.log()
    }
  }

  console.log('━━━ Summary ━━━')
  const byProv = {}
  for (const s of summary) {
    byProv[s.provider] ??= { correct: 0, total: 0, dt: 0, runs: 0 }
    byProv[s.provider].correct += s.correct
    byProv[s.provider].total += s.total
    byProv[s.provider].dt += s.dt
    byProv[s.provider].runs++
  }
  for (const [name, agg] of Object.entries(byProv)) {
    const pct = agg.total ? (agg.correct / agg.total * 100).toFixed(1) : '—'
    const avgDt = agg.runs ? (agg.dt / agg.runs).toFixed(0) : '—'
    console.log(`  ${name}: ${agg.correct}/${agg.total} (${pct}%)  · avg ${avgDt}ms`)
  }
}

main().catch(err => { console.error(err); process.exit(1) })
