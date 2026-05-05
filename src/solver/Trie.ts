class TrieNode {
  children: Map<string, TrieNode> = new Map()
  isEnd = false
}

export class Trie {
  private root = new TrieNode()

  insert(word: string): void {
    let node = this.root
    for (const ch of word) {
      let child = node.children.get(ch)
      if (!child) {
        child = new TrieNode()
        node.children.set(ch, child)
      }
      node = child
    }
    node.isEnd = true
  }

  contains(word: string): boolean {
    const node = this.traverse(word)
    return node !== null && node.isEnd
  }

  hasPrefix(prefix: string): boolean {
    return this.traverse(prefix) !== null
  }

  private traverse(str: string): TrieNode | null {
    let node = this.root
    for (const ch of str) {
      const next = node.children.get(ch)
      if (!next) return null
      node = next
    }
    return node
  }
}
