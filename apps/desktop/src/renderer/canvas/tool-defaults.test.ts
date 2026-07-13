import { describe, expect, it } from 'vitest'
import { defaultsKind, nextTextDefaults, rememberToolColor } from './tool-defaults'

describe('Dock tool defaults (AI-IMP-289)', () => {
  it('shows exactly one defaults species for tools that consume one', () => {
    expect(defaultsKind('text')).toBe('text')
    for (const shape of ['rect', 'ellipse', 'triangle', 'diamond', 'shape-arrow'] as const)
      expect(defaultsKind(shape)).toBe('shape')
    for (const line of ['path', 'line', 'arrow', 'connector'] as const)
      expect(defaultsKind(line)).toBe('line')
    for (const quiet of ['select', 'pin', 'frame'] as const)
      expect(defaultsKind(quiet)).toBeNull()
  })

  it('keeps one de-duplicated MRU queue capped at the kit-owned nine', () => {
    const seed = Array.from({ length: 12 }, (_, index) => `#0000${index.toString(16).padStart(2, '0')}`)
    expect(rememberToolColor(seed, seed[4]!)).toEqual([seed[4], ...seed.filter((_, index) => index !== 4).slice(0, 8)])
    expect(rememberToolColor(seed, '#ffffff')).toEqual(['#ffffff', ...seed.slice(0, 8)])
  })

  it('applies font, ink, and a zoom-relative size multiplier to new text', () => {
    expect(nextTextDefaults({
      stroke: '#111111', strokeScale: 1, fill: null, textColor: '#abcdef',
      textFontFamily: 'serif', textSizeScale: 1.5,
    }, 2)).toEqual({ fontSize: 12, color: '#abcdef', fontFamily: 'serif' })
  })
})
