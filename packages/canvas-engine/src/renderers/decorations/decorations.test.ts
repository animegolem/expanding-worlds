import { Container, Graphics, Text } from 'pixi.js'
import { describe, expect, it } from 'vitest'
import { DEFAULT_STROKE, DEFAULT_STROKE_WIDTH } from '../../decoration-data'
import { fakeResources, makeDecoration, makePlacement } from '../../test-helpers'
import { placementRenderer } from '../placement'
import { connectorRenderer, connectorEndpoints } from './connector'
import {
  ARROW_HEAD_LENGTH_FACTOR,
  ARROW_HEAD_MAX_FRACTION,
  ARROW_HEAD_WIDTH_FACTOR,
  arrowPolygon,
  arrowRenderer,
  lineRenderer,
} from './line'
import { pathRenderer } from './path'
import { shapeArrowPolygon, shapeRenderer } from './shape'
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

  it('triangles stroke with round joins; rects keep miter corners', () => {
    // A sharp triangle apex under the default miter join (limit 10)
    // spikes up to 5x strokeWidth past the vertex at thick strokes
    // (AI-IMP-027); rect corners are fixed 90deg and stay miters.
    const strokeStyleOf = (shape: 'rect' | 'triangle'): string | undefined => {
      const item = makeDecoration({
        kind: 'shape',
        data: { shape, x: 0, y: 0, width: 20, height: 80, stroke: DEFAULT_STROKE, strokeWidth: 12 },
      })
      const object = shapeRenderer.create(item, fakeResources())
      const gfx = object.getChildByLabel('shape') as Graphics
      const instruction = gfx.context.instructions.find((i) => i.action === 'stroke')
      return instruction && 'style' in instruction.data ? instruction.data.style.join : undefined
    }
    expect(strokeStyleOf('triangle')).toBe('round')
    expect(strokeStyleOf('rect')).toBe('miter')
  })

  it('zero-size shapes do not crash', () => {
    for (const shape of ['rect', 'ellipse', 'triangle'] as const) {
      const item = makeDecoration({
        kind: 'shape',
        data: { shape, x: 10, y: 10, width: 0, height: 0, ...stroke },
      })
      const object = shapeRenderer.create(item, fakeResources())
      expect(object.getChildByLabel('shape')).not.toBeNull()
    }
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

  it('degenerate duplicate-point path does not crash', () => {
    const item = makeDecoration({
      kind: 'path',
      data: {
        points: [
          [5, 5],
          [5, 5],
        ],
        ...stroke,
      },
    })
    const object = pathRenderer.create(item, fakeResources())
    expect(object.getChildByLabel('path')).not.toBeNull()
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

/** Element-wise closeTo comparison for polygon coordinate arrays. */
function expectPoly(actual: number[], expected: number[]): void {
  expect(actual.length).toBe(expected.length)
  for (let i = 0; i < expected.length; i += 1) {
    expect(actual[i]).toBeCloseTo(expected[i]!, 9)
  }
}

describe('arrowPolygon', () => {
  const sw = { stroke: DEFAULT_STROKE, strokeWidth: 12 }

  it('produces the 7-point block silhouette for an axis-aligned arrow', () => {
    // length 50, thickness 12: shaft half 6, head half-width 18,
    // head length min(12 * 2.2, 50 * 0.6) = 26.4, base at x = 23.6.
    const poly = arrowPolygon({ x1: 0, y1: 0, x2: 50, y2: 0, ...sw })
    const base = 50 - 12 * ARROW_HEAD_LENGTH_FACTOR
    expectPoly(poly, [0, 6, base, 6, base, 18, 50, 0, base, -18, base, -6, 0, -6])
  })

  it('places the tip exactly at (x2,y2) and centers the tail edge on (x1,y1)', () => {
    const poly = arrowPolygon({ x1: 3, y1: -7, x2: 41, y2: 25, ...sw })
    expect(poly[6]).toBe(41)
    expect(poly[7]).toBe(25)
    expect((poly[0]! + poly[12]!) / 2).toBeCloseTo(3, 9)
    expect((poly[1]! + poly[13]!) / 2).toBeCloseTo(-7, 9)
  })

  it('is symmetric about the segment axis', () => {
    const data = { x1: 10, y1: 20, x2: 70, y2: -15, ...sw }
    const poly = arrowPolygon(data)
    const ux = (data.x2 - data.x1) / Math.hypot(data.x2 - data.x1, data.y2 - data.y1)
    const uy = (data.y2 - data.y1) / Math.hypot(data.x2 - data.x1, data.y2 - data.y1)
    // Reflecting point i across the axis line must yield point 6-i.
    for (let i = 0; i < 7; i += 1) {
      const dx = poly[i * 2]! - data.x1
      const dy = poly[i * 2 + 1]! - data.y1
      const along = dx * ux + dy * uy
      const across = dx * -uy + dy * ux
      const j = 6 - i
      const jdx = poly[j * 2]! - data.x1
      const jdy = poly[j * 2 + 1]! - data.y1
      expect(jdx * ux + jdy * uy).toBeCloseTo(along, 9)
      expect(jdx * -uy + jdy * ux).toBeCloseTo(-across, 9)
    }
  })

  it('clamps thickness to length/3 and the head to 60% of a short segment', () => {
    // §6.8 rev 0.12: strokeWidth 12 on a length-10 segment clamps to
    // an effective thickness of 10/3 — the silhouette stays an arrow.
    const poly = arrowPolygon({ x1: 0, y1: 0, x2: 10, y2: 0, ...sw })
    const thickness = 10 / 3
    const shaftHalf = thickness / 2
    const headHalf = (thickness * ARROW_HEAD_WIDTH_FACTOR) / 2
    const base = 10 * (1 - ARROW_HEAD_MAX_FRACTION) // head length clamps to 6
    expectPoly(poly, [
      0,
      shaftHalf,
      base,
      shaftHalf,
      base,
      headHalf,
      10,
      0,
      base,
      -headHalf,
      base,
      -shaftHalf,
      0,
      -shaftHalf,
    ])
  })

  it('leaves proportioned arrows unclamped', () => {
    // strokeWidth 12 on a length-100 segment: 12 < 100/3, no clamp.
    const poly = arrowPolygon({ x1: 0, y1: 0, x2: 100, y2: 0, ...sw })
    expect(poly[1]).toBeCloseTo(6) // shaft half stays strokeWidth/2
  })

  it('returns empty for zero-length or non-finite segments', () => {
    expect(arrowPolygon({ x1: 5, y1: 5, x2: 5, y2: 5, ...sw })).toEqual([])
    expect(arrowPolygon({ x1: 0, y1: 0, x2: Infinity, y2: 0, ...sw })).toEqual([])
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

  it('arrow renders one filled polygon, no strokes, bounds hugging the silhouette', () => {
    const thick = { x1: 0, y1: 0, x2: 50, y2: 0, stroke: DEFAULT_STROKE, strokeWidth: 12 }
    const arrow = arrowRenderer.create(makeDecoration({ kind: 'arrow', data: thick }), fakeResources())
    const gfx = arrow.getChildByLabel('line') as Graphics
    expect(gfx.context.instructions.map((i) => i.action)).toEqual(['fill'])
    const bounds = gfx.getLocalBounds()
    // No round-cap lump: nothing extends past the tail edge or the tip.
    expect(bounds.minX).toBe(0)
    expect(bounds.maxX).toBe(50)
    expect(bounds.minY).toBe(-18)
    expect(bounds.maxY).toBe(18)
  })

  it('zero-length arrow renders nothing instead of a stray head', () => {
    const degenerate = { x1: 5, y1: 5, x2: 5, y2: 5, ...stroke }
    const arrow = arrowRenderer.create(
      makeDecoration({ kind: 'arrow', data: degenerate }),
      fakeResources(),
    )
    const gfx = arrow.getChildByLabel('line') as Graphics
    expect(gfx.context.instructions).toHaveLength(0)
    expect(gfx.getLocalBounds().width).toBe(0)
  })

  it('zero-length line does not crash', () => {
    const degenerate = { x1: 5, y1: 5, x2: 5, y2: 5, ...stroke }
    const line = lineRenderer.create(
      makeDecoration({ kind: 'line', data: degenerate }),
      fakeResources(),
    )
    expect(line.getChildByLabel('line')).not.toBeNull()
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

describe('arrow shape variant (AI-IMP-038)', () => {
  it('pins the block silhouette to the box', () => {
    // 100×50 box: head length min(50, 45) = 45, shaft half 11, head
    // half 25; tip exactly at +w/2 on the axis.
    const poly = shapeArrowPolygon(100, 50)
    expectPoly(poly, [-50, -11, 5, -11, 5, -25, 50, 0, 5, 25, 5, 11, -50, 11])
  })

  it('renders the arrow variant centered with round joins', () => {
    const item = makeDecoration({
      kind: 'shape',
      data: { shape: 'arrow', x: 100, y: 100, width: 80, height: 40, ...stroke },
    })
    const object = shapeRenderer.create(item, fakeResources())
    expect(object.position.x).toBe(140)
    expect(object.position.y).toBe(120)
    const gfx = object.getChildByLabel('shape') as Graphics
    expect(gfx.getLocalBounds().width).toBeGreaterThanOrEqual(80)
    const instruction = gfx.context.instructions.find((i) => i.action === 'stroke')
    expect(instruction && 'style' in instruction.data ? instruction.data.style.join : null).toBe(
      'round',
    )
  })
})
