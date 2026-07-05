import { describe, expect, it } from 'vitest'
import { hitTest, itemWorldAABB, marqueeHits, orientedCorners, unionBounds } from './hit-test'
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

describe('visual bounds include stroke extents (AI-IMP-029)', () => {
  it('inflates shape bounds by half the stroke width', () => {
    const shape = makeDecoration({
      data: { shape: 'rect', x: 10, y: 10, width: 50, height: 30, stroke: '#fff', strokeWidth: 8 },
    })
    expect(itemWorldAABB(shape)).toEqual({ x: 6, y: 6, width: 58, height: 38 })
  })

  it('inflates round-capped lines by half the stroke width', () => {
    const line = makeDecoration({
      kind: 'line',
      data: { x1: 0, y1: 0, x2: 100, y2: 0, stroke: '#fff', strokeWidth: 10 },
    })
    expect(itemWorldAABB(line)).toEqual({ x: -5, y: -5, width: 110, height: 10 })
  })

  it('arrow bounds follow the block silhouette: barbs included, tip exact', () => {
    const arrow = makeDecoration({
      kind: 'arrow',
      data: { x1: 0, y1: 0, x2: 100, y2: 0, stroke: '#fff', strokeWidth: 12 },
    })
    // Head half-width = 1.5 × 12 = 18; the filled silhouette spans the
    // segment exactly along the axis (flat tail, tip at x2).
    expect(itemWorldAABB(arrow)).toEqual({ x: 0, y: -18, width: 100, height: 36 })
  })

  it('data without strokeWidth keeps raw geometry bounds', () => {
    const shape = makeDecoration({ data: { x: 0, y: 0, width: 50, height: 50 } })
    expect(itemWorldAABB(shape)).toEqual({ x: 0, y: 0, width: 50, height: 50 })
  })
})

describe('text bounds (AI-IMP-030)', () => {
  it('uses measured extents when present', () => {
    const text = makeDecoration({
      kind: 'text',
      data: {
        x: 100,
        y: 50,
        text: 'harbor',
        fontSize: 16,
        color: '#fff',
        measuredWidth: 90,
        measuredHeight: 19,
      },
    })
    expect(itemWorldAABB(text)).toEqual({ x: 100, y: 50, width: 90, height: 19 })
    expect(hitTest({ x: 145, y: 60 }, [text])?.id).toBe(text.id)
  })

  it('estimates from font metrics for legacy rows (still selectable)', () => {
    const text = makeDecoration({
      kind: 'text',
      data: { x: 0, y: 0, text: 'two\nlines here', fontSize: 20, color: '#fff' },
    })
    const aabb = itemWorldAABB(text)!
    expect(aabb.width).toBeGreaterThan(20)
    expect(aabb.height).toBeCloseTo(2 * 20 * 1.2)
    expect(hitTest({ x: aabb.width / 2, y: 20 }, [text])?.id).toBe(text.id)
  })
})

describe('rotated shape bounds and oriented corners (AI-IMP-031)', () => {
  it('rotated shapes expand their AABB like rotated placements', () => {
    const shape = makeDecoration({
      kind: 'shape',
      data: {
        shape: 'rect',
        x: 0,
        y: 0,
        width: 100,
        height: 40,
        rotation: Math.PI / 2,
        stroke: '#fff',
        strokeWidth: 2,
      },
    })
    // Outer box 102×42 at 90° about center (50, 20) → 42×102 AABB.
    const aabb = itemWorldAABB(shape)!
    expect(aabb.x).toBeCloseTo(29)
    expect(aabb.y).toBeCloseTo(-31)
    expect(aabb.width).toBeCloseTo(42)
    expect(aabb.height).toBeCloseTo(102)
  })

  it('orientedCorners rotates the placement body about its center', () => {
    const item = makePlacement({ x: 0, y: 0, width: 100, height: 40, rotation: Math.PI / 2 })
    const corners = orientedCorners(item)!
    // Local nw (−50, −20) → world (20, −50) under a 90° turn.
    expect(corners[0].x).toBeCloseTo(20)
    expect(corners[0].y).toBeCloseTo(-50)
    expect(corners[2].x).toBeCloseTo(-20)
    expect(corners[2].y).toBeCloseTo(50)
  })

  it('orientedCorners includes shape stroke and is null for lines', () => {
    const shape = makeDecoration({
      kind: 'shape',
      data: {
        shape: 'rect',
        x: 10,
        y: 10,
        width: 20,
        height: 20,
        stroke: '#fff',
        strokeWidth: 4,
      },
    })
    const corners = orientedCorners(shape)!
    expect(corners[0].x).toBeCloseTo(8) // 10 − strokeWidth/2
    const line = makeDecoration({
      kind: 'line',
      data: { x1: 0, y1: 0, x2: 10, y2: 10, stroke: '#fff', strokeWidth: 2 },
    })
    expect(orientedCorners(line)).toBeNull()
  })
})
