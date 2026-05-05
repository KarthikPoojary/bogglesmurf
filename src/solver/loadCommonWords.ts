let cached: Set<string> | null = null
let pending: Promise<Set<string>> | null = null

export async function loadCommonWords(): Promise<Set<string>> {
  if (cached) return cached
  if (pending) return pending

  pending = fetch('/common-words.txt')
    .then((r) => r.text())
    .then((text) => {
      const set = new Set<string>()
      for (const line of text.split('\n')) {
        const w = line.trim()
        if (w) set.add(w)
      }
      cached = set
      return set
    })
    .catch(() => {
      cached = new Set()
      return cached
    })

  return pending
}
