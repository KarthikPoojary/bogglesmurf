import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Solution } from '../solver/solver'

type GridSize = 4 | 5 | 6

function emptyGrid(size: number): string[][] {
  return Array.from({ length: size }, () => Array(size).fill(''))
}

interface BoggleState {
  gridSize: GridSize
  letters: string[][]
  minLen: number
  maxLen: number
  solutions: Solution[]
  selectedWord: string | null
  isSolving: boolean
  overlayAlpha: number

  setGridSize: (size: GridSize) => void
  setLetter: (row: number, col: number, letter: string) => void
  clearGrid: () => void
  setSolutions: (s: Solution[]) => void
  setSelectedWord: (word: string | null) => void
  setMinLen: (n: number) => void
  setMaxLen: (n: number) => void
  setIsSolving: (b: boolean) => void
  setOverlayAlpha: (n: number) => void
}

export const useBoggleStore = create<BoggleState>()(
  persist(
    (set, get) => ({
      gridSize: 4,
      letters: emptyGrid(4),
      minLen: 3,
      maxLen: 12,
      solutions: [],
      selectedWord: null,
      isSolving: false,
      overlayAlpha: 0.85,

      setGridSize: (size) => set({ gridSize: size, letters: emptyGrid(size), solutions: [], selectedWord: null }),
      setLetter: (row, col, letter) => {
        const letters = get().letters.map((r) => [...r])
        letters[row][col] = letter.toUpperCase()
        set({ letters })
      },
      clearGrid: () => set((s) => ({ letters: emptyGrid(s.gridSize), solutions: [], selectedWord: null })),
      setSolutions: (solutions) => set({ solutions, selectedWord: null }),
      setSelectedWord: (word) => set({ selectedWord: word }),
      setMinLen: (minLen) => set({ minLen }),
      setMaxLen: (maxLen) => set({ maxLen }),
      setIsSolving: (isSolving) => set({ isSolving }),
      setOverlayAlpha: (overlayAlpha) => set({ overlayAlpha }),
    }),
    {
      name: 'bogglesmurf',
      partialize: (s) => ({ gridSize: s.gridSize, minLen: s.minLen, maxLen: s.maxLen, letters: s.letters, overlayAlpha: s.overlayAlpha }),
      // Rebuild letters from persisted value; fall back to empty grid if not present
      // (handles old persisted data that predates letters persistence).
      merge: (persisted, current) => {
        const p = persisted as { gridSize?: GridSize; minLen?: number; maxLen?: number; letters?: string[][]; overlayAlpha?: number }
        const size = p.gridSize ?? current.gridSize
        const letters = p.letters ?? emptyGrid(size)
        return { ...current, ...p, letters }
      },
    }
  )
)
