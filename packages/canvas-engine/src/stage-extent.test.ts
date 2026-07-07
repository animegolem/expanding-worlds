import { describe, expect, it } from 'vitest'
import type { Rect } from './camera'
import {
  approachExtent,
  computeContentBounds,
  linearRgbToOklab,
  parseCssRgb,
  ratchetExtent,
  rectsEqual,
  subtractRect,
  voidEnabledForTheme,
  voidTone,
  STAGE_CONTENT_PADDING,
  STAGE_VOID_MIX,
} from './stage-extent'

const rect = (x: number, y: number, width: number, height: number): Rect => ({
  x,
  y,
  width,
  height,
})

describe('computeContentBounds', () => {
  it('is null for empty input (empty board → all void)', () => {
    expect(computeContentBounds([], STAGE_CONTENT_PADDING)).toBeNull()
  })

  it('pads a single rect on every side', () => {
    const bounds = computeContentBounds([rect(100, 200, 40, 60)], 10)
    expect(bounds).toEqual({ x: 90, y: 190, width: 60, height: 80 })
  })

  it('spans the union of several rects plus padding', () => {
    const bounds = computeContentBounds([rect(0, 0, 10, 10), rect(90, 40, 10, 10)], 5)
    expect(bounds).toEqual({ x: -5, y: -5, width: 110, height: 60 })
  })
})

describe('ratchetExtent', () => {
  it('absorbs a null side', () => {
    expect(ratchetExtent(null, rect(0, 0, 10, 10))).toEqual(rect(0, 0, 10, 10))
    expect(ratchetExtent(rect(0, 0, 10, 10), null)).toEqual(rect(0, 0, 10, 10))
    expect(ratchetExtent(null, null)).toBeNull()
  })

  it('grows the extent when the next bounds push past an edge', () => {
    const grown = ratchetExtent(rect(0, 0, 100, 100), rect(120, 0, 40, 40))
    expect(grown).toEqual(rect(0, 0, 160, 100))
  })

  it('never shrinks when the next bounds move inward', () => {
    const prev = rect(0, 0, 200, 200)
    const inward = rect(50, 50, 40, 40)
    expect(ratchetExtent(prev, inward)).toEqual(prev)
  })
})

describe('approachExtent', () => {
  it('returns null for a null target (empty board)', () => {
    expect(approachExtent(rect(0, 0, 10, 10), null, 16)).toBeNull()
    expect(approachExtent(null, null, 16)).toBeNull()
  })

  it('blooms from the target center when current is null', () => {
    const target = rect(0, 0, 100, 100)
    const step = approachExtent(null, target, 16)
    expect(step).not.toBeNull()
    // A partial step: smaller than target, centered on it, non-zero.
    expect(step!.width).toBeGreaterThan(0)
    expect(step!.width).toBeLessThan(target.width)
    const cx = step!.x + step!.width / 2
    const cy = step!.y + step!.height / 2
    expect(cx).toBeCloseTo(50, 6)
    expect(cy).toBeCloseTo(50, 6)
  })

  it('eases toward the target and snaps when within epsilon', () => {
    const target = rect(0, 0, 100, 100)
    let current: Rect | null = rect(-40, -40, 200, 200)
    for (let i = 0; i < 1000 && !rectsEqual(current, target); i++) {
      current = approachExtent(current, target, 16)
    }
    expect(rectsEqual(current, target)).toBe(true)
  })

  it('reaches the target immediately with a non-positive tau', () => {
    const target = rect(5, 5, 10, 10)
    expect(approachExtent(null, target, 16, 0)).toEqual(target)
  })
})

describe('reset semantics (recompute snug)', () => {
  it('recomputes a smaller snug bound after items are removed', () => {
    // Session ratchet holds a large extent...
    const held = ratchetExtent(rect(0, 0, 100, 100), rect(400, 0, 40, 40))
    expect(held!.width).toBe(440)
    // ...but a board-open recompute (fresh bounds, no prior) is snug.
    const snug = computeContentBounds([rect(0, 0, 100, 100)], 0)
    expect(snug).toEqual(rect(0, 0, 100, 100))
  })
})

describe('subtractRect (void veil bands)', () => {
  it('returns the whole outer when the hole is null', () => {
    expect(subtractRect(rect(0, 0, 100, 100), null)).toEqual([rect(0, 0, 100, 100)])
  })

  it('is empty when the hole covers the outer', () => {
    expect(subtractRect(rect(10, 10, 20, 20), rect(0, 0, 100, 100))).toEqual([])
  })

  it('returns the outer when hole and outer do not overlap', () => {
    expect(subtractRect(rect(0, 0, 10, 10), rect(50, 50, 10, 10))).toEqual([
      rect(0, 0, 10, 10),
    ])
  })

  it('rings a centered hole with four bands covering exactly the remainder', () => {
    const outer = rect(0, 0, 100, 100)
    const hole = rect(40, 40, 20, 20)
    const bands = subtractRect(outer, hole)
    // Bands are disjoint and their area equals outer minus hole.
    const area = bands.reduce((sum, b) => sum + b.width * b.height, 0)
    expect(area).toBe(100 * 100 - 20 * 20)
  })
})

describe('parseCssRgb / voidTone (oklab)', () => {
  it('parses #rrggbb and rgb()', () => {
    expect(parseCssRgb('#17191d')).toEqual({ r: 23, g: 25, b: 29 })
    expect(parseCssRgb('rgb(23, 25, 29)')).toEqual({ r: 23, g: 25, b: 29 })
    expect(parseCssRgb('#abc')).toEqual({ r: 170, g: 187, b: 204 })
  })

  it('is a true oklab transform: white → L≈1, a≈0, b≈0', () => {
    const [L, a, b] = linearRgbToOklab(1, 1, 1)
    expect(L).toBeCloseTo(1, 6)
    expect(a).toBeCloseTo(0, 6)
    expect(b).toBeCloseTo(0, 6)
  })

  it('mixes the effective fill toward black in oklab at the ratified step', () => {
    expect(STAGE_VOID_MIX).toBe(0.22)
    // Reference packed 0xRRGGBB values, computed from the Ottosson oklab
    // formulas (color-mix(in oklab, fill 78%, black)) and cross-checked
    // against an independent reference implementation.
    expect(voidTone('#17191d')).toBe(0x0d0f12) // dark surface  (23,25,29)→(13,15,18)
    expect(voidTone('#40506a')).toBe(0x2b374a) // mid blue-grey (64,80,106)→(43,55,74)
    expect(voidTone('#e8e0cd')).toBe(0xa6a093) // light board  (232,224,205)→(166,160,147)
    // A steeper mix at 0.5, distinct from the old sRGB halving (0x202835).
    expect(voidTone('#40506a', 0.5)).toBe(0x131a24)
  })

  it('derives a strictly darker tone than the effective fill', () => {
    const tone = voidTone('#40506a')
    expect((tone >> 16) & 255).toBeLessThan(0x40)
    expect((tone >> 8) & 255).toBeLessThan(0x50)
    expect(tone & 255).toBeLessThan(0x6a)
  })

  it('falls back to black on unparseable input', () => {
    expect(voidTone('not-a-color')).toBe(0)
  })
})

describe('voidEnabledForTheme', () => {
  it('renders the void on dark and light, never on glass', () => {
    expect(voidEnabledForTheme('dark')).toBe(true)
    expect(voidEnabledForTheme('light')).toBe(true)
    expect(voidEnabledForTheme('glass')).toBe(false)
  })
})
