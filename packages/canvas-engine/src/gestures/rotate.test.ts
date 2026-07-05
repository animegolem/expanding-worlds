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

describe('shape rotation (AI-IMP-031)', () => {
  const shapeData = {
    shape: 'rect',
    x: 40,
    y: 20,
    width: 20,
    height: 10,
    stroke: '#fff',
    strokeWidth: 2,
  }

  function dataOf(session: GestureSession, id: string): Record<string, unknown> {
    const update = session.get(id)
    if (!update || update.kind !== 'decoration') throw new Error('expected decoration update')
    return update.data
  }

  it('spins a sole-selected shape about its own center (no orbit)', () => {
    const shape = makeDecoration({ kind: 'shape', data: { ...shapeData } })
    // Center (50, 25); pointer sweeps 90° around it.
    const context = ctx([shape], { x: 70, y: 25 }, { x: 50, y: 45 })
    rotateDriver.update(context)
    const data = dataOf(context.session, shape.id)
    expect(data['x']).toBeCloseTo(40)
    expect(data['y']).toBeCloseTo(20)
    expect(data['rotation']).toBeCloseTo(Math.PI / 2)
  })

  it('accumulates onto an existing rotation', () => {
    const shape = makeDecoration({ kind: 'shape', data: { ...shapeData, rotation: 0.5 } })
    const context = ctx([shape], { x: 70, y: 25 }, { x: 50, y: 45 })
    rotateDriver.update(context)
    expect(dataOf(context.session, shape.id)['rotation']).toBeCloseTo(0.5 + Math.PI / 2)
  })

  it('multi-select: the shape center orbits the pivot AND the shape spins', () => {
    const shape = makeDecoration({ kind: 'shape', data: { ...shapeData, x: 90, y: -5 } })
    const anchor = makePlacement({ x: -100, y: 0, width: 20, height: 20 })
    // Shape center (100, 0); the stroke-padded union bounds center
    // is (0.5, 0); sweep 90°: new center (0.5, 99.5) → top-left
    // (−9.5, 94.5).
    const context = ctx([shape, anchor], { x: 200, y: 0 }, { x: 0.5, y: 199.5 })
    rotateDriver.update(context)
    const data = dataOf(context.session, shape.id)
    expect(data['x']).toBeCloseTo(-9.5)
    expect(data['y']).toBeCloseTo(94.5)
    expect(data['rotation']).toBeCloseTo(Math.PI / 2)
  })

  it('lines still rotate by coordinate pairs (no rotation field invented)', () => {
    const line = makeDecoration({
      kind: 'line',
      data: { x1: 100, y1: 0, x2: 200, y2: 0, stroke: '#fff', strokeWidth: 2 },
    })
    const context = ctx([line], { x: 200, y: 0 }, { x: 150, y: 50 })
    rotateDriver.update(context)
    const update = context.session.get(line.id)!
    expect(update.kind).toBe('decoration')
    expect((update as { data: Record<string, unknown> }).data['rotation']).toBeUndefined()
  })
})

describe('orientation snapping (AI-IMP-033)', () => {
  it('magnetizes a single item to the nearest cardinal within 5°', () => {
    const a = makePlacement({ x: 0, y: 0, width: 20, height: 20, rotation: 0.07 })
    // Rotate by ~87°: target ≈ 88.7° → clicks to exactly 90°.
    const rad87 = (87 * Math.PI) / 180
    const context = ctx([a], { x: 100, y: 0 }, { x: 100 * Math.cos(rad87), y: 100 * Math.sin(rad87) })
    rotateDriver.update(context)
    expect(transformOf(context.session, a.id).rotation).toBeCloseTo(Math.PI / 2)
  })

  it('leaves angles outside the magnet window raw', () => {
    const a = makePlacement({ x: 0, y: 0, width: 20, height: 20, rotation: 0.25 })
    const rad40 = (40 * Math.PI) / 180
    const context = ctx([a], { x: 100, y: 0 }, { x: 100 * Math.cos(rad40), y: 100 * Math.sin(rad40) })
    rotateDriver.update(context)
    expect(transformOf(context.session, a.id).rotation).toBeCloseTo(0.25 + rad40)
  })

  it('shift snaps the RESULTING orientation to 15° multiples, not the delta', () => {
    const start = (7 * Math.PI) / 180
    const a = makePlacement({ x: 0, y: 0, width: 20, height: 20, rotation: start })
    const rad40 = (40 * Math.PI) / 180
    const context = ctx(
      [a],
      { x: 100, y: 0 },
      { x: 100 * Math.cos(rad40), y: 100 * Math.sin(rad40) },
      true,
    )
    rotateDriver.update(context)
    const result = transformOf(context.session, a.id).rotation!
    // 7° + 40° = 47° → absolute snap to 45°, a 15° multiple.
    expect(result).toBeCloseTo((45 * Math.PI) / 180)
    expect((result / ROTATE_SNAP_STEP) % 1).toBeCloseTo(0)
  })

  it('alt bypasses both magnets', () => {
    const a = makePlacement({ x: 0, y: 0, width: 20, height: 20, rotation: 0.07 })
    const rad87 = (87 * Math.PI) / 180
    const context = ctx([a], { x: 100, y: 0 }, { x: 100 * Math.cos(rad87), y: 100 * Math.sin(rad87) })
    context.modifiers = { alt: true }
    rotateDriver.update(context)
    expect(transformOf(context.session, a.id).rotation).toBeCloseTo(0.07 + rad87)
  })

  it('multi-select keeps delta-based shift snapping', () => {
    const a = makePlacement({ x: 100, y: 0, width: 20, height: 20, rotation: 0.07 })
    const b = makePlacement({ x: -100, y: 0, width: 20, height: 20 })
    const rad40 = (40 * Math.PI) / 180
    const context = ctx(
      [a, b],
      { x: 200, y: 0 },
      { x: 200 * Math.cos(rad40), y: 200 * Math.sin(rad40) },
      true,
    )
    rotateDriver.update(context)
    // Delta snapped to 45°; a's rotation = 0.07 + 45° (not absolute).
    expect(transformOf(context.session, a.id).rotation).toBeCloseTo(0.07 + (45 * Math.PI) / 180)
  })
})
