import { describe, expect, it } from 'vitest'
import { CanvasController, type ControllerHost } from './controller'
import { Lens, LENS_DIM_ALPHA, lensAlpha } from './lens'
import { makePlacement } from './test-helpers'
import type { SceneItem } from './types'

const noopHost: ControllerHost = {
  applyEphemeral: () => {},
  restoreItem: () => {},
  commitTransform: () => {},
  renderMarquee: () => {},
  renderGuides: () => {},
  cameraChanged: () => {},
}

function setup(items: SceneItem[]) {
  const controller = new CanvasController(noopHost, 'canvas-1')
  controller.setItems(items)
  return controller
}

describe('Lens state', () => {
  it('set applies, clear drops, listeners hear both', () => {
    const lens = new Lens()
    const events: (readonly string[] | null)[] = []
    lens.onChanged((ids) => events.push(ids))
    expect(lens.active).toBe(false)
    expect(lens.ids()).toBeNull()

    lens.set(['a', 'b'])
    expect(lens.active).toBe(true)
    expect(lens.ids()?.sort()).toEqual(['a', 'b'])
    expect(lens.has('a')).toBe(true)
    expect(lens.has('c')).toBe(false)

    lens.clear()
    expect(lens.active).toBe(false)
    expect(lens.ids()).toBeNull()
    expect(events).toHaveLength(2)
    expect(events[1]).toBeNull()
  })

  it('clear when inactive is silent; set([]) clears instead of dimming everything', () => {
    const lens = new Lens()
    let notified = 0
    lens.onChanged(() => notified++)
    lens.clear()
    expect(notified).toBe(0)
    lens.set(['a'])
    lens.set([])
    expect(lens.active).toBe(false)
    expect(notified).toBe(2)
  })

  it('intersect keeps survivors, stays silent when nothing changed, clears when empty', () => {
    const lens = new Lens()
    let notified = 0
    lens.set(['a', 'b', 'c'])
    lens.onChanged(() => notified++)

    // Unrelated edit: all members survive — no churn.
    lens.intersect(new Set(['a', 'b', 'c', 'd']))
    expect(notified).toBe(0)
    expect(lens.ids()?.sort()).toEqual(['a', 'b', 'c'])

    // A member was deleted elsewhere.
    lens.intersect(new Set(['a', 'c', 'd']))
    expect(notified).toBe(1)
    expect(lens.ids()?.sort()).toEqual(['a', 'c'])

    // Every member gone: the lens drops rather than dim the world.
    lens.intersect(new Set(['d']))
    expect(lens.active).toBe(false)
    expect(notified).toBe(2)
  })

  it('lensAlpha: full for members and when inactive, LENS_DIM_ALPHA for outsiders', () => {
    const lens = new Lens()
    expect(lensAlpha(lens, 'x')).toBe(1)
    lens.set(['a'])
    expect(lensAlpha(lens, 'a')).toBe(1)
    expect(lensAlpha(lens, 'x')).toBe(LENS_DIM_ALPHA)
  })
})

describe('CanvasController lens integration', () => {
  it('scene reapply intersects: deletion shrinks, unrelated edits keep, empty clears', () => {
    const a = makePlacement()
    const b = makePlacement()
    const c = makePlacement()
    const controller = setup([a, b, c])
    controller.lens.set([a.id, b.id])

    // Unrelated edit: same ids, fresh snapshots.
    controller.setItems([{ ...a, x: 99 }, b, c])
    expect(controller.lens.ids()?.sort()).toEqual([a.id, b.id].sort())

    // b trashed elsewhere.
    controller.setItems([{ ...a, x: 99 }, c])
    expect(controller.lens.ids()).toEqual([a.id])

    // a gone too: empty intersection drops the lens entirely.
    controller.setItems([c])
    expect(controller.lens.active).toBe(false)
  })

  it('pan and zoom leave the lens untouched', () => {
    const a = makePlacement()
    const b = makePlacement()
    const controller = setup([a, b])
    controller.lens.set([a.id])
    controller.camera.panByScreen(120, -80)
    controller.camera.zoomAt({ x: 40, y: 40 }, 2)
    controller.wheel({ x: 10, y: 10 }, 120)
    expect(controller.lens.ids()).toEqual([a.id])
  })

  it('Escape peels lens before selection: first press drops only the lens', () => {
    const a = makePlacement()
    const b = makePlacement()
    const controller = setup([a, b])
    controller.selection.set([b.id])
    controller.lens.set([a.id])

    controller.escape()
    expect(controller.lens.active).toBe(false)
    expect(controller.selection.ids()).toEqual([b.id])

    controller.escape()
    expect(controller.selection.size).toBe(0)
  })

  it('Escape mid-marquee cancels the marquee only — lens and selection survive', () => {
    const a = makePlacement({ x: 0, y: 0, width: 20, height: 20 })
    const controller = setup([a])
    controller.selection.set([a.id])
    controller.lens.set([a.id])
    controller.pointerDown({ x: 200, y: 200 })
    controller.pointerMove({ x: 260, y: 260 })
    expect(controller.state).toBe('marquee')
    controller.escape()
    expect(controller.state).toBe('idle')
    expect(controller.lens.ids()).toEqual([a.id])
    expect(controller.selection.ids()).toEqual([a.id])
  })

  it('canvas swap drops the lens with the rest of the view state', () => {
    const a = makePlacement()
    const controller = setup([a])
    controller.lens.set([a.id])
    controller.setCanvas('canvas-2')
    expect(controller.lens.active).toBe(false)
  })
})
