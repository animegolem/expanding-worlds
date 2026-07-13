import { describe, expect, it } from 'vitest'
import { alignPayload, arrangePayload, distributePayload, normalizeSelection } from './arrange'
import { itemWorldAABB, placementSize } from './hit-test'
import { makeDecoration, makePlacement } from './test-helpers'
import type { TransformContentPayload } from '@ew/commands'
import type { SceneItem } from './types'

/** Applies a payload the way the TransformContent handler would. */
function apply(items: readonly SceneItem[], payload: TransformContentPayload | null): SceneItem[] {
  if (!payload) return [...items]
  return items.map((item) => {
    const change = payload.items.find((entry) =>
      entry.kind === 'placement' ? entry.placementId === item.id : entry.decorationId === item.id,
    )
    if (!change) return item
    if (change.kind === 'placement' && item.itemKind === 'placement') {
      const { kind, placementId, ...transform } = change
      void kind
      void placementId
      return { ...item, ...transform }
    }
    if (change.kind === 'decoration' && item.itemKind === 'decoration') {
      return { ...item, data: change.data }
    }
    throw new Error(`kind mismatch for ${item.id}`)
  })
}

describe('alignPayload', () => {
  it('aligns lefts of a mixed selection in one payload, skipping the anchor item', () => {
    const items: SceneItem[] = [
      makePlacement({ x: 60, y: 50, width: 40, height: 40 }), // AABB 40..80
      makePlacement({ x: 200, y: 120, width: 60, height: 40 }), // AABB 170..230
      makeDecoration({ kind: 'line', data: { x1: 90, y1: 10, x2: 150, y2: 40 } }), // AABB 90..150
    ]
    const payload = alignPayload('c1', items, 'left')!
    expect(payload.canvasId).toBe('c1')
    // The leftmost item already sits at the target: only two move.
    expect(payload.items).toHaveLength(2)
    const next = apply(items, payload)
    for (const item of next) expect(itemWorldAABB(item)!.x).toBeCloseTo(40, 9)
    // The decoration translated inside its data, preserving its shape.
    const line = next[2]! as { data: Record<string, unknown> }
    expect(line.data).toEqual({ x1: 40, y1: 10, x2: 100, y2: 40 })
  })

  it('is idempotent: aligning the aligned selection yields null', () => {
    const items: SceneItem[] = [
      makePlacement({ x: 100, y: 100, width: 40, height: 40 }),
      makePlacement({ x: 250, y: 260, width: 80, height: 40 }),
      makePlacement({ x: 400, y: 420, width: 24, height: 24 }),
    ]
    for (const op of ['left', 'hcenter', 'right', 'top', 'vmiddle', 'bottom'] as const) {
      const next = apply(items, alignPayload('c1', items, op))
      expect(alignPayload('c1', next, op)).toBeNull()
    }
  })

  it('uses the rotation-expanded AABB for rotated placements', () => {
    const rotated = makePlacement({ x: 200, y: 100, width: 40, height: 40, rotation: Math.PI / 4 })
    const straight = makePlacement({ x: 50, y: 100, width: 40, height: 40 })
    const payload = alignPayload('c1', [straight, rotated], 'left')!
    const next = apply([straight, rotated], payload)
    // 40×40 at 45° spans 40√2; both AABB lefts land on the union left (30).
    expect(itemWorldAABB(next[1]!)!.x).toBeCloseTo(30, 9)
    const movedRotated = next[1]! as { x: number }
    expect(movedRotated.x).toBeCloseTo(30 + (40 * Math.SQRT2) / 2, 9)
  })

  it('aligns vertically (top / vmiddle / bottom act on y only)', () => {
    const items: SceneItem[] = [
      makePlacement({ x: 100, y: 100, width: 40, height: 40 }),
      makePlacement({ x: 300, y: 260, width: 40, height: 60 }),
    ]
    const payload = alignPayload('c1', items, 'bottom')!
    const next = apply(items, payload)
    const bottoms = next.map((item) => {
      const aabb = itemWorldAABB(item)!
      return aabb.y + aabb.height
    })
    expect(bottoms[0]).toBeCloseTo(bottoms[1]!, 9)
    // x untouched by a vertical align.
    expect((next[0]! as { x: number }).x).toBe(100)
  })

  it('vertical-middle aligns five horizontal-spread nodes without collapsing their x spread', () => {
    const items: SceneItem[] = [
      makePlacement({ x: 40, y: 80, width: 30, height: 20 }),
      makePlacement({ x: 130, y: 180, width: 50, height: 60 }),
      makePlacement({ x: 260, y: 40, width: 80, height: 35 }),
      makePlacement({ x: 410, y: 250, width: 24, height: 90 }),
      makePlacement({ x: 560, y: 130, width: 70, height: 45 }),
    ]
    const beforeX = items.map((item) => (item as { x: number }).x)
    const next = apply(items, alignPayload('c1', items, 'vmiddle'))
    expect(next.map((item) => (item as { x: number }).x)).toEqual(beforeX)
    const centersY = next.map((item) => {
      const box = itemWorldAABB(item)!
      return box.y + box.height / 2
    })
    for (const center of centersY) expect(center).toBeCloseTo(centersY[0]!, 9)
  })

  it('returns null below two items', () => {
    expect(alignPayload('c1', [makePlacement()], 'left')).toBeNull()
    expect(alignPayload('c1', [], 'left')).toBeNull()
  })
})

describe('distributePayload', () => {
  it('equalizes horizontal gaps keeping the extremes fixed', () => {
    const items: SceneItem[] = [
      makePlacement({ x: 20, y: 100, width: 40, height: 40 }), // 0..40
      makePlacement({ x: 70, y: 200, width: 20, height: 40 }), // 60..80
      makePlacement({ x: 300, y: 300, width: 40, height: 40 }), // 280..320
    ]
    const payload = distributePayload('c1', items, 'horizontal')!
    // Extremes stay: only the middle item moves.
    expect(payload.items).toHaveLength(1)
    const next = apply(items, payload)
    const boxes = next
      .map((item) => itemWorldAABB(item)!)
      .sort((a, b) => a.x - b.x)
    const gap1 = boxes[1]!.x - (boxes[0]!.x + boxes[0]!.width)
    const gap2 = boxes[2]!.x - (boxes[1]!.x + boxes[1]!.width)
    expect(gap1).toBeCloseTo(gap2, 9)
    expect(boxes[0]!.x).toBe(0)
    expect(boxes[2]!.x + boxes[2]!.width).toBe(320)
    // y untouched by a horizontal distribute.
    expect((next[1]! as { y: number }).y).toBe(200)
  })

  it('distributes vertically over mixed kinds', () => {
    const items: SceneItem[] = [
      makePlacement({ x: 100, y: 20, width: 40, height: 40 }), // y 0..40
      makeDecoration({ kind: 'line', data: { x1: 0, y1: 55, x2: 40, y2: 75 } }), // y 55..75
      makePlacement({ x: 100, y: 280, width: 40, height: 40 }), // y 260..300
    ]
    const payload = distributePayload('c1', items, 'vertical')!
    const next = apply(items, payload)
    const boxes = next.map((item) => itemWorldAABB(item)!).sort((a, b) => a.y - b.y)
    const gap1 = boxes[1]!.y - (boxes[0]!.y + boxes[0]!.height)
    const gap2 = boxes[2]!.y - (boxes[1]!.y + boxes[1]!.height)
    expect(gap1).toBeCloseTo(gap2, 9)
  })

  it('is a no-op for two items and below the three-item gate', () => {
    const two: SceneItem[] = [
      makePlacement({ x: 20, y: 100, width: 40, height: 40 }),
      makePlacement({ x: 300, y: 100, width: 40, height: 40 }),
    ]
    expect(distributePayload('c1', two, 'horizontal')).toBeNull()
  })

  it('is idempotent: distributing the distributed selection yields null', () => {
    const items: SceneItem[] = [
      makePlacement({ x: 20, y: 100, width: 40, height: 40 }),
      makePlacement({ x: 61, y: 200, width: 30, height: 40 }),
      makePlacement({ x: 143, y: 300, width: 26, height: 40 }),
      makePlacement({ x: 300, y: 400, width: 40, height: 40 }),
    ]
    const next = apply(items, distributePayload('c1', items, 'horizontal'))
    expect(distributePayload('c1', next, 'horizontal')).toBeNull()
  })
})

/** Every placement's world center; sorted by id for stable comparison. */
function centers(items: readonly SceneItem[]): Array<{ id: string; x: number; y: number }> {
  return items
    .filter((item) => item.itemKind === 'placement')
    .map((item) => ({ id: item.id, x: (item as { x: number }).x, y: (item as { y: number }).y }))
}

function overlaps(a: SceneItem, b: SceneItem): boolean {
  const ra = itemWorldAABB(a)!
  const rb = itemWorldAABB(b)!
  const gx = Math.max(ra.x, rb.x) < Math.min(ra.x + ra.width, rb.x + rb.width)
  const gy = Math.max(ra.y, rb.y) < Math.min(ra.y + ra.height, rb.y + rb.height)
  return gx && gy
}

describe('arrangePayload', () => {
  // Four 100×100 tiles: gap = 8, so the √(padded area) row width settles
  // them into a 2×2 grid whose top-left slot lands on the union top-left.
  const scattered = (): SceneItem[] => [
    makePlacement({ id: 'A', renderOrder: 4, x: 500, y: 500, width: 100, height: 100 }),
    makePlacement({ id: 'B', renderOrder: 1, x: 0, y: 0, width: 100, height: 100 }),
    makePlacement({ id: 'C', renderOrder: 3, x: 900, y: 100, width: 100, height: 100 }),
    makePlacement({ id: 'D', renderOrder: 2, x: 200, y: 700, width: 100, height: 100 }),
  ]

  it('packs by import date (renderOrder) into a compact non-overlapping grid', () => {
    const items = scattered()
    const next = apply(items, arrangePayload('c1', items, 'importDate'))
    // Union top-left of the scatter is (-50, -50); the grid anchors there
    // so slot centers are (0,0) (108,0) (0,108) (108,108) in date order.
    const byId = new Map(centers(next).map((c) => [c.id, c]))
    expect(byId.get('B')).toMatchObject({ x: 0, y: 0 }) // renderOrder 1
    expect(byId.get('D')).toMatchObject({ x: 108, y: 0 }) // 2
    expect(byId.get('C')).toMatchObject({ x: 0, y: 108 }) // 3
    expect(byId.get('A')).toMatchObject({ x: 108, y: 108 }) // 4
    // No two tiles overlap after packing.
    for (let i = 0; i < next.length; i += 1)
      for (let j = i + 1; j < next.length; j += 1)
        expect(overlaps(next[i]!, next[j]!)).toBe(false)
  })

  it('orders by name (title), then by area descending', () => {
    const named: SceneItem[] = [
      makePlacement({ id: 'a', x: 0, y: 0, width: 100, height: 100, noteTitle: 'Zephyr' }),
      makePlacement({ id: 'b', x: 300, y: 0, width: 100, height: 100, noteTitle: 'Apple' }),
      makePlacement({ id: 'c', x: 600, y: 0, width: 100, height: 100, noteTitle: 'Mango' }),
      makePlacement({ id: 'd', x: 900, y: 0, width: 100, height: 100, noteTitle: 'apricot' }),
    ]
    const byName = new Map(centers(apply(named, arrangePayload('c1', named, 'name'))).map((c) => [c.id, c]))
    // Apple < apricot < Mango < Zephyr (case-insensitive) → grid slots.
    expect(byName.get('b')).toMatchObject({ x: 0, y: 0 })
    expect(byName.get('d')).toMatchObject({ x: 108, y: 0 })
    expect(byName.get('c')).toMatchObject({ x: 0, y: 108 })
    expect(byName.get('a')).toMatchObject({ x: 108, y: 108 })

    const sizes: SceneItem[] = [
      makePlacement({ id: 'small', x: 0, y: 0, width: 40, height: 40 }),
      makePlacement({ id: 'big', x: 400, y: 0, width: 200, height: 200 }),
      makePlacement({ id: 'mid', x: 800, y: 0, width: 100, height: 100 }),
    ]
    const areaOrder = arrangePayload('c1', sizes, 'area')!
    // First slot (union top-left) is the largest by area.
    const bigAabb = itemWorldAABB(apply(sizes, areaOrder).find((i) => i.id === 'big')!)!
    const originX = Math.min(...sizes.map((i) => itemWorldAABB(i)!.x))
    const originY = Math.min(...sizes.map((i) => itemWorldAABB(i)!.y))
    expect(bigAabb.x).toBeCloseTo(originX, 6)
    expect(bigAabb.y).toBeCloseTo(originY, 6)
  })

  it('keeps default reading order (row-major over the current layout)', () => {
    const items: SceneItem[] = [
      makePlacement({ id: 'tl', x: 0, y: 0, width: 100, height: 100 }),
      makePlacement({ id: 'tr', x: 300, y: 0, width: 100, height: 100 }),
      makePlacement({ id: 'bl', x: 0, y: 400, width: 100, height: 100 }),
    ]
    const next = apply(items, arrangePayload('c1', items, 'default'))
    const byId = new Map(centers(next).map((c) => [c.id, c]))
    // Reading order tl, tr, bl → first row then wrap.
    expect(byId.get('tl')!.y).toBeLessThanOrEqual(byId.get('bl')!.y)
    expect(byId.get('tl')!.x).toBeLessThan(byId.get('tr')!.x)
  })

  it('translates decorations alongside placements', () => {
    const items: SceneItem[] = [
      makePlacement({ id: 'p', x: 0, y: 0, width: 100, height: 100 }),
      makeDecoration({ id: 'd', kind: 'line', data: { x1: 400, y1: 400, x2: 460, y2: 440 } }),
    ]
    const payload = arrangePayload('c1', items, 'default')!
    // The decoration reflows into the block (the placement already sits
    // at the union top-left, so only the decoration actually moves).
    const touched = payload.items.map((i) => (i.kind === 'placement' ? i.placementId : i.decorationId))
    expect(touched).toContain('d')
    const next = apply(items, payload)
    expect(overlaps(next[0]!, next[1]!)).toBe(false)
  })

  it('is idempotent and a single-item no-op', () => {
    const items = scattered()
    const packed = apply(items, arrangePayload('c1', items, 'importDate'))
    expect(arrangePayload('c1', packed, 'importDate')).toBeNull()
    expect(arrangePayload('c1', [makePlacement({ width: 100, height: 100 })], 'default')).toBeNull()
  })

  it('honors an explicit origin and row width (frame-scoped, AI-IMP-129)', () => {
    const items: SceneItem[] = [
      makePlacement({ id: 'x', x: 0, y: 0, width: 100, height: 100 }),
      makePlacement({ id: 'y', x: 300, y: 0, width: 100, height: 100 }),
    ]
    const next = apply(
      items,
      arrangePayload('c1', items, 'default', { origin: { x: 1000, y: 2000 }, rowWidth: 500, gap: 10 }),
    )
    const byId = new Map(centers(next).map((c) => [c.id, c]))
    // Both fit one 500-wide row anchored at the given origin (AABB
    // top-left 1000,2000 → center +50; second tile +110 in x).
    expect(byId.get('x')).toMatchObject({ x: 1050, y: 2050 })
    expect(byId.get('y')).toMatchObject({ x: 1160, y: 2050 })
  })
})

describe('normalizeSelection', () => {
  it('equalizes height to the median with aspect preserved and center fixed', () => {
    const items: SceneItem[] = [
      makePlacement({ id: 'tall', x: 10, y: 20, width: 100, height: 200 }), // aspect 1:2
      makePlacement({ id: 'wide', x: 50, y: 60, width: 200, height: 100 }), // aspect 2:1
      makePlacement({ id: 'sq', x: 90, y: 90, width: 100, height: 100 }),
    ]
    // heights [200,100,100] → median 100.
    const next = apply(items, normalizeSelection('c1', items, 'height'))
    for (const item of next) expect(placementSize(item as never).height).toBeCloseTo(100, 6)
    const tall = next.find((i) => i.id === 'tall')!
    expect(placementSize(tall as never)).toMatchObject({ width: 50, height: 100 }) // 1:2 kept
    // Centers never move.
    expect(tall).toMatchObject({ x: 10, y: 20 })
  })

  it('equalizes width, longest-edge size, and area each about the median', () => {
    const mk = (): SceneItem[] => [
      makePlacement({ id: 'p1', x: 0, y: 0, width: 100, height: 100 }),
      makePlacement({ id: 'p2', x: 0, y: 0, width: 200, height: 200 }),
      makePlacement({ id: 'p3', x: 0, y: 0, width: 400, height: 100 }),
    ]
    // width: widths [100,200,400] median 200.
    for (const item of apply(mk(), normalizeSelection('c1', mk(), 'width')))
      expect(placementSize(item as never).width).toBeCloseTo(200, 6)
    // size: longest edges [100,200,400] median 200.
    for (const item of apply(mk(), normalizeSelection('c1', mk(), 'size')))
      expect(Math.max(placementSize(item as never).width, placementSize(item as never).height)).toBeCloseTo(200, 6)
    // area: areas [10000,40000,40000] median 40000.
    for (const item of apply(mk(), normalizeSelection('c1', mk(), 'area')))
      expect(placementSize(item as never).width * placementSize(item as never).height).toBeCloseTo(40000, 3)
  })

  it('uses the median so one outlier does not explode the rest', () => {
    const items: SceneItem[] = [
      makePlacement({ id: 'a', width: 100, height: 100 }),
      makePlacement({ id: 'b', width: 100, height: 100 }),
      makePlacement({ id: 'c', width: 100, height: 100 }),
      makePlacement({ id: 'd', width: 100, height: 100 }),
      makePlacement({ id: 'huge', width: 5000, height: 5000 }),
    ]
    const payload = normalizeSelection('c1', items, 'height')!
    // Median height is 100 → the four normal tiles are untouched; only
    // the outlier is rescaled down into the payload.
    expect(payload.items).toHaveLength(1)
    expect(payload.items[0]).toMatchObject({ kind: 'placement', placementId: 'huge' })
  })

  it('excludes locked placements and ignores decorations', () => {
    const items: SceneItem[] = [
      makePlacement({ id: 'a', width: 100, height: 100 }),
      makePlacement({ id: 'b', width: 300, height: 300 }),
      makePlacement({ id: 'locked', width: 900, height: 900, locked: 1 }),
      makeDecoration({ id: 'deco', kind: 'shape', data: { x: 0, y: 0, width: 10, height: 10 } }),
    ]
    const payload = normalizeSelection('c1', items, 'height')!
    const touched = payload.items.map((i) => (i.kind === 'placement' ? i.placementId : i.decorationId))
    expect(touched).not.toContain('locked')
    expect(touched).not.toContain('deco')
  })

  it('is a no-op below two normalizable placements and when already even', () => {
    expect(normalizeSelection('c1', [makePlacement({ width: 100, height: 100 })], 'height')).toBeNull()
    const even: SceneItem[] = [
      makePlacement({ id: 'a', width: 100, height: 100 }),
      makePlacement({ id: 'b', width: 100, height: 100 }),
    ]
    expect(normalizeSelection('c1', even, 'height')).toBeNull()
  })
})
