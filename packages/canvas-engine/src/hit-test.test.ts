import { describe, expect, it } from 'vitest'
import {
  adornedWorldAABB,
  classifyCursorZone,
  hitTest,
  itemWorldAABB,
  marqueeHits,
  orientedCorners,
  unionBounds,
} from './hit-test'
import { LABEL_CLEARANCE_PX, LABEL_HEIGHT_RATIO, LABEL_TEXT_HEIGHT_RATIO } from './renderers/placement'
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

describe('adornedWorldAABB — charm-bar bounds (AI-IMP-161)', () => {
  const ZOOM = 1

  it('is byte-identical to itemWorldAABB when no label shows', () => {
    // Label hidden, no note, and a §4.6 card whose chrome carries the
    // title all fall back to the raw body AABB (the tighter unlabeled
    // anchor the owner chose).
    const hidden = makePlacement({ width: 100, height: 60, noteTitle: 'Harbor', labelVisible: 0 })
    const noNote = makePlacement({ width: 100, height: 60, noteTitle: null })
    const card = makePlacement({
      width: 100,
      height: 60,
      noteTitle: 'Harbor',
      labelVisible: 1,
      appearanceKind: 'card',
    })
    for (const item of [hidden, noNote, card]) {
      expect(adornedWorldAABB(item, ZOOM)).toEqual(itemWorldAABB(item))
    }
  })

  it('extends downward by clearance + world-scaled glyph when a label shows', () => {
    const item = makePlacement({
      x: 0,
      y: 0,
      width: 100,
      height: 60,
      noteTitle: 'Harbor',
      labelVisible: 1,
    })
    const base = itemWorldAABB(item)!
    const adorned = adornedWorldAABB(item, ZOOM)!
    // x/width/top are untouched — only the bottom grows.
    expect(adorned.x).toBe(base.x)
    expect(adorned.width).toBe(base.width)
    expect(adorned.y).toBe(base.y)
    const glyph = 60 * LABEL_HEIGHT_RATIO * LABEL_TEXT_HEIGHT_RATIO
    const expectedBottom = 30 + LABEL_CLEARANCE_PX / ZOOM + glyph
    expect(adorned.y + adorned.height).toBeCloseTo(expectedBottom)
    expect(adorned.height).toBeGreaterThan(base.height)
  })

  it('scales the label reach with placement scale (world units)', () => {
    const item = makePlacement({
      x: 0,
      y: 0,
      width: 100,
      height: 60,
      scale: 2,
      noteTitle: 'Harbor',
      labelVisible: 1,
    })
    const basis = 60 * 2
    const glyph = basis * LABEL_HEIGHT_RATIO * LABEL_TEXT_HEIGHT_RATIO
    const expectedBottom = basis / 2 + LABEL_CLEARANCE_PX / ZOOM + glyph
    expect(adornedWorldAABB(item, ZOOM)!.y + adornedWorldAABB(item, ZOOM)!.height).toBeCloseTo(
      expectedBottom,
    )
  })

  it('shrinks the screen-space clearance in world units as zoom rises', () => {
    const item = makePlacement({ x: 0, y: 0, width: 100, height: 60, noteTitle: 'Harbor' })
    const near = adornedWorldAABB(item, 4)!
    const far = adornedWorldAABB(item, 1)!
    // Same glyph reach; only the fixed screen clearance differs (÷zoom).
    expect(far.height - near.height).toBeCloseTo(LABEL_CLEARANCE_PX / 1 - LABEL_CLEARANCE_PX / 4)
  })

  it('does not extend below a y-flipped placement (label sits above)', () => {
    const item = makePlacement({
      width: 100,
      height: 60,
      noteTitle: 'Harbor',
      labelVisible: 1,
      flipY: 1,
    })
    expect(adornedWorldAABB(item, ZOOM)).toEqual(itemWorldAABB(item))
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

describe('classifyCursorZone (§6.9 rev 0.17, AI-IMP-062)', () => {
  // 100×60 body centered at the origin: corners at (±50, ±30).
  const bounds = { x: -50, y: -30, width: 100, height: 60 }
  const zone = (x: number, y: number, rotation = 0, scale = 1) =>
    classifyCursorZone({ x, y }, bounds, rotation, scale)

  it('classifies the interior as move', () => {
    expect(zone(0, 0)).toBe('move')
    expect(zone(-40, 20)).toBe('move')
  })

  it('classifies every edge band, inside and outside the edge line', () => {
    expect(zone(0, -30)).toBe('resize-n')
    expect(zone(0, -33)).toBe('resize-n') // outside half of the band
    expect(zone(0, -27)).toBe('resize-n') // inside half of the band
    expect(zone(0, 30)).toBe('resize-s')
    expect(zone(-50, 0)).toBe('resize-w')
    expect(zone(50, 0)).toBe('resize-e')
    expect(zone(53, 0)).toBe('resize-e')
  })

  it('classifies every corner as diagonal resize', () => {
    expect(zone(-50, -30)).toBe('resize-nw')
    expect(zone(50, -30)).toBe('resize-ne')
    expect(zone(50, 30)).toBe('resize-se')
    expect(zone(-50, 30)).toBe('resize-sw')
  })

  it('classifies the band outside each corner as rotate', () => {
    // 10 px diagonally outside each corner (√50 ≈ 7.07 per axis).
    expect(zone(-57, -37)).toBe('rotate-nw')
    expect(zone(57, -37)).toBe('rotate-ne')
    expect(zone(57, 37)).toBe('rotate-se')
    expect(zone(-57, 37)).toBe('rotate-sw')
    // Straight out along one axis also rotates while near the corner.
    expect(zone(50, -40)).toBe('rotate-ne')
  })

  it('cuts the rotate band off at its outer radius', () => {
    // 24 px out is the last rotate ring (widened from 14, owner feel
    // pass, AI-IMP-031); 25+ px falls to the canvas.
    expect(zone(50 + 24, 30)).toBe('rotate-se')
    expect(zone(50 + 25, 30)).toBe('none')
    expect(zone(50 + 18, 30 + 18)).toBe('none') // √648 ≈ 25.5
  })

  it('leaves edge midpoints beyond the band as none', () => {
    expect(zone(0, -40)).toBe('none') // 10 px above the top edge, far from corners
    expect(zone(200, 200)).toBe('none')
  })

  it('classifies in the item local frame when rotated', () => {
    // 90° turn: the local n edge faces world +x (east side on screen).
    const quarter = Math.PI / 2
    expect(zone(32, 0, quarter)).toBe('resize-n') // world (32,0) → local (0,−32)
    expect(zone(-32, 0, quarter)).toBe('resize-s')
    expect(zone(0, 52, quarter)).toBe('resize-e') // world (0,52) → local (52,0)
    expect(zone(0, 0, quarter)).toBe('move')
    // Local ne corner (50,−30) lands at world (30,50); 10 px out rotates.
    expect(zone(37, 57, quarter)).toBe('rotate-ne')
  })

  it('keeps zone widths screen-constant across zoom (invariance)', () => {
    // 3 world px above the top edge: inside the ±4 px band at zoom 1,
    // 6 screen px (outside) at zoom 2, well inside at zoom 0.5.
    expect(zone(0, -33, 0, 1)).toBe('resize-n')
    expect(zone(0, -33, 0, 2)).toBe('none')
    expect(zone(0, -33, 0, 0.5)).toBe('resize-n')
    // Rotate band: ~14 world px outside the corner reads ~28 screen
    // px at zoom 2 (past the 24 px cutoff) but still rotates at 1
    // and at zoom 0.5 (where 19.8 world px is ~10 screen px).
    expect(zone(60, 40, 0, 1)).toBe('rotate-se')
    expect(zone(60, 40, 0, 2)).toBe('none')
    expect(zone(64, 44, 0, 0.5)).toBe('rotate-se')
  })

  it('clamps the inward inset so tiny items keep a move zone', () => {
    const tiny = { x: -3, y: -3, width: 6, height: 6 }
    expect(classifyCursorZone({ x: 0, y: 0 }, tiny, 0, 1)).toBe('move')
    expect(classifyCursorZone({ x: 3, y: 3 }, tiny, 0, 1)).toBe('resize-se')
  })
})
