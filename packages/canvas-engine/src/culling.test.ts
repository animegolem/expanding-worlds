import { Container } from 'pixi.js'
import { describe, expect, it } from 'vitest'
import { Camera } from './camera'
import { Culler } from './culling'
import { createDefaultRegistry } from './index'
import { SceneSync } from './scene-sync'
import { fakeResources, makePlacement } from './test-helpers'

const VIEWPORT = { width: 800, height: 600 }

function setup(hooks = {}) {
  const plane = new Container()
  const sync = new SceneSync(plane, createDefaultRegistry(), fakeResources())
  const camera = new Camera()
  const culler = new Culler(sync, camera, hooks)
  return { sync, camera, culler }
}

describe('Culler', () => {
  it('marks off-viewport items non-renderable and restores them on re-entry', () => {
    const { sync, camera, culler } = setup()
    const near = makePlacement({ x: 400, y: 300, width: 50, height: 50 })
    const far = makePlacement({ x: 50_000, y: 0, width: 50, height: 50 })
    const items = [near, far]
    sync.apply(items)
    culler.apply(items, VIEWPORT)
    expect(sync.get(near.id)!.renderable).toBe(true)
    expect(sync.get(far.id)!.renderable).toBe(false)

    camera.set({ x: 49_500, y: 0, zoom: 1 })
    culler.apply(items, VIEWPORT)
    expect(sync.get(far.id)!.renderable).toBe(true)
    expect(sync.get(near.id)!.renderable).toBe(false)
  })

  it('render padding keeps just-outside items renderable (hysteresis)', () => {
    const { sync, culler } = setup()
    // 20% of 800 = 160px padding: x=-100 is outside the viewport but
    // inside the padded render rect.
    const nearEdge = makePlacement({ x: -100, y: 300, width: 50, height: 50 })
    sync.apply([nearEdge])
    culler.apply([nearEdge], VIEWPORT)
    expect(sync.get(nearEdge.id)!.renderable).toBe(true)
  })

  it('fires residency enter/leave with the larger rect', () => {
    const entered: string[] = []
    const left: string[] = []
    const { sync, camera, culler } = setup({
      onEnterResidency: (id: string) => entered.push(id),
      onLeaveResidency: (id: string) => left.push(id),
    })
    // Inside residency (75% padding → x ≥ -600 world) but outside render.
    const item = makePlacement({ x: -400, y: 300, width: 50, height: 50 })
    sync.apply([item])
    culler.apply([item], VIEWPORT)
    expect(sync.get(item.id)!.renderable).toBe(false)
    expect(entered).toEqual([item.id])
    expect(culler.isResident(item.id)).toBe(true)

    // Repeat apply: no duplicate enter.
    culler.apply([item], VIEWPORT)
    expect(entered).toEqual([item.id])

    camera.set({ x: 5_000, y: 0, zoom: 1 })
    culler.apply([item], VIEWPORT)
    expect(left).toEqual([item.id])
    expect(culler.isResident(item.id)).toBe(false)
  })

  it('fires leave for items that vanish from the scene', () => {
    const left: string[] = []
    const { sync, culler } = setup({ onLeaveResidency: (id: string) => left.push(id) })
    const item = makePlacement({ x: 100, y: 100, width: 50, height: 50 })
    sync.apply([item])
    culler.apply([item], VIEWPORT)
    sync.apply([])
    culler.apply([], VIEWPORT)
    expect(left).toEqual([item.id])
  })

  it('respects zoom: a far item enters the viewport when zoomed out', () => {
    const { sync, camera, culler } = setup()
    const item = makePlacement({ x: 3_000, y: 300, width: 50, height: 50 })
    sync.apply([item])
    culler.apply([item], VIEWPORT)
    expect(sync.get(item.id)!.renderable).toBe(false)
    camera.set({ x: 0, y: 0, zoom: 0.2 })
    culler.apply([item], VIEWPORT)
    expect(sync.get(item.id)!.renderable).toBe(true)
  })

  it('reports stats', () => {
    const { sync, culler } = setup()
    const a = makePlacement({ x: 100, y: 100, width: 10, height: 10 })
    const b = makePlacement({ x: 90_000, y: 0, width: 10, height: 10 })
    sync.apply([a, b])
    culler.apply([a, b], VIEWPORT)
    expect(culler.stats([a, b])).toEqual({ total: 2, renderable: 1, resident: 1 })
  })
})
