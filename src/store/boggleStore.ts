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

  setGridSize: (size: GridSize) => void
  setLetter: (row: number, col: number, letter: string) => void
  clearGrid: () => void
  setSolutions: (s: Solution[]) => void
  setSelectedWord: (word: string | null) => void
  setMinLen: (n: number) => void
  setMaxLen: (n: number) => void
  setIsSolving: (b: boolean) => void
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
    }),
    {
      name: 'bogglesmurf',
      partialize: (s) => ({ gridSize: s.gridSize, minLen: s.minLen, maxLen: s.maxLen }),
    }
  )
)
