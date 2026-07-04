import { describe, expect, it } from 'vitest'
import { Camera } from '../camera'
import { GestureSession } from '../gesture'
import { noopSnapProvider } from '../snap'
import { makeDecoration, makePlacement } from '../test-helpers'
import { ROTATE_SNAP_STEP, rotateDriver } from './rotate'
import type { GestureContext } from '../controller'
import type { PlacementTransform } from '../gesture'
import type { Point } from '../camera'
import type { SceneItem } from '../types'

function ctx(items: SceneItem[], start: Point, current: Point, shift = false): GestureContext {
  return {
    session: new GestureSession('canvas-1', items),
    startWorld: start,
    currentWorld: current,
    modifiers: { shift },
    snap: noopSnapProvider,
    camera: new Camera(),
  }
}

function transformOf(session: GestureSession, id: string): PlacementTransform {
  const update = session.get(id)
  if (!update || update.kind !== 'placement') throw new Error('expected placement update')
  return update.transform
}

describe('rotateDriver', () => {
  it('rotates a single placement about the selection center', () => {
    // Sole member → pivot is its own center; only rotation changes,
    // and the delta accumulates onto the prior rotation.
    const a = makePlacement({ x: 50, y: 50, width: 20, height: 20, rotation: 0.25 })
    const context = ctx([a], { x: 70, y: 50 }, { x: 50, y: 70 })
    rotateDriver.update(context)
    const t = transformOf(context.session, a.id)
    expect(t.rotation).toBeCloseTo(0.25 + Math.PI / 2)
    expect(t.x).toBeCloseTo(50)
    expect(t.y).toBeCloseTo(50)
  })

  it('multi-item rotation orbits member centers and adds the delta to each rotation', () => {
    const a = makePlacement({ x: 100, y: 0, width: 20, height: 20 })
    const b = makePlacement({ x: -100, y: 0, width: 20, height: 20 })
    // Union center (0, 0); pointer sweeps 0° → 90°.
    const context = ctx([a, b], { x: 200, y: 0 }, { x: 0, y: 200 })
    rotateDriver.update(context)
    const ta = transformOf(context.session, a.id)
    expect(ta.x).toBeCloseTo(0)
    expect(ta.y).toBeCloseTo(100)
    expect(ta.rotation).toBeCloseTo(Math.PI / 2)
    const tb = transformOf(context.session, b.id)
    expect(tb.x).toBeCloseTo(0)
    expect(tb.y).toBeCloseTo(-100)
  })

  it('shift snaps the delta to 15° increments', () => {
    const a = makePlacement({ x: 0, y: 0, width: 20, height: 20 })
    // 40° of travel snaps to 45° (3 steps of 15°).
    const rad40 = (40 * Math.PI) / 180
    const context = ctx(
      [a],
      { x: 100, y: 0 },
      { x: 100 * Math.cos(rad40), y: 100 * Math.sin(rad40) },
      true,
    )
    rotateDriver.update(context)
    expect(transformOf(context.session, a.id).rotation).toBeCloseTo(3 * ROTATE_SNAP_STEP)
  })

  it('rotates decoration coordinates about the selection center', () => {
    const d = makeDecoration({ data: { x1: 10, y1: 0, x2: 20, y2: 0 } })
    // Bounds 10..20 × 0..0 → center (15, 0); rotate 90°.
    const context = ctx([d], { x: 115, y: 0 }, { x: 15, y: 100 })
    rotateDriver.update(context)
    const update = context.session.get(d.id)!
    if (update.kind !== 'decoration') throw new Error('expected decoration')
    expect(update.data['x1'] as number).toBeCloseTo(15)
    expect(update.data['y1'] as number).toBeCloseTo(-5)
    expect(update.data['x2'] as number).toBeCloseTo(15)
    expect(update.data['y2'] as number).toBeCloseTo(5)
  })

  it('a full round trip back to the start angle commits nothing', () => {
    const a = makePlacement({ x: 0, y: 0, width: 20, height: 20 })
    const context = ctx([a], { x: 100, y: 0 }, { x: 100, y: 0 })
    rotateDriver.update(context)
    expect(context.session.commitPayload()).toBeNull()
  })
})
