import { describe, expect, it } from 'vitest'
import { extractWikiLinks, type WikiLinkToken } from './wiki-links'

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
