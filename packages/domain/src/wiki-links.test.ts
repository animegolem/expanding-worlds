import { describe, expect, it } from 'vitest'
import {
  extractWikiLinks,
  matchWikiLinkAt,
  linkDisplayState,
  type LinkResolutionContext,
  type WikiLinkToken,
} from './wiki-links'

function token(start: number, end: number, title: string, alias: string | null): WikiLinkToken {
  return { start, end, title, alias }
}

describe('extractWikiLinks (RFC-0001 §7.1)', () => {
  const cases: Array<[string, string, WikiLinkToken[]]> = [
    ['plain token', 'see [[Ghost Ship]] here', [token(4, 18, 'Ghost Ship', null)]],
    ['aliased token', '[[Ghost Ship|the ship]]', [token(0, 23, 'Ghost Ship', 'the ship')]],
    [
      'adjacent tokens',
      '[[A]][[B]]',
      [token(0, 5, 'A', null), token(5, 10, 'B', null)],
    ],
    [
      'unicode titles',
      'x [[Ærøskøbing]] y [[北京|the capital]]',
      [token(2, 16, 'Ærøskøbing', null), token(19, 37, '北京', 'the capital')],
    ],
    [
      'later pipes belong to the alias',
      '[[a|b|c]]',
      [token(0, 9, 'a', 'b|c')],
    ],
    ['empty token is plain text', 'a [[]] b', []],
    ['whitespace-only title is plain text', 'a [[   ]] b', []],
    ['empty title with alias is plain text', '[[|alias]]', []],
    ['empty alias is plain text', '[[Title|]]', []],
    ['unclosed token is plain text', 'a [[Ghost Ship', []],
    ['line break inside is plain text', '[[Ghost\nShip]]', []],
    ['single brackets are plain text', '[Ghost Ship] (link)[url]', []],
    [
      'stray outer brackets: inner token still parses',
      '[[[A]]]',
      [token(1, 6, 'A', null)],
    ],
    [
      'token at end of body',
      'tail [[End]]',
      [token(5, 12, 'End', null)],
    ],
    [
      'whitespace preserved raw in title and alias',
      '[[ Ghost Ship | the  ship ]]',
      [token(0, 28, ' Ghost Ship ', ' the  ship ')],
    ],
    [
      'no escape syntax: backslash has no special meaning',
      String.raw`\[[Ghost Ship]]`,
      [token(1, 15, 'Ghost Ship', null)],
    ],
    [
      'lexical: tokens inside code fences still extract',
      '```\n[[Code Link]]\n```',
      [token(4, 17, 'Code Link', null)],
    ],
  ]

  it.each(cases)('%s', (_name, body, expected) => {
    expect(extractWikiLinks(body)).toEqual(expected)
  })

  it('ranges slice the body back to the exact token text', () => {
    const body = 'a [[One]] b [[Two|2]] c'
    const tokens = extractWikiLinks(body)
    expect(body.slice(tokens[0].start, tokens[0].end)).toBe('[[One]]')
    expect(body.slice(tokens[1].start, tokens[1].end)).toBe('[[Two|2]]')
  })

  it('ranges are UTF-16 code-unit offsets (astral characters count as two)', () => {
    const body = '𝕏 [[A]]' // 𝕏 is one astral code point = two UTF-16 units
    const tokens = extractWikiLinks(body)
    expect(tokens).toEqual([token(3, 8, 'A', null)])
    expect(body.slice(3, 8)).toBe('[[A]]')
  })
})

describe('matchWikiLinkAt (§7.1 scan-at-position, AI-IMP-156)', () => {
  it('matches a token that starts exactly at pos', () => {
    const body = 'Fight the [[Dragon]] now.'
    expect(matchWikiLinkAt(body, 10)).toEqual(token(10, 20, 'Dragon', null))
  })

  it('returns null when no token starts at pos (even if one exists later)', () => {
    const body = 'Fight the [[Dragon]] now.'
    expect(matchWikiLinkAt(body, 0)).toBeNull()
    expect(matchWikiLinkAt(body, 9)).toBeNull() // one char before the `[[`
  })

  it('keeps Markdown-active title bytes whole (the opacity contract)', () => {
    for (const title of ['my *starred* title', '**bold**', 'a`code`b', '~~struck~~']) {
      const body = `x [[${title}]] y`
      const match = matchWikiLinkAt(body, 2)
      expect(match?.title, title).toBe(title)
      expect(body.slice(match!.start, match!.end), title).toBe(`[[${title}]]`)
    }
  })

  it('agrees with extractWikiLinks at every token start', () => {
    const body = 'a [[One]] b [[Two|2]] c [[m *n* o]] d'
    for (const wanted of extractWikiLinks(body)) {
      expect(matchWikiLinkAt(body, wanted.start)).toEqual(wanted)
    }
  })

  it('rejects malformed candidates at pos', () => {
    expect(matchWikiLinkAt('[[   ]]', 0)).toBeNull()
    expect(matchWikiLinkAt('[[|x]]', 0)).toBeNull()
    expect(matchWikiLinkAt('[[x', 0)).toBeNull()
    expect(matchWikiLinkAt('[[a\nb]]', 0)).toBeNull()
  })
})

describe('linkDisplayState (§7.1/§7.2, AI-IMP-045)', () => {
  const ctx = (
    broken: string[],
    titles: Array<[string, 'active' | 'trashed']>,
  ): LinkResolutionContext => ({ brokenKeys: new Set(broken), titles: new Map(titles) })

  it('binds against active and trashed notes, else unresolved', () => {
    const resolution = ctx([], [['harbor', 'active'], ['reef', 'trashed']])
    expect(linkDisplayState('harbor', resolution)).toBe('bound')
    expect(linkDisplayState('reef', resolution)).toBe('bound-trashed')
    expect(linkDisplayState('kraken', resolution)).toBe('unresolved')
  })

  it('a broken key stays broken even when an active note matches (invariant 27)', () => {
    const resolution = ctx(['harbor'], [['harbor', 'active']])
    expect(linkDisplayState('harbor', resolution)).toBe('broken')
  })
})
