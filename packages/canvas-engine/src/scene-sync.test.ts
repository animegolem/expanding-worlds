import { Container } from 'pixi.js'
import { describe, expect, it } from 'vitest'
import { createDefaultRegistry } from './index'
import { SceneSync } from './scene-sync'
import { fakeResources, makeDecoration, makePlacement } from './test-helpers'
import type { SceneItem } from './types'

function setup() {
  const plane = new Container()
  const sync = new SceneSync(plane, createDefaultRegistry(), fakeResources())
  return { plane, sync }
}

describe('SceneSync', () => {
  it('creates, updates, and removes display objects keyed by id', () => {
    const { plane, sync } = setup()
    const a = makePlacement({ x: 10 })
    const b = makeDecoration()
    sync.apply([a, b])
    expect(plane.children).toHaveLength(2)
    expect(sync.stats()).toEqual({ total: 2, placements: 1, decorations: 1 })

    sync.apply([{ ...a, x: 99 }])
    expect(plane.children).toHaveLength(1)
    expect(sync.get(a.id)!.position.x).toBe(99)
    expect(sync.get(b.id)).toBeUndefined()
  })

  it('preserves object identity across syncs for unchanged and updated items', () => {
    const { sync } = setup()
    const a = makePlacement()
    sync.apply([a])
    const object = sync.get(a.id)
    sync.apply([{ ...a, x: 5 }])
    expect(sync.get(a.id)).toBe(object)
  })

  it('matches child order to the render_order-sorted snapshot', () => {
    const { plane, sync } = setup()
    const a = makePlacement()
    const b = makeDecoration()
    const c = makePlacement()
    sync.apply([a, b, c])
    expect(plane.children.map((ch) => ch.label)).toEqual([
      `placement:${a.id}`,
      `decoration:${b.id}`,
      `placement:${c.id}`,
    ])
    // b moves to front (§6.8 bring to front = last in paint order).
    sync.apply([a, c, b])
    expect(plane.children[2]!.label).toBe(`decoration:${b.id}`)
  })

  it('hides hidden decorations without destroying them', () => {
    const { sync } = setup()
    const d = makeDecoration()
    sync.apply([d])
    const object = sync.get(d.id)!
    expect(object.visible).toBe(true)
    sync.apply([{ ...d, hidden: 1 }])
    expect(sync.get(d.id)).toBe(object)
    expect(object.visible).toBe(false)
  })

  it('notifies item-updated listeners with the new item', () => {
    const { sync } = setup()
    const a = makePlacement()
    sync.apply([a])
    const seen: Array<{ id: string; item: SceneItem }> = []
    const off = sync.onItemUpdated((id, item) => seen.push({ id, item }))
    sync.apply([{ ...a, x: 7 }])
    expect(seen).toHaveLength(1)
    expect((seen[0]!.item as { x: number }).x).toBe(7)
    off()
    sync.apply([{ ...a, x: 8 }])
    expect(seen).toHaveLength(1)
  })

  it('clear() empties the plane', () => {
    const { plane, sync } = setup()
    sync.apply([makePlacement(), makeDecoration()])
    sync.clear()
    expect(plane.children).toHaveLength(0)
    expect(sync.stats().total).toBe(0)
  })
})
