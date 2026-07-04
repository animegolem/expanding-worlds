import { describe, expect, it } from 'vitest'
import { nameKey, titleKey } from './title-key'

describe('titleKey (RFC-0001 §4.2)', () => {
  const cases: Array<[string, string, string]> = [
    ['trims edges', '  Foo Bar  ', 'foo bar'],
    ['collapses internal runs', 'Foo \t\n  Bar', 'foo bar'],
    ['case folds', 'FOO Bar bAz', 'foo bar baz'],
    ['folds non-ASCII case', 'Ærøskøbing HÖHLE', 'ærøskøbing höhle'],
    ['handles unicode whitespace', 'Foo  Bar', 'foo bar'],
    ['keeps ß (simple folding, full folding out of scope)', 'Straße', 'straße'],
    ['identity on already-normal input', 'ghost ship', 'ghost ship'],
  ]

  it.each(cases)('%s', (_name, input, expected) => {
    expect(titleKey(input)).toBe(expected)
  })

  it('normalizes to NFC so composed and decomposed forms collide', () => {
    const composed = 'Café' // é
    const decomposed = 'Café' // e + combining acute
    expect(titleKey(composed)).toBe(titleKey(decomposed))
  })

  it('is idempotent', () => {
    const once = titleKey('  MIXED   Case Title ')
    expect(titleKey(once)).toBe(once)
  })

  it('nameKey is the same normalization (§4.8)', () => {
    expect(nameKey('  Coastal  TOWNS ')).toBe('coastal towns')
  })
})
