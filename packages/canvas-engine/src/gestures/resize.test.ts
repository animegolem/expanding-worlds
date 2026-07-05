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

describe('local-frame resize for a single rotated item (AI-IMP-031)', () => {
  it('90°-rotated placement: dragging the local e handle changes width along world Y', () => {
    const item = makePlacement({
      x: 0,
      y: 0,
      width: 100,
      height: 40,
      rotation: Math.PI / 2,
      appearanceKind: 'image',
      assetContentHash: 'a'.repeat(64),
    })
    // Local e handle sits at local (50, 0) → world (0, 50). Drag it
    // 25 world units further down = +25 local x; anchored at the
    // opposite (w) edge: s = (75+50)/(50+50) = 1.25.
    const session = run('e', [item], { x: 0, y: 50 }, { x: 0, y: 75 })
    const update = session.get(item.id)!
    if (update.kind !== 'placement') throw new Error('expected placement update')
    const t = update.transform
    expect(t.width).toBeCloseTo(125)
    expect(t.height).toBeCloseTo(40)
    expect(t.rotation!).toBeCloseTo(Math.PI / 2)
    // Anchor (local w edge at world (0, −50)) stays pinned: the
    // center moves half the growth along world Y.
    expect(t.x).toBeCloseTo(0)
    expect(t.y).toBeCloseTo(12.5)
  })

  it('45°-rotated shape: corner drag scales both axes in the local frame', () => {
    const angle = Math.PI / 4
    const shape = makeDecoration({
      kind: 'shape',
      data: {
        shape: 'rect',
        x: -50,
        y: -20,
        width: 100,
        height: 40,
        rotation: angle,
        stroke: '#fff',
        strokeWidth: 2,
      },
    })
    // Local se corner (50, 20) → world via 45° rotation about (0,0).
    const cos = Math.cos(angle)
    const sin = Math.sin(angle)
    const world = (lx: number, ly: number) => ({
      x: lx * cos - ly * sin,
      y: lx * sin + ly * cos,
    })
    // Anchored at the local nw corner (−50, −20):
    // s = (100+50)/(50+50) = (40+20)/(20+20) = 1.5.
    const session = run('se', [shape], world(50, 20), world(100, 40))
    const update = session.get(shape.id)!
    if (update.kind !== 'decoration') throw new Error('expected decoration update')
    const d = update.data as Record<string, number>
    expect(d['width']).toBeCloseTo(150)
    expect(d['height']).toBeCloseTo(60)
    expect(d['rotation']).toBeCloseTo(angle)
    // New center local = anchor × (1 − s) = (25, 10), rotated out.
    const newCenter = world(25, 10)
    expect(d['x']).toBeCloseTo(newCenter.x - 75)
    expect(d['y']).toBeCloseTo(newCenter.y - 30)
  })
})

describe('art-text scaling (AI-IMP-034)', () => {
  it('scales fontSize, measured bounds, and wrap width uniformly', () => {
    const text = makeDecoration({
      kind: 'text',
      data: {
        x: 100,
        y: 100,
        text: 'label',
        fontSize: 16,
        color: '#fff',
        measuredWidth: 60,
        measuredHeight: 20,
        width: 80,
      },
    })
    // Bounds 100..160 × 100..120; se corner drag doubling x-extent:
    // dominant factor 2 applies to everything.
    const session = run('se', [text], { x: 160, y: 120 }, { x: 220, y: 125 })
    const update = session.get(text.id)!
    if (update.kind !== 'decoration') throw new Error('expected decoration update')
    const d = update.data as Record<string, number>
    expect(d['fontSize']).toBeCloseTo(32)
    expect(d['measuredWidth']).toBeCloseTo(120)
    expect(d['measuredHeight']).toBeCloseTo(40)
    expect(d['width']).toBeCloseTo(160)
    // Anchored at nw (100, 100): position scales from there.
    expect(d['x']).toBeCloseTo(100)
    expect(d['y']).toBeCloseTo(100)
  })

  it('edge handles also scale uniformly (no stretch)', () => {
    const text = makeDecoration({
      kind: 'text',
      data: { x: 0, y: 0, text: 'label', fontSize: 16, color: '#fff', measuredWidth: 60, measuredHeight: 20 },
    })
    const session = run('e', [text], { x: 60, y: 10 }, { x: 90, y: 10 })
    const update = session.get(text.id)!
    if (update.kind !== 'decoration') throw new Error('expected decoration update')
    expect((update.data as Record<string, number>)['fontSize']).toBeCloseTo(24)
    expect((update.data as Record<string, number>)['measuredHeight']).toBeCloseTo(30)
  })
})

describe('arrow thickness scales with resize (AI-IMP-035)', () => {
  it('scales strokeWidth by the mean axis factor for arrows only', () => {
    const arrow = makeDecoration({
      kind: 'arrow',
      data: { x1: 0, y1: 0, x2: 100, y2: 0, stroke: '#fff', strokeWidth: 10 },
    })
    const line = makeDecoration({
      kind: 'line',
      data: { x1: 0, y1: 40, x2: 100, y2: 40, stroke: '#fff', strokeWidth: 10 },
    })
    // Bounds (stroke-padded): x −5..105. se drag doubling x-extent.
    const session = run('e', [arrow, line], { x: 105, y: 20 }, { x: 215, y: 20 })
    const arrowData = (session.get(arrow.id) as { data: Record<string, number> }).data
    const lineData = (session.get(line.id) as { data: Record<string, number> }).data
    // sx = 2, sy = 1 → arrow thickness × 1.5; line untouched.
    expect(arrowData['strokeWidth']).toBeCloseTo(15)
    expect(lineData['strokeWidth']).toBeCloseTo(10)
  })
})
