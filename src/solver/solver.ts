import type { Trie } from './Trie'

export interface GridCell {
  row: number
  col: number
  letter: string
}

export interface Solution {
  word: string
  path: GridCell[]
}

const DIRECTIONS: [number, number][] = [
  [-1, -1], [-1, 0], [-1, 1],
  [ 0, -1],          [ 0, 1],
  [ 1, -1], [ 1, 0], [ 1, 1],
]

export function solve(
  grid: string[][],
  trie: Trie,
  minLen = 3,
  maxLen = 12
): Solution[] {
  const size = grid.length
  const found = new Map<string, Solution>()
  const visited = new Uint8Array(size * size)

  function dfs(row: number, col: number, prefix: string, path: GridCell[]) {
    const letter = grid[row][col].toLowerCase()
    // Q tile represents "qu" — one tile, two letters
    const contribution = letter === 'q' ? 'qu' : letter
    const word = prefix + contribution

    if (!trie.hasPrefix(word)) return

    const cell: GridCell = { row, col, letter: grid[row][col] }
    const newPath = [...path, cell]

    if (word.length >= minLen && word.length <= maxLen && trie.contains(word)) {
      if (!found.has(word)) found.set(word, { word, path: newPath })
    }

    if (word.length >= maxLen) return

    const idx = row * size + col
    visited[idx] = 1

    for (const [dr, dc] of DIRECTIONS) {
      const nr = row + dr
      const nc = col + dc
      if (nr >= 0 && nr < size && nc >= 0 && nc < size && !visited[nr * size + nc]) {
        dfs(nr, nc, word, newPath)
      }
    }

    visited[idx] = 0
  }

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      dfs(r, c, '', [])
    }
  }

  return Array.from(found.values()).sort((a, b) => b.word.length - a.word.length || a.word.localeCompare(b.word))
}
