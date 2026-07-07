// @vitest-environment jsdom
import { MARKDOWN_ROUNDTRIP_CORPUS, extractWikiLinks } from '@ew/domain'
import { describe, expect, it } from 'vitest'
import { roundTripMarkdown } from './editor-markdown'

/** A token's identity as the lexical extractor sees it. */
function linkIdentity(body: string): string[] {
  return extractWikiLinks(body).map((t) => `${t.title}|${t.alias ?? ''}`)
}

/**
 * The §7.1 dialect regression gate (AI-IMP-146): the spike's 25-case
 * corpus run through the REAL shipped editor factory. Two invariants per
 * case:
 *   1. serialize(parse(body)) === canonical — the one-time
 *      canonicalize-on-load result is exactly what the corpus pins.
 *   2. serialize(parse(canonical)) === canonical — the canonical form is
 *      a FIXED POINT, so a second open never re-normalizes (the property
 *      that makes canonicalization once-per-note).
 *
 * Valid wiki-link/embed tokens are byte-STABLE (the source-preserving
 * text serializer, AI-IMP-147) — proving the engine swap did not
 * introduce bracket-escaping churn.
 */
describe('frozen Markdown dialect round-trip (§7.1)', () => {
  for (const { name, body, canonical } of MARKDOWN_ROUNDTRIP_CORPUS) {
    it(`canonicalizes "${name}" and reaches a fixed point`, () => {
      expect(roundTripMarkdown(body)).toBe(canonical)
      expect(roundTripMarkdown(canonical)).toBe(canonical)
    })
  }

  it('canonicalize-on-load preserves link identity through the real factory', () => {
    // The load-bearing invariant (AI-IMP-156): the token bytes the lexical
    // extractor sees BEFORE the editor touches the body must survive
    // `serialize(parse(body))`. A parse-stage split of `[[my *starred*
    // title]]` across emphasis marks drops the record silently on first
    // open — the data-loss this ticket fixes.
    for (const { name, body } of MARKDOWN_ROUNDTRIP_CORPUS) {
      expect(linkIdentity(roundTripMarkdown(body)), name).toEqual(linkIdentity(body))
    }
  })

  it('every valid wiki-link/embed case is byte-stable (no bracket churn)', () => {
    const tokenCases = MARKDOWN_ROUNDTRIP_CORPUS.filter(
      (c) => /\[\[/.test(c.body) && !c.name.startsWith('adv-malformed'),
    )
    for (const { name, body, canonical } of tokenCases) {
      expect(canonical, name).toBe(body)
    }
  })
})
