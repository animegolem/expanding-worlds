import { describe, expect, it } from 'vitest'
import type { Rect } from './camera'
import {
  approachExtent,
  computeContentBounds,
  parseCssRgb,
  ratchetExtent,
  rectsEqual,
  subtractRect,
  voidTone,
  STAGE_CONTENT_PADDING,
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

describe('parseCssRgb / voidTone', () => {
  it('parses #rrggbb and rgb()', () => {
    expect(parseCssRgb('#17191d')).toEqual({ r: 23, g: 25, b: 29 })
    expect(parseCssRgb('rgb(23, 25, 29)')).toEqual({ r: 23, g: 25, b: 29 })
    expect(parseCssRgb('#abc')).toEqual({ r: 170, g: 187, b: 204 })
  })

  it('derives a strictly darker tone from the effective fill', () => {
    const fill = '#40506a'
    const tone = voidTone(fill, 0.5)
    expect(tone).toBe(((0x40 >> 1) << 16) | ((0x50 >> 1) << 8) | (0x6a >> 1))
    // Darker than the source on every channel.
    expect((tone >> 16) & 255).toBeLessThan(0x40)
  })

  it('falls back to black on unparseable input', () => {
    expect(voidTone('not-a-color')).toBe(0)
  })
})
