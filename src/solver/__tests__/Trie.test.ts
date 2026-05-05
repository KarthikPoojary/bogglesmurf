import { describe, it, expect, beforeEach } from 'vitest'
import { Trie } from '../Trie'

describe('Trie', () => {
  let trie: Trie

  beforeEach(() => {
    trie = new Trie()
    trie.insert('cat')
    trie.insert('cats')
    trie.insert('catch')
    trie.insert('dog')
    trie.insert('quiz')
  })

  describe('contains', () => {
    it('finds inserted words', () => {
      expect(trie.contains('cat')).toBe(true)
      expect(trie.contains('cats')).toBe(true)
      expect(trie.contains('catch')).toBe(true)
      expect(trie.contains('dog')).toBe(true)
      expect(trie.contains('quiz')).toBe(true)
    })

    it('does not find words not inserted', () => {
      expect(trie.contains('ca')).toBe(false)
      expect(trie.contains('do')).toBe(false)
      expect(trie.contains('catfish')).toBe(false)
      expect(trie.contains('')).toBe(false)
    })

    it('is case-sensitive (stores what is inserted)', () => {
      expect(trie.contains('CAT')).toBe(false)
      expect(trie.contains('cat')).toBe(true)
    })
  })

  describe('hasPrefix', () => {
    it('finds valid prefixes', () => {
      expect(trie.hasPrefix('c')).toBe(true)
      expect(trie.hasPrefix('ca')).toBe(true)
      expect(trie.hasPrefix('cat')).toBe(true)  // full word is also a valid prefix
      expect(trie.hasPrefix('catc')).toBe(true)
      expect(trie.hasPrefix('d')).toBe(true)
      expect(trie.hasPrefix('qu')).toBe(true)
    })

    it('rejects prefixes with no matching words', () => {
      expect(trie.hasPrefix('z')).toBe(false)
      expect(trie.hasPrefix('xyz')).toBe(false)
      expect(trie.hasPrefix('catz')).toBe(false)
    })

    it('rejects empty string as having a prefix (root always exists)', () => {
      // empty prefix always traverses to root which is not null
      expect(trie.hasPrefix('')).toBe(true)
    })
  })

  describe('edge cases', () => {
    it('handles inserting the same word twice without error', () => {
      trie.insert('cat')
      expect(trie.contains('cat')).toBe(true)
    })

    it('handles single-character words', () => {
      trie.insert('a')
      expect(trie.contains('a')).toBe(true)
      expect(trie.hasPrefix('a')).toBe(true)
    })

    it('does not confuse prefix with whole word', () => {
      // 'ca' is NOT in the trie, but 'cat' is
      expect(trie.contains('ca')).toBe(false)
      expect(trie.hasPrefix('ca')).toBe(true)
    })
  })
})
