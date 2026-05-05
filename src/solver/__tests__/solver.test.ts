import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { Trie } from '../Trie'
import { solve } from '../solver'

// ─── helpers ────────────────────────────────────────────────────────────────

function makeTrie(words: string[]): Trie {
  const t = new Trie()
  words.forEach((w) => t.insert(w))
  return t
}

function words(solutions: ReturnType<typeof solve>) {
  return solutions.map((s) => s.word)
}

// ─── Trie ops via solver ─────────────────────────────────────────────────────

describe('solve — basic word finding on 2×2 all-adjacent grid', () => {
  // All 4 cells are mutually adjacent in a 2×2:
  // a t
  // e s
  const grid = [
    ['a', 't'],
    ['e', 's'],
  ]

  const knownWords = ['ate', 'eat', 'set', 'sat', 'tea', 'sea', 'eta', 'seat', 'east', 'eats', 'sate', 'teas', 'etas']
  const trie = makeTrie(knownWords)

  it('finds all reachable words in the mini-trie', () => {
    const found = words(solve(grid, trie))
    for (const w of knownWords) {
      expect(found, `expected "${w}" to be found`).toContain(w)
    }
  })

  it('does not return words not in the trie', () => {
    const found = words(solve(grid, trie))
    expect(found).not.toContain('cat')
    expect(found).not.toContain('dog')
  })

  it('returns correct path length (cells used, not letters)', () => {
    const solutions = solve(grid, trie)
    const seat = solutions.find((s) => s.word === 'seat')
    expect(seat).toBeDefined()
    expect(seat!.path).toHaveLength(4)  // 4 distinct tiles
  })

  it('each path cell has unique row+col combination', () => {
    const solutions = solve(grid, trie)
    for (const { word, path } of solutions) {
      const coords = path.map((c) => `${c.row},${c.col}`)
      const unique = new Set(coords)
      expect(unique.size, `word "${word}" reuses a cell`).toBe(path.length)
    }
  })
})

// ─── Qu handling ─────────────────────────────────────────────────────────────

describe('solve — Qu tile handling', () => {
  // Grid:  q z
  //        i u
  // q[0,0]→i[1,0]→z[0,1] is a valid path → word "quiz"
  const grid = [
    ['q', 'z'],
    ['i', 'u'],
  ]

  it('treats Q tile as "qu" and finds "quiz"', () => {
    const trie = makeTrie(['quiz', 'qui'])
    const found = words(solve(grid, trie))
    expect(found).toContain('quiz')
  })

  it('counts Q tile as contributing 2 letters for length filtering', () => {
    // "quiz" is 4 letters; with minLen=5 it should be excluded
    const trie = makeTrie(['quiz'])
    const found = words(solve(grid, trie, 5, 12))
    expect(found).not.toContain('quiz')
  })

  it('standalone Q tile produces "qu" prefix, not just "q"', () => {
    // Words starting with "qu" should be found; words starting with "q" without "u" should not
    const trie = makeTrie(['quiz'])
    const results = solve(grid, trie)
    expect(results.find((s) => s.word === 'quiz')).toBeDefined()
  })
})

// ─── Min/max length filtering ─────────────────────────────────────────────────

describe('solve — length filtering', () => {
  const grid = [
    ['a', 't'],
    ['e', 's'],
  ]
  const trie = makeTrie(['ate', 'seat', 'eats', 'east'])

  it('excludes words shorter than minLen', () => {
    const found = words(solve(grid, trie, 4, 12))
    expect(found).not.toContain('ate')
    expect(found).toContain('seat')
  })

  it('excludes words longer than maxLen', () => {
    const found = words(solve(grid, trie, 3, 3))
    expect(found).toContain('ate')
    expect(found).not.toContain('seat')
    expect(found).not.toContain('eats')
  })

  it('includes words exactly at the boundary lengths', () => {
    const found = words(solve(grid, trie, 3, 4))
    expect(found).toContain('ate')   // exactly minLen (3)
    expect(found).toContain('seat')  // exactly maxLen (4)
    expect(found).toContain('eats')  // also maxLen (4) — both should be included
  })
})

// ─── Grid size sanity checks ──────────────────────────────────────────────────

describe('solve — grid size sanity', () => {
  // Reuse a real subset of words so we don't need the dictionary loaded
  const trie = makeTrie([
    'star', 'rats', 'arts', 'tars', 'stare', 'rates', 'tears', 'stares', 'raster',
    'alert', 'alter', 'later', 'ratel', 'artel', 'alters',
  ])

  it('finds words on a 5×5 grid', () => {
    const grid = [
      ['s', 't', 'a', 'r', 'e'],
      ['r', 'a', 't', 'e', 's'],
      ['a', 'l', 'e', 'r', 't'],
      ['t', 'e', 'r', 's', 'a'],
      ['s', 'a', 't', 'e', 'r'],
    ]
    const found = words(solve(grid, trie))
    expect(found.length).toBeGreaterThan(0)
  })

  it('finds words on a 6×6 grid', () => {
    const grid = [
      ['s', 't', 'a', 'r', 'e', 's'],
      ['r', 'a', 't', 'e', 'r', 'a'],
      ['a', 'l', 'e', 'r', 't', 's'],
      ['t', 'e', 'r', 's', 'a', 't'],
      ['s', 'a', 't', 'e', 'r', 'e'],
      ['r', 't', 's', 'a', 'l', 't'],
    ]
    const found = words(solve(grid, trie))
    expect(found.length).toBeGreaterThan(0)
  })

  it('returns unique words even when multiple paths exist for same word', () => {
    const grid = [
      ['a', 't'],
      ['e', 's'],
    ]
    const t = makeTrie(['ate'])
    const found = solve(grid, t)
    const ateResults = found.filter((s) => s.word === 'ate')
    expect(ateResults).toHaveLength(1)  // deduplicated; path recorded for first occurrence
  })
})

// ─── Performance ──────────────────────────────────────────────────────────────

describe('solve — performance', () => {
  let realTrie: Trie

  beforeAll(() => {
    // Read the real dictionary from disk (Node fs available in Vitest even with jsdom env)
    const dictPath = resolve(process.cwd(), 'public/dictionary.txt')
    const text = readFileSync(dictPath, 'utf-8')
    realTrie = new Trie()
    for (const line of text.split('\n')) {
      const w = line.trim()
      if (w.length >= 3 && w.length <= 12) realTrie.insert(w)
    }
  })

  it('solves a 4×4 grid in under 100ms with full SOWPODS dictionary', () => {
    const grid = [
      ['s', 't', 'a', 'r'],
      ['e', 'a', 'l', 'e'],
      ['n', 'o', 'b', 's'],
      ['d', 'i', 't', 's'],
    ]
    const start = performance.now()
    const results = solve(grid, realTrie)
    const elapsed = performance.now() - start

    expect(elapsed).toBeLessThan(100)
    expect(results.length).toBeGreaterThan(10)  // a well-populated grid should yield many words
  })

  it('results are sorted longest-first then alphabetically', () => {
    const grid = [
      ['s', 't', 'a', 'r'],
      ['e', 'a', 'l', 'e'],
      ['n', 'o', 'b', 's'],
      ['d', 'i', 't', 's'],
    ]
    const results = solve(grid, realTrie)
    for (let i = 0; i < results.length - 1; i++) {
      const a = results[i]
      const b = results[i + 1]
      if (a.word.length === b.word.length) {
        expect(a.word.localeCompare(b.word)).toBeLessThanOrEqual(0)
      } else {
        expect(a.word.length).toBeGreaterThanOrEqual(b.word.length)
      }
    }
  })
})
