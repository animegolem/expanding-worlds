import { describe, expect, it } from 'vitest'
import { alignPayload, distributePayload } from './arrange'
import { itemWorldAABB } from './hit-test'
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
