import { Trie } from './Trie'

let cached: Trie | null = null
let pending: Promise<Trie> | null = null

export async function loadDictionary(): Promise<Trie> {
  if (cached) return cached
  if (pending) return pending

  pending = fetch('/dictionary.txt')
    .then((r) => {
      if (!r.ok) throw new Error(`Failed to load dictionary: ${r.status}`)
      return r.text()
    })
    .then((text) => {
      const trie = new Trie()
      for (const line of text.split('\n')) {
        const word = line.trim()
        if (word.length >= 3 && word.length <= 12) trie.insert(word)
      }
      cached = trie
      return trie
    })

  return pending
}
