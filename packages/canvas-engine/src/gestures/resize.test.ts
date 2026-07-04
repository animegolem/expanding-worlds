import { describe, expect, it } from 'vitest'
import { Camera } from '../camera'
import { GestureSession } from '../gesture'
import { noopSnapProvider } from '../snap'
import { makeDecoration, makePlacement } from '../test-helpers'
import { createResizeDriver, type ResizeHandle } from './resize'
import type { GestureContext } from '../controller'
import type { Point } from '../camera'
import type { SceneItem } from '../types'

function ctx(items: SceneItem[], start: Point, current: Point, alt = false): GestureContext {
  return {
    session: new GestureSession('canvas-1', items),
    startWorld: start,
    currentWorld: current,
    modifiers: { alt },
    snap: noopSnapProvider,
    camera: new Camera(),
  }
}

function run(
  handle: ResizeHandle,
  items: SceneItem[],
  start: Point,
  current: Point,
  alt = false,
) {
  const context = ctx(items, start, current, alt)
  createResizeDriver(handle).update(context)
  return context.session
}

describe('createResizeDriver', () => {
  it('corner resize of a non-image placement is free-aspect by default', () => {
    // Body center (50, 50), 40×20 → bounds 30..70 × 40..60; se anchor is nw (30, 40).
    const a = makePlacement({ x: 50, y: 50, width: 40, height: 20 })
    const session = run('se', [a], { x: 70, y: 60 }, { x: 110, y: 70 })
    expect(session.get(a.id)).toMatchObject({
      transform: { x: 70, y: 55, width: 80, height: 30, scale: 1, rotation: 0 },
    })
  })

  it('corner resize preserves aspect for image appearances; alt frees it', () => {
    const img = makePlacement({
      x: 50,
      y: 50,
      width: 40,
      height: 20,
      appearanceKind: 'image',
      assetContentHash: 'a'.repeat(64),
    })
    // sx = 2, sy = 1.5 → dominant axis (x) wins both.
    const locked = run('se', [img], { x: 70, y: 60 }, { x: 110, y: 70 })
    expect(locked.get(img.id)).toMatchObject({
      transform: { width: 80, height: 40 },
    })
    const freed = run('se', [img], { x: 70, y: 60 }, { x: 110, y: 70 }, true)
    expect(freed.get(img.id)).toMatchObject({
      transform: { width: 80, height: 30 },
    })
  })

  it('edge handles stretch exactly one axis', () => {
    const a = makePlacement({ x: 50, y: 50, width: 40, height: 20 })
    const session = run('e', [a], { x: 70, y: 50 }, { x: 110, y: 50 })
    expect(session.get(a.id)).toMatchObject({
      transform: { x: 70, y: 50, width: 80, height: 20 },
    })
    const vertical = run('n', [a], { x: 50, y: 40 }, { x: 50, y: 20 })
    // n anchor is the bottom edge (y = 60): sy = (20−60)/(40−60) = 2.
    expect(vertical.get(a.id)).toMatchObject({
      transform: { x: 50, y: 40, width: 40, height: 40 },
    })
  })

  it('multi-selection scales every member about the union-bounds anchor', () => {
    const a = makePlacement({ x: 0, y: 0, width: 20, height: 20 })
    const b = makePlacement({ x: 100, y: 0, width: 20, height: 20 })
    const d = makeDecoration({ data: { x: 40, y: 0, width: 10, height: 10 } })
    // Union bounds −10..110 × −10..10; se anchor (−10, −10); double both axes.
    const session = run('se', [a, b, d], { x: 110, y: 10 }, { x: 230, y: 30 })
    expect(session.get(a.id)).toMatchObject({
      transform: { x: 10, y: 10, width: 40, height: 40 },
    })
    expect(session.get(b.id)).toMatchObject({
      transform: { x: 210, y: 10, width: 40, height: 40 },
    })
    expect(session.get(d.id)).toMatchObject({
      data: { x: 90, y: 10, width: 20, height: 20 },
    })
  })

  it('keeps placement scale and folds factors into dimensions', () => {
    // scale 2 × width 10 → effective 20; doubling yields width 20 at scale 2.
    const a = makePlacement({ x: 0, y: 0, width: 10, height: 10, scale: 2 })
    const session = run('se', [a], { x: 10, y: 10 }, { x: 30, y: 30 })
    expect(session.get(a.id)).toMatchObject({
      transform: { width: 20, height: 20, scale: 2 },
    })
  })

  it('clamps collapse-through-zero instead of mirroring', () => {
    const a = makePlacement({ x: 50, y: 50, width: 40, height: 20 })
    const session = run('se', [a], { x: 70, y: 60 }, { x: 0, y: 0 })
    const update = session.get(a.id)!
    if (update.kind !== 'placement') throw new Error('expected placement')
    expect(update.transform.width).toBeGreaterThan(0)
    expect(update.transform.height).toBeGreaterThan(0)
  })

  it('commits exactly one payload carrying the final sizes', () => {
    const a = makePlacement({ x: 50, y: 50, width: 40, height: 20 })
    const context = ctx([a], { x: 70, y: 60 }, { x: 90, y: 60 })
    const driver = createResizeDriver('e')
    driver.update(context)
    driver.update({ ...context, currentWorld: { x: 110, y: 60 } })
    const payload = context.session.commitPayload()
    expect(payload!.items).toHaveLength(1)
    expect(payload!.items[0]).toMatchObject({ width: 80 })
  })
})
