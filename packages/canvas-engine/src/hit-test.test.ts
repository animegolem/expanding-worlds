import { describe, expect, it } from 'vitest'
import { hitTest, itemWorldAABB, marqueeHits, unionBounds } from './hit-test'
import { makeDecoration, makePlacement } from './test-helpers'

describe('hitTest', () => {
  it('returns the topmost item by render order', () => {
    const below = makePlacement({ x: 0, y: 0, width: 100, height: 100 })
    const above = makePlacement({ x: 10, y: 10, width: 100, height: 100 })
    // Items arrive bottom-first; `above` paints later.
    expect(hitTest({ x: 10, y: 10 }, [below, above])!.id).toBe(above.id)
    expect(hitTest({ x: -45, y: -45 }, [below, above])!.id).toBe(below.id)
    expect(hitTest({ x: 500, y: 500 }, [below, above])).toBeNull()
  })

  it('tests rotated placements in their local frame', () => {
    // 100×20 bar rotated 90°: tall and thin at the center.
    const bar = makePlacement({ x: 0, y: 0, width: 100, height: 20, rotation: Math.PI / 2 })
    expect(hitTest({ x: 0, y: 45 }, [bar])).not.toBeNull()
    expect(hitTest({ x: 45, y: 0 }, [bar])).toBeNull()
  })

  it('respects placement scale', () => {
    const dot = makePlacement({ x: 0, y: 0, width: 20, height: 20, scale: 3 })
    expect(hitTest({ x: 25, y: 0 }, [dot])).not.toBeNull()
    expect(hitTest({ x: 40, y: 0 }, [dot])).toBeNull()
  })

  it('skips locked and hidden decorations', () => {
    const shape = makeDecoration({ data: { x: 0, y: 0, width: 50, height: 50 } })
    expect(hitTest({ x: 25, y: 25 }, [shape])).not.toBeNull()
    expect(hitTest({ x: 25, y: 25 }, [{ ...shape, locked: 1 as const }])).toBeNull()
    expect(hitTest({ x: 25, y: 25 }, [{ ...shape, hidden: 1 as const }])).toBeNull()
  })

  it('bounds line-like decorations by their endpoints', () => {
    const line = makeDecoration({
      kind: 'line',
      data: { x1: 0, y1: 0, x2: 100, y2: 50 },
    })
    expect(itemWorldAABB(line)).toEqual({ x: 0, y: 0, width: 100, height: 50 })
    const freehand = makeDecoration({
      kind: 'freehand',
      data: { points: [[5, 5], [15, 30], [-5, 10]] },
    })
    expect(itemWorldAABB(freehand)).toEqual({ x: -5, y: 5, width: 20, height: 25 })
  })
})

describe('marqueeHits and unionBounds', () => {
  it('collects intersecting hittable items only', () => {
    const inside = makePlacement({ x: 10, y: 10, width: 10, height: 10 })
    const outside = makePlacement({ x: 500, y: 500, width: 10, height: 10 })
    const locked = makeDecoration({
      data: { x: 0, y: 0, width: 20, height: 20 },
      locked: 1,
    })
    const hits = marqueeHits({ x: 0, y: 0, width: 50, height: 50 }, [inside, outside, locked])
    expect(hits.map((h) => h.id)).toEqual([inside.id])
  })

  it('unions bounds across kinds', () => {
    const p = makePlacement({ x: 0, y: 0, width: 20, height: 20 })
    const d = makeDecoration({ data: { x: 100, y: 100, width: 10, height: 10 } })
    expect(unionBounds([p, d])).toEqual({ x: -10, y: -10, width: 120, height: 120 })
  })

  it('expands the AABB of a rotated placement', () => {
    const bar = makePlacement({ x: 0, y: 0, width: 100, height: 20, rotation: Math.PI / 2 })
    const aabb = itemWorldAABB(bar)!
    expect(aabb.width).toBeCloseTo(20)
    expect(aabb.height).toBeCloseTo(100)
  })
})
