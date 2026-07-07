// @vitest-environment jsdom
import { MARKDOWN_ROUNDTRIP_CORPUS } from '@ew/domain'
import { describe, expect, it } from 'vitest'
import { roundTripMarkdown } from './editor-markdown'

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

  it('every valid wiki-link/embed case is byte-stable (no bracket churn)', () => {
    const tokenCases = MARKDOWN_ROUNDTRIP_CORPUS.filter(
      (c) => /\[\[/.test(c.body) && !c.name.startsWith('adv-malformed'),
    )
    for (const { name, body, canonical } of tokenCases) {
      expect(canonical, name).toBe(body)
    }
  })
})
