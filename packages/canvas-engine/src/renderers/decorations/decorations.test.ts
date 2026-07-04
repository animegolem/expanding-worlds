import { Container, Graphics, Text } from 'pixi.js'
import { describe, expect, it } from 'vitest'
import { DEFAULT_STROKE, DEFAULT_STROKE_WIDTH } from '../../decoration-data'
import { fakeResources, makeDecoration, makePlacement } from '../../test-helpers'
import { placementRenderer } from '../placement'
import { connectorRenderer, connectorEndpoints } from './connector'
import { arrowRenderer, lineRenderer } from './line'
import { pathRenderer } from './path'
import { shapeRenderer } from './shape'
import { textRenderer } from './text'
import type { RendererResources } from '../registry'

const stroke = { stroke: DEFAULT_STROKE, strokeWidth: DEFAULT_STROKE_WIDTH }

describe('text renderer', () => {
  it('renders world-positioned text with data.fontSize and color', () => {
    const item = makeDecoration({
      kind: 'text',
      data: { x: 40, y: 60, text: 'old beacon', fontSize: 24, color: '#ffcc00' },
    })
    const object = textRenderer.create(item, fakeResources())
    expect(object.position.x).toBe(40)
    expect(object.position.y).toBe(60)
    const text = object.getChildByLabel('text') as Text
    expect(text.text).toBe('old beacon')
    expect(text.style.fontSize).toBe(24)
    expect(text.visible).toBe(true)
  })

  it('updates in place and hides on invalid data', () => {
    const item = makeDecoration({
      kind: 'text',
      data: { x: 0, y: 0, text: 'a', fontSize: 16, color: '#fff' },
    })
    const object = textRenderer.create(item, fakeResources())
    textRenderer.update(
      object,
      { ...item, data: { ...item.data, text: 'b', x: 5 } },
      item,
      fakeResources(),
    )
    const text = object.getChildByLabel('text') as Text
    expect(text.text).toBe('b')
    expect(object.position.x).toBe(5)

    textRenderer.update(object, { ...item, data: { nope: true } }, item, fakeResources())
    expect(text.visible).toBe(false)
  })

  it('applies word wrap only when width is present', () => {
    const item = makeDecoration({
      kind: 'text',
      data: { x: 0, y: 0, text: 'wrap me', fontSize: 16, color: '#fff', width: 120 },
    })
    const object = textRenderer.create(item, fakeResources())
    const text = object.getChildByLabel('text') as Text
    expect(text.style.wordWrap).toBe(true)
    expect(text.style.wordWrapWidth).toBe(120)
  })
})

describe('shape renderer', () => {
  it('positions the container at the box center and applies rotation', () => {
    const item = makeDecoration({
      kind: 'shape',
      data: { shape: 'rect', x: 10, y: 20, width: 40, height: 20, rotation: 0.5, ...stroke },
    })
    const object = shapeRenderer.create(item, fakeResources())
    expect(object.position.x).toBe(30)
    expect(object.position.y).toBe(30)
    expect(object.rotation).toBe(0.5)
    const gfx = object.getChildByLabel('shape') as Graphics
    const bounds = gfx.getLocalBounds()
    expect(bounds.width).toBeGreaterThanOrEqual(40)
    expect(bounds.height).toBeGreaterThanOrEqual(20)
  })

  it('draws ellipse and triangle variants and survives invalid data', () => {
    for (const shape of ['ellipse', 'triangle'] as const) {
      const item = makeDecoration({
        kind: 'shape',
        data: { shape, x: 0, y: 0, width: 30, height: 12, ...stroke },
      })
      const object = shapeRenderer.create(item, fakeResources())
      const gfx = object.getChildByLabel('shape') as Graphics
      expect(gfx.getLocalBounds().width).toBeGreaterThan(0)
    }
    const bad = makeDecoration({ kind: 'shape', data: { x: 0, y: 0 } })
    const object = shapeRenderer.create(bad, fakeResources())
    const gfx = object.getChildByLabel('shape') as Graphics
    expect(gfx.getLocalBounds().width).toBe(0)
  })

  it('update rewrites geometry from new data', () => {
    const item = makeDecoration({
      kind: 'shape',
      data: { shape: 'rect', x: 0, y: 0, width: 10, height: 10, ...stroke },
    })
    const object = shapeRenderer.create(item, fakeResources())
    shapeRenderer.update(
      object,
      { ...item, data: { shape: 'rect', x: 100, y: 100, width: 8, height: 8, ...stroke } },
      item,
      fakeResources(),
    )
    expect(object.position.x).toBe(104)
    expect(object.position.y).toBe(104)
  })
})

describe('path renderer', () => {
  it('strokes a world-space polyline through data.points', () => {
    const item = makeDecoration({
      kind: 'path',
      data: {
        points: [
          [0, 0],
          [10, 5],
          [20, 0],
        ],
        ...stroke,
      },
    })
    const object = pathRenderer.create(item, fakeResources())
    expect(object.position.x).toBe(0)
    const gfx = object.getChildByLabel('path') as Graphics
    expect(gfx.getLocalBounds().width).toBeGreaterThanOrEqual(20)
  })

  it('renders nothing for invalid data and redraws on update', () => {
    const bad = makeDecoration({ kind: 'path', data: { points: [[0, 0]], ...stroke } })
    const object = pathRenderer.create(bad, fakeResources())
    const gfx = object.getChildByLabel('path') as Graphics
    expect(gfx.getLocalBounds().width).toBe(0)
    pathRenderer.update(
      object,
      {
        ...bad,
        data: {
          points: [
            [0, 0],
            [4, 4],
          ],
          ...stroke,
        },
      },
      bad,
      fakeResources(),
    )
    expect(gfx.getLocalBounds().width).toBeGreaterThan(0)
  })
})

describe('line and arrow renderers', () => {
  const data = { x1: 0, y1: 0, x2: 50, y2: 0, ...stroke }

  it('line draws one segment in world coordinates', () => {
    const item = makeDecoration({ kind: 'line', data })
    const object = lineRenderer.create(item, fakeResources())
    const gfx = object.getChildByLabel('line') as Graphics
    expect(gfx.getLocalBounds().width).toBeGreaterThanOrEqual(50)
  })

  it('arrow adds a head taller than the bare stroke', () => {
    const line = lineRenderer.create(makeDecoration({ kind: 'line', data }), fakeResources())
    const arrow = arrowRenderer.create(makeDecoration({ kind: 'arrow', data }), fakeResources())
    const lineH = (line.getChildByLabel('line') as Graphics).getLocalBounds().height
    const arrowH = (arrow.getChildByLabel('line') as Graphics).getLocalBounds().height
    expect(arrowH).toBeGreaterThan(lineH)
  })

  it('update redraws from new endpoints', () => {
    const item = makeDecoration({ kind: 'line', data })
    const object = lineRenderer.create(item, fakeResources())
    lineRenderer.update(
      object,
      { ...item, data: { ...data, x2: 200 } },
      item,
      fakeResources(),
    )
    const gfx = object.getChildByLabel('line') as Graphics
    expect(gfx.getLocalBounds().width).toBeGreaterThanOrEqual(200)
  })
})

function anchorResources(objects: Map<string, Container>): RendererResources {
  return { ...fakeResources(), resolveObject: (id) => objects.get(id) }
}

describe('connector renderer', () => {
  const data = { x1: 0, y1: 0, x2: 100, y2: 50, ...stroke }

  it('uses free endpoints from data when unanchored', () => {
    const item = makeDecoration({ kind: 'connector', data })
    const object = connectorRenderer.create(item, fakeResources()) as Container & {
      __endpoints?: { x1: number; y1: number; x2: number; y2: number }
    }
    expect(object.__endpoints).toEqual({ x1: 0, y1: 0, x2: 100, y2: 50 })
  })

  it('anchored endpoints resolve from the live placement object', () => {
    const placement = makePlacement({ x: 300, y: 200 })
    const placementObject = placementRenderer.create(placement, fakeResources())
    const objects = new Map([[placement.id, placementObject]])
    const item = makeDecoration({
      kind: 'connector',
      data,
      anchorEndPlacementId: placement.id,
    })
    const resources = anchorResources(objects)
    const object = connectorRenderer.create(item, resources) as Container & {
      __endpoints?: { x2: number; y2: number }
    }
    expect(object.__endpoints).toMatchObject({ x2: 300, y2: 200 })

    // The anchor moves (ephemeral drag or committed transform): the
    // per-frame onRender callback picks the new position up.
    placementObject.position.set(320, 260)
    ;(object.onRender as unknown as () => void)()
    expect(object.__endpoints).toMatchObject({ x2: 320, y2: 260 })
  })

  it('falls back to data when the anchored object is missing', () => {
    const item = makeDecoration({
      kind: 'connector',
      data,
      anchorStartPlacementId: 'gone',
    })
    const object = connectorRenderer.create(item, anchorResources(new Map())) as Container & {
      __endpoints?: { x1: number; y1: number }
    }
    expect(object.__endpoints).toMatchObject({ x1: 0, y1: 0 })
  })

  it('prefers the freed-anchor fallback written by the domain on release', () => {
    // Domain release semantics: anchor columns cleared, data.start /
    // data.end hold the last rendered position.
    const item = makeDecoration({
      kind: 'connector',
      data: { ...data, end: { x: 77, y: 88 } },
    })
    const object = connectorRenderer.create(item, fakeResources()) as Container & {
      __endpoints?: { x2: number; y2: number }
    }
    expect(object.__endpoints).toMatchObject({ x2: 77, y2: 88 })
  })

  it('update() re-resolves after item changes', () => {
    const item = makeDecoration({ kind: 'connector', data })
    const resources = fakeResources()
    const object = connectorRenderer.create(item, resources)
    connectorRenderer.update(
      object,
      { ...item, data: { ...data, x2: 5, y2: 5 } },
      item,
      resources,
    )
    expect((object as Container & { __endpoints?: object }).__endpoints).toEqual({
      x1: 0,
      y1: 0,
      x2: 5,
      y2: 5,
    })
  })

  it('connectorEndpoints rejects invalid data', () => {
    const item = makeDecoration({ kind: 'connector', data: { x1: 0 } })
    expect(connectorEndpoints(item, fakeResources())).toBeNull()
  })
})
