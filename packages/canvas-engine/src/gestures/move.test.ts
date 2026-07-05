import { describe, expect, it } from 'vitest'
import { Camera } from '../camera'
import { GestureSession } from '../gesture'
import { makeDecoration, makePlacement } from '../test-helpers'
import { constrainDeltaToAxes, moveDriver } from './move'
import type { GestureContext } from '../controller'
import type { SceneItem } from '../types'
import type { SnapProvider, SnapQuery } from '../snap'

function fakeSnap(adjust: { dx?: number; dy?: number } = {}): SnapProvider & {
  queries: SnapQuery[]
} {
  const queries: SnapQuery[] = []
  return {
    queries,
    begin() {},
    end() {},
    query(query) {
      queries.push(query)
      return {
        dx: query.proposedDelta.dx + (adjust.dx ?? 0),
        dy: query.proposedDelta.dy + (adjust.dy ?? 0),
        guides: adjust.dx || adjust.dy ? [{ axis: 'x', position: 0, from: 0, to: 1 }] : [],
      }
    },
  }
}

function ctx(
  items: SceneItem[],
  delta: { dx: number; dy: number },
  opts: { snap?: SnapProvider; alt?: boolean } = {},
): GestureContext {
  return {
    session: new GestureSession('canvas-1', items),
    startWorld: { x: 10, y: 10 },
    currentWorld: { x: 10 + delta.dx, y: 10 + delta.dy },
    modifiers: { alt: opts.alt },
    snap: opts.snap ?? fakeSnap(),
    camera: new Camera(),
  }
}

describe('moveDriver', () => {
  it('moves every selection member and commits exactly one payload', () => {
    const a = makePlacement({ x: 0, y: 0, width: 20, height: 20 })
    const b = makePlacement({ x: 100, y: 50, width: 20, height: 20 })
    const d = makeDecoration({ data: { x1: 0, y1: 0, x2: 10, y2: 5 } })
    const context = ctx([a, b, d], { dx: 30, dy: -8 })
    moveDriver.update(context)

    const payload = context.session.commitPayload()
    expect(payload).not.toBeNull()
    expect(payload!.canvasId).toBe('canvas-1')
    expect(payload!.items).toHaveLength(3)
    const pa = payload!.items.find(
      (i) => i.kind === 'placement' && i.placementId === a.id,
    )
    expect(pa).toMatchObject({ x: 30, y: -8, rotation: 0, scale: 1 })
    const pd = payload!.items.find((i) => i.kind === 'decoration')
    expect(pd).toMatchObject({ data: { x1: 30, y1: -8, x2: 40, y2: -3 } })
  })

  it('shifts decoration point, segment, and polyline coordinate forms', () => {
    const point = makeDecoration({ data: { x: 5, y: 5, width: 40, height: 20 } })
    const path = makeDecoration({
      data: {
        points: [
          [0, 0],
          [10, 20],
        ],
      },
    })
    const context = ctx([point, path], { dx: 1, dy: 2 })
    moveDriver.update(context)
    expect(context.session.get(point.id)).toMatchObject({
      data: { x: 6, y: 7, width: 40, height: 20 },
    })
    expect(context.session.get(path.id)).toMatchObject({
      data: {
        points: [
          [1, 2],
          [11, 22],
        ],
      },
    })
  })

  it('routes the delta through the snap provider and returns its guides', () => {
    const snap = fakeSnap({ dx: 4 })
    const a = makePlacement({ x: 0, y: 0, width: 20, height: 20 })
    const context = ctx([a], { dx: 10, dy: 0 }, { snap })
    const guides = moveDriver.update(context)
    expect(guides).toHaveLength(1)
    expect(context.session.get(a.id)).toMatchObject({ transform: { x: 14, y: 0 } })
    // The moving bounds arrive at the proposed (pre-snap) position.
    expect(snap.queries[0]!.movingBounds.x).toBeCloseTo(-10 + 10)
    expect(snap.queries[0]!.disabled).toBe(false)
  })

  it('marks the snap query disabled while alt is held', () => {
    const snap = fakeSnap()
    const a = makePlacement({ width: 20, height: 20 })
    moveDriver.update(ctx([a], { dx: 5, dy: 5 }, { snap, alt: true }))
    expect(snap.queries[0]!.disabled).toBe(true)
  })

  it('a zero-delta gesture yields no commit payload', () => {
    const a = makePlacement({ x: 7, y: 7, width: 20, height: 20 })
    const context = ctx([a], { dx: 0, dy: 0 })
    moveDriver.update(context)
    expect(context.session.commitPayload()).toBeNull()
  })

  it('later updates supersede earlier ones — one payload, final values', () => {
    const a = makePlacement({ x: 0, y: 0, width: 20, height: 20 })
    const session = new GestureSession('canvas-1', [a])
    const base = {
      session,
      startWorld: { x: 0, y: 0 },
      modifiers: {},
      snap: fakeSnap(),
      camera: new Camera(),
    }
    moveDriver.update({ ...base, currentWorld: { x: 10, y: 0 } })
    moveDriver.update({ ...base, currentWorld: { x: 25, y: 5 } })
    const payload = session.commitPayload()
    expect(payload!.items).toHaveLength(1)
    expect(payload!.items[0]).toMatchObject({ x: 25, y: 5 })
  })
})

describe('shift axis constraint (AI-IMP-042)', () => {
  it('projects onto the nearest axis and preserves along-ray travel', () => {
    const flat = constrainDeltaToAxes(100, 12)
    expect(flat.dy).toBe(0)
    expect(flat.dx).toBeCloseTo(100)
    const diag = constrainDeltaToAxes(100, 80)
    expect(diag.dx).toBeCloseTo(diag.dy)
    expect(Math.hypot(diag.dx, diag.dy)).toBeCloseTo((100 + 80) / Math.SQRT2)
    expect(constrainDeltaToAxes(0, 0)).toEqual({ dx: 0, dy: 0 })
  })
})

describe('shift silences snapping (AI-IMP-043)', () => {
  it('disables the snap provider and keeps the exact axis delta', () => {
    let sawDisabled: boolean | undefined
    const recordingSnap = {
      begin() {},
      end() {},
      query(q: { proposedDelta: { dx: number; dy: number }; disabled: boolean }) {
        sawDisabled = q.disabled
        // A snap that would yank the drag off-axis if consulted.
        return q.disabled
          ? { dx: q.proposedDelta.dx, dy: q.proposedDelta.dy, guides: [] }
          : { dx: q.proposedDelta.dx, dy: q.proposedDelta.dy + 5, guides: [] }
      },
    }
    const item = makePlacement({ x: 0, y: 0, width: 20, height: 20 })
    const session = new GestureSession('canvas-1', [item])
    moveDriver.update({
      session,
      startWorld: { x: 0, y: 0 },
      currentWorld: { x: 100, y: 8 },
      modifiers: { shift: true },
      snap: recordingSnap,
      camera: new Camera(),
    })
    expect(sawDisabled).toBe(true)
    const update = session.get(item.id)!
    if (update.kind !== 'placement') throw new Error('expected placement')
    expect(update.transform.x).toBeCloseTo(100)
    expect(update.transform.y).toBeCloseTo(0) // exactly on axis
  })
})
