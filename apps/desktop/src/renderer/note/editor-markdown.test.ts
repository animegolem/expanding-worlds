// @vitest-environment jsdom
import { MARKDOWN_ROUNDTRIP_CORPUS, extractWikiLinks } from '@ew/domain'
import { describe, expect, it } from 'vitest'
import { roundTripMarkdown } from './editor-markdown'

/** A token's identity as the lexical extractor sees it. */
function linkIdentity(body: string): string[] {
  return extractWikiLinks(body).map((t) => `${t.title}|${t.alias ?? ''}`)
}

/**
 * The §7.1 dialect regression gate (AI-IMP-146, expanded and FROZEN by
 * AI-IMP-150): the spike's corpus — grown to cover every mark/node
 * context the shipped editor produces — run through the REAL shipped
 * editor factory. Two invariants per case:
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

/**
 * §7.1 link-vs-token precedence (AI-IMP-170, rev 0.66) — the sharp edge
 * AI-IMP-150 flagged, now with a DEFINED, tested outcome rather than a
 * silent drop.
 *
 * RULING: the Markdown inline link wins. In `[text]([[Note]])` the
 * `[[Note]]` sits in the LINK-DESTINATION slot — a URL position — so it
 * is a URL, never a wiki-link token. CommonMark link-destination parsing
 * percent-encodes it (`%5B%5BNote%5D%5D`), a stable fixed point, and it
 * produces NO wiki-link record. Wiki-links live only in TEXT position; a
 * `[[…]]` inside `(…)` is inert. This lives OUTSIDE the round-trip corpus
 * on purpose: the corpus carries a hard link-identity invariant
 * (canonicalize-on-load never changes the extracted token set), and this
 * case DELIBERATELY reinterprets the token as a URL — the whole point of
 * the ruling — so pinning it here keeps that invariant honest for the
 * corpus while still nailing the behaviour down.
 */
describe('link-vs-token precedence (§7.1 — the Markdown link wins)', () => {
  it('a `[[…]]` in a link destination is an inert URL, not a wiki token', () => {
    const canonical = roundTripMarkdown('[text]([[Note]])')
    // The Markdown link is recognized; the destination is percent-encoded
    // per CommonMark, so the `[[` bytes are gone and no token remains.
    expect(canonical).toBe('[text](%5B%5BNote%5D%5D)')
    expect(extractWikiLinks(canonical)).toEqual([])
    // …and the ruled outcome is a fixed point (a second open is a no-op).
    expect(roundTripMarkdown(canonical)).toBe(canonical)
  })
})
