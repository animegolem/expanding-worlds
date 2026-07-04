import { describe, expect, it } from 'vitest'
import { CanvasController, type ControllerHost, type GestureDriver } from './controller'
import { placementTransformOf } from './gesture'
import { makeDecoration, makePlacement } from './test-helpers'
import type { TransformContentPayload } from '@ew/commands'
import type { Rect } from './camera'
import type { SceneItem } from './types'

function fakeHost() {
  const commits: TransformContentPayload[] = []
  const restored: string[] = []
  const ephemeral: string[] = []
  let marquee: Rect | null = null
  let guides = 0
  const host: ControllerHost = {
    applyEphemeral: (id) => ephemeral.push(id),
    restoreItem: (item) => restored.push(item.id),
    commitTransform: (payload) => commits.push(payload),
    renderMarquee: (rect) => (marquee = rect),
    renderGuides: (g) => (guides = g.length),
    cameraChanged: () => {},
  }
  return {
    host,
    commits,
    restored,
    ephemeral,
    marquee: () => marquee,
    guides: () => guides,
  }
}

/** Minimal stand-in for AI-IMP-019's move driver. */
const moveDriver: GestureDriver = {
  update({ session, startWorld, currentWorld, snap, modifiers }) {
    const { dx, dy, guides } = snap.query({
      movingBounds: { x: 0, y: 0, width: 1, height: 1 },
      proposedDelta: { dx: currentWorld.x - startWorld.x, dy: currentWorld.y - startWorld.y },
      disabled: modifiers.alt ?? false,
      zoom: 1,
    })
    for (const id of session.ids()) {
      const prior = session.prior(id)
      if (prior.itemKind !== 'placement') continue
      const t = placementTransformOf(prior)
      session.set(id, { kind: 'placement', transform: { ...t, x: t.x + dx, y: t.y + dy } })
    }
    return guides
  },
}

function setup(items: SceneItem[]) {
  const fake = fakeHost()
  const controller = new CanvasController(fake.host, 'canvas-1')
  controller.setItems(items)
  controller.registerMoveDriver(moveDriver)
  return { controller, ...fake }
}

describe('CanvasController selection', () => {
  it('click selects, shift toggles, empty click clears', () => {
    const a = makePlacement({ x: 0, y: 0, width: 20, height: 20 })
    const b = makePlacement({ x: 100, y: 0, width: 20, height: 20 })
    const { controller } = setup([a, b])

    controller.pointerDown({ x: 0, y: 0 })
    controller.pointerUp({ x: 0, y: 0 })
    expect(controller.selection.ids()).toEqual([a.id])

    controller.pointerDown({ x: 100, y: 0 }, { shift: true })
    controller.pointerUp({ x: 100, y: 0 }, { shift: true })
    expect(controller.selection.ids().sort()).toEqual([a.id, b.id].sort())

    controller.pointerDown({ x: 500, y: 500 })
    controller.pointerUp({ x: 500, y: 500 })
    expect(controller.selection.size).toBe(0)
  })

  it('marquee selects intersecting items and renders the box', () => {
    const a = makePlacement({ x: 10, y: 10, width: 10, height: 10 })
    const d = makeDecoration({ data: { x: 30, y: 30, width: 10, height: 10 } })
    const far = makePlacement({ x: 900, y: 900, width: 10, height: 10 })
    const { controller, marquee } = setup([a, d, far])

    controller.pointerDown({ x: -50, y: -50 })
    controller.pointerMove({ x: 60, y: 60 })
    expect(marquee()).not.toBeNull()
    controller.pointerUp({ x: 60, y: 60 })
    expect(marquee()).toBeNull()
    expect(controller.selection.ids().sort()).toEqual([a.id, d.id].sort())
  })

  it('drops selected ids that vanish from the scene', () => {
    const a = makePlacement({ x: 0, y: 0, width: 20, height: 20 })
    const { controller } = setup([a])
    controller.selection.set([a.id])
    controller.setItems([])
    expect(controller.selection.size).toBe(0)
  })
})

describe('CanvasController gestures (invariant 25)', () => {
  it('commits exactly one TransformContent per completed drag', () => {
    const a = makePlacement({ x: 0, y: 0, width: 20, height: 20 })
    const b = makePlacement({ x: 5, y: 5, width: 20, height: 20 })
    const { controller, commits } = setup([a, b])
    controller.selection.set([a.id, b.id])

    controller.pointerDown({ x: 0, y: 0 })
    controller.pointerMove({ x: 50, y: 0 })
    controller.pointerMove({ x: 80, y: 20 })
    controller.pointerUp({ x: 80, y: 20 })

    expect(commits).toHaveLength(1)
    const payload = commits[0]!
    expect(payload.canvasId).toBe('canvas-1')
    expect(payload.items).toHaveLength(2)
    expect(payload.items[0]).toMatchObject({ kind: 'placement', x: 80, y: 20 })
  })

  it('a sub-threshold drag commits nothing', () => {
    const a = makePlacement({ x: 0, y: 0, width: 20, height: 20 })
    const { controller, commits } = setup([a])
    controller.pointerDown({ x: 0, y: 0 })
    controller.pointerMove({ x: 2, y: 1 })
    controller.pointerUp({ x: 2, y: 1 })
    expect(commits).toHaveLength(0)
  })

  it('Escape cancels: restores snapshots, commits nothing', () => {
    const a = makePlacement({ x: 0, y: 0, width: 20, height: 20 })
    const { controller, commits, restored } = setup([a])
    controller.pointerDown({ x: 0, y: 0 })
    controller.pointerMove({ x: 60, y: 60 })
    controller.escape()
    controller.pointerUp({ x: 60, y: 60 })
    expect(commits).toHaveLength(0)
    expect(restored).toEqual([a.id])
    expect(controller.state).toBe('idle')
  })

  it('space-drag pans instead of gesturing', () => {
    const a = makePlacement({ x: 0, y: 0, width: 20, height: 20 })
    const { controller, commits } = setup([a])
    controller.pointerDown({ x: 0, y: 0 }, { space: true })
    controller.pointerMove({ x: 100, y: 0 })
    controller.pointerUp({ x: 100, y: 0 })
    expect(commits).toHaveLength(0)
    expect(controller.camera.x).toBe(-100)
  })

  it('explicit beginGesture supports handle-driven gestures', () => {
    const a = makePlacement({ x: 0, y: 0, width: 20, height: 20 })
    const { controller, commits } = setup([a])
    controller.beginGesture([a], moveDriver, { x: 0, y: 0 })
    controller.pointerMove({ x: 30, y: 0 })
    controller.pointerUp({ x: 30, y: 0 })
    expect(commits).toHaveLength(1)
  })
})
