import { describe, expect, it } from 'vitest'
import { MARKDOWN_ROUNDTRIP_CORPUS } from './markdown-dialect'
import { extractWikiLinks } from './wiki-links'

/**
 * Pure corpus invariants (AI-IMP-146). The full `serialize(parse(...))`
 * round-trip runs through the REAL editor factory in
 * apps/desktop/src/renderer/note/editor-markdown.test.ts (the editor is
 * not a domain dependency); here we pin the domain-level contract:
 * canonicalization must never change what the lexical link extractor
 * sees — link identity survives the one-time normalization.
 */
describe('markdown dialect corpus (§7.1 canonicalization contract)', () => {
  it('has unique case names', () => {
    const names = MARKDOWN_ROUNDTRIP_CORPUS.map((c) => c.name)
    expect(new Set(names).size).toBe(names.length)
  })

  it('canonicalization preserves wiki-link identity (title + alias)', () => {
    for (const { name, body, canonical } of MARKDOWN_ROUNDTRIP_CORPUS) {
      const before = extractWikiLinks(body).map((t) => `${t.title}|${t.alias ?? ''}`)
      const after = extractWikiLinks(canonical).map((t) => `${t.title}|${t.alias ?? ''}`)
      expect(after, name).toEqual(before)
    }
  })

  it('malformed sequences extract zero tokens in both forms', () => {
    for (const { name, body, canonical } of MARKDOWN_ROUNDTRIP_CORPUS) {
      if (!name.startsWith('adv-malformed')) continue
      expect(extractWikiLinks(body), name).toEqual([])
      expect(extractWikiLinks(canonical), name).toEqual([])
    }
  })
})
