import { describe, expect, it } from 'vitest'
import { Camera, type Point } from '../camera'
import { makeDecoration, makePlacement } from '../test-helpers'
import { PATH_THIN_WORLD_UNITS, placementAt, type ToolCreateInput, type ToolPreview } from './draw-tools'
import { ToolManager, type ToolTarget } from './tool-mode'
import type { PointerModifiers } from '../controller'
import type { SceneItem } from '../types'

function fakeTarget(items: SceneItem[] = []) {
  const calls: Array<{ method: string; screen?: Point; modifiers?: PointerModifiers }> = []
  const camera = new Camera()
  const target: ToolTarget = {
    camera,
    items: () => items,
    pointerDown: (screen, modifiers) => calls.push({ method: 'down', screen, modifiers }),
    pointerMove: (screen, modifiers) => calls.push({ method: 'move', screen, modifiers }),
    pointerUp: (screen, modifiers) => calls.push({ method: 'up', screen, modifiers }),
    escape: () => calls.push({ method: 'escape' }),
  }
  return { target, calls, camera }
}

function setup(items: SceneItem[] = []) {
  const { target, calls, camera } = fakeTarget(items)
  const created: ToolCreateInput[] = []
  const previews: Array<ToolPreview | null> = []
  const highlights: Array<string | null> = []
  const tools = new ToolManager(target, {
    create: (input) => created.push(input),
    renderPreview: (p) => previews.push(p),
    highlightPlacement: (id) => highlights.push(id),
  })
  return { tools, target, calls, camera, created, previews, highlights }
}

describe('ToolManager routing', () => {
  it('select tool passes pointer events through to the controller unchanged', () => {
    const { tools, calls } = setup()
    tools.pointerDown({ x: 1, y: 2 }, { shift: true })
    tools.pointerMove({ x: 3, y: 4 })
    tools.pointerUp({ x: 5, y: 6 })
    expect(calls.map((c) => c.method)).toEqual(['down', 'move', 'up'])
    expect(calls[0]!.modifiers).toMatchObject({ shift: true })
  })

  it('space-pan delegates to the controller even with a draw tool active', () => {
    const { tools, calls, created } = setup()
    tools.setTool('rect')
    tools.pointerDown({ x: 0, y: 0 }, { space: true })
    tools.pointerMove({ x: 10, y: 10 }, { space: true })
    tools.pointerUp({ x: 10, y: 10 }, { space: true })
    expect(calls.map((c) => c.method)).toEqual(['down', 'move', 'up'])
    expect(created).toHaveLength(0)
  })

  it('non-primary buttons are ignored by draw tools', () => {
    const { tools, calls, created } = setup()
    tools.setTool('line')
    tools.pointerDown({ x: 0, y: 0 }, { button: 2 })
    tools.pointerUp({ x: 50, y: 0 }, { button: 2 })
    expect(created).toHaveLength(0)
    expect(calls).toHaveLength(0)
  })

  it('escape with no session forwards to the controller', () => {
    const { tools, calls } = setup()
    tools.setTool('rect')
    tools.escape()
    expect(calls.map((c) => c.method)).toEqual(['escape'])
  })

  it('notifies tool changes once per change', () => {
    const { tools } = setup()
    const seen: string[] = []
    tools.onChanged((t) => seen.push(t))
    tools.setTool('ellipse')
    tools.setTool('ellipse')
    tools.setTool('select')
    expect(seen).toEqual(['ellipse', 'select'])
  })
})

describe('draw gestures', () => {
  it('rect drag issues exactly one CreateDecoration with shape data', () => {
    const { tools, created, previews } = setup()
    tools.setTool('rect')
    tools.pointerDown({ x: 10, y: 20 })
    tools.pointerMove({ x: 70, y: 60 })
    tools.pointerUp({ x: 70, y: 60 })
    expect(created).toHaveLength(1)
    expect(created[0]).toEqual({
      kind: 'shape',
      data: {
        shape: 'rect',
        x: 10,
        y: 20,
        width: 60,
        height: 40,
        stroke: tools.style.stroke,
        strokeWidth: tools.style.strokeWidth,
      },
    })
    // A preview was rendered during the drag and cleared at the end.
    expect(previews.some((p) => p !== null)).toBe(true)
    expect(previews[previews.length - 1]).toBeNull()
  })

  it('reversed drags normalize to top-left origin, and fill flows from style', () => {
    const { tools, created } = setup()
    tools.setTool('ellipse')
    tools.style.fill = '#224466'
    tools.pointerDown({ x: 100, y: 100 })
    tools.pointerMove({ x: 40, y: 60 })
    tools.pointerUp({ x: 40, y: 60 })
    expect(created[0]!.data).toMatchObject({
      shape: 'ellipse',
      x: 40,
      y: 60,
      width: 60,
      height: 40,
      fill: '#224466',
    })
  })

  it('a click without drag creates nothing', () => {
    const { tools, created } = setup()
    for (const tool of ['rect', 'triangle', 'line', 'arrow', 'connector'] as const) {
      tools.setTool(tool)
      tools.pointerDown({ x: 5, y: 5 })
      tools.pointerUp({ x: 5, y: 5 })
    }
    expect(created).toHaveLength(0)
  })

  it('escape mid-drag cancels with zero commands and clears the preview', () => {
    const { tools, created, previews } = setup()
    tools.setTool('rect')
    tools.pointerDown({ x: 0, y: 0 })
    tools.pointerMove({ x: 50, y: 50 })
    tools.escape()
    tools.pointerUp({ x: 60, y: 60 })
    expect(created).toHaveLength(0)
    expect(previews[previews.length - 1]).toBeNull()
  })

  it('switching tools mid-drag cancels the session', () => {
    const { tools, created } = setup()
    tools.setTool('rect')
    tools.pointerDown({ x: 0, y: 0 })
    tools.pointerMove({ x: 50, y: 50 })
    tools.setTool('line')
    tools.pointerUp({ x: 50, y: 50 })
    expect(created).toHaveLength(0)
  })

  it('line and arrow store world endpoints', () => {
    const { tools, created, camera } = setup()
    camera.set({ x: 100, y: 100, zoom: 2 })
    tools.setTool('arrow')
    tools.pointerDown({ x: 0, y: 0 })
    tools.pointerMove({ x: 20, y: 10 })
    tools.pointerUp({ x: 20, y: 10 })
    expect(created[0]).toMatchObject({
      kind: 'arrow',
      data: { x1: 100, y1: 100, x2: 110, y2: 105 },
    })
  })

  it('freehand thins samples closer than the thinning distance', () => {
    const { tools, created } = setup()
    tools.setTool('path')
    tools.pointerDown({ x: 0, y: 0 })
    tools.pointerMove({ x: 0.5, y: 0 }) // < threshold: dropped
    tools.pointerMove({ x: PATH_THIN_WORLD_UNITS, y: 0 })
    tools.pointerMove({ x: PATH_THIN_WORLD_UNITS + 0.5, y: 0 }) // dropped
    tools.pointerMove({ x: PATH_THIN_WORLD_UNITS * 2, y: 0 })
    tools.pointerUp({ x: PATH_THIN_WORLD_UNITS * 2, y: 0 })
    expect(created).toHaveLength(1)
    expect(created[0]!.data['points']).toEqual([
      [0, 0],
      [PATH_THIN_WORLD_UNITS, 0],
      [PATH_THIN_WORLD_UNITS * 2, 0],
    ])
  })
})

describe('connector tool anchoring', () => {
  const placement = makePlacement({ x: 200, y: 100, width: 40, height: 40 })

  it('highlights the placement under the dragged endpoint and anchors on commit', () => {
    const { tools, created, highlights } = setup([placement])
    tools.setTool('connector')
    tools.pointerDown({ x: 20, y: 20 })
    tools.pointerMove({ x: 100, y: 60 })
    tools.pointerMove({ x: 200, y: 100 }) // over the placement
    tools.pointerUp({ x: 200, y: 100 })
    expect(highlights).toContain(placement.id)
    expect(highlights[highlights.length - 1]).toBeNull()
    expect(created).toHaveLength(1)
    expect(created[0]).toMatchObject({
      kind: 'connector',
      anchorStartPlacementId: null,
      anchorEndPlacementId: placement.id,
    })
    // The stored end point seeds the fallback with the anchor position.
    expect(created[0]!.data).toMatchObject({ x1: 20, y1: 20, x2: 200, y2: 100 })
  })

  it('anchors the start endpoint when the drag begins on a placement', () => {
    const { tools, created } = setup([placement])
    tools.setTool('connector')
    tools.pointerDown({ x: 205, y: 95 })
    tools.pointerMove({ x: 400, y: 300 })
    tools.pointerUp({ x: 400, y: 300 })
    expect(created[0]).toMatchObject({
      kind: 'connector',
      anchorStartPlacementId: placement.id,
      anchorEndPlacementId: null,
    })
    expect(created[0]!.data).toMatchObject({ x1: 200, y1: 100, x2: 400, y2: 300 })
  })

  it('empty space on both ends leaves both endpoints free', () => {
    const { tools, created } = setup([placement])
    tools.setTool('connector')
    tools.pointerDown({ x: 400, y: 400 })
    tools.pointerMove({ x: 500, y: 500 })
    tools.pointerUp({ x: 500, y: 500 })
    expect(created[0]).toMatchObject({
      anchorStartPlacementId: null,
      anchorEndPlacementId: null,
    })
  })

  it('placementAt ignores decorations covering the placement', () => {
    const cover = makeDecoration({
      kind: 'shape',
      data: { shape: 'rect', x: 150, y: 50, width: 200, height: 200, stroke: '#fff', strokeWidth: 2 },
    })
    expect(placementAt({ x: 200, y: 100 }, [placement, cover])?.id).toBe(placement.id)
    expect(placementAt({ x: 500, y: 500 }, [placement, cover])).toBeNull()
  })
})

describe('text tool', () => {
  it('click hands the world point to the text-entry hook without creating', () => {
    const { tools, created, camera } = setup()
    camera.set({ x: 50, y: 0, zoom: 2 })
    const placed: Point[] = []
    tools.onPlaceText = (world) => placed.push(world)
    tools.setTool('text')
    tools.pointerDown({ x: 100, y: 40 })
    tools.pointerUp({ x: 100, y: 40 })
    expect(placed).toEqual([{ x: 100, y: 20 }])
    expect(created).toHaveLength(0)
  })
})
