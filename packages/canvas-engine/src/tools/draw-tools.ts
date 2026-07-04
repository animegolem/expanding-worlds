import { Container, Graphics } from 'pixi.js'
import { hitTest, itemWorldAABB } from '../hit-test'
import type { Point } from '../camera'
import type { ScenePlacement, SceneItem } from '../types'
import type { ToolStyle } from './tool-mode'

/**
 * Draw sessions (AI-IMP-021): one pointer drag defines the geometry
 * of one decoration. A session accumulates world-space points,
 * produces an ephemeral preview, and on finish() yields the single
 * CreateDecoration input — or null for a degenerate gesture (plain
 * click), which must issue zero commands. Escape simply drops the
 * session (§10.2: nothing durable exists before commit).
 */

export interface ToolCreateInput {
  kind: 'text' | 'path' | 'shape' | 'line' | 'arrow' | 'connector'
  data: Record<string, unknown>
  anchorStartPlacementId?: string | null
  anchorEndPlacementId?: string | null
}

export interface ToolPreview {
  kind: 'shape' | 'path' | 'line' | 'arrow' | 'connector'
  data: Record<string, unknown>
}

export interface DrawUpdate {
  preview: ToolPreview | null
  /** Connector tool: placement currently under the dragged endpoint. */
  hoverPlacementId: string | null
}

export interface DrawSession {
  update(world: Point): DrawUpdate
  /** Null means degenerate: no command may be issued. */
  finish(world: Point): ToolCreateInput | null
}

/** Light freehand thinning: keep samples at least this far apart (world units). */
export const PATH_THIN_WORLD_UNITS = 2

/** Minimum world-space drag extent (scaled by 1/zoom at begin) below which a gesture is a click. */
const MIN_DRAG_SCREEN_PX = 4

function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

/** Topmost active placement under a world point (decorations never anchor). */
export function placementAt(world: Point, items: readonly SceneItem[]): ScenePlacement | null {
  const placements = items.filter((item) => item.itemKind === 'placement')
  return (hitTest(world, placements) as ScenePlacement | null) ?? null
}

type ShapeVariant = 'rect' | 'ellipse' | 'triangle'

class ShapeSession implements DrawSession {
  #shape: ShapeVariant
  #start: Point
  #current: Point
  #style: ToolStyle
  #minDrag: number

  constructor(shape: ShapeVariant, start: Point, style: ToolStyle, minDrag: number) {
    this.#shape = shape
    this.#start = start
    this.#current = start
    this.#style = style
    this.#minDrag = minDrag
  }

  #data(): Record<string, unknown> {
    const x = Math.min(this.#start.x, this.#current.x)
    const y = Math.min(this.#start.y, this.#current.y)
    return {
      shape: this.#shape,
      x,
      y,
      width: Math.abs(this.#current.x - this.#start.x),
      height: Math.abs(this.#current.y - this.#start.y),
      stroke: this.#style.stroke,
      strokeWidth: this.#style.strokeWidth,
      ...(this.#style.fill !== null ? { fill: this.#style.fill } : {}),
    }
  }

  update(world: Point): DrawUpdate {
    this.#current = world
    return { preview: { kind: 'shape', data: this.#data() }, hoverPlacementId: null }
  }

  finish(world: Point): ToolCreateInput | null {
    this.#current = world
    const data = this.#data()
    if ((data['width'] as number) < this.#minDrag && (data['height'] as number) < this.#minDrag) {
      return null
    }
    return { kind: 'shape', data }
  }
}

class PathSession implements DrawSession {
  #points: Array<[number, number]>
  #style: ToolStyle

  constructor(start: Point, style: ToolStyle) {
    this.#points = [[start.x, start.y]]
    this.#style = style
  }

  #push(world: Point): void {
    const last = this.#points[this.#points.length - 1]!
    if (dist({ x: last[0], y: last[1] }, world) >= PATH_THIN_WORLD_UNITS) {
      this.#points.push([world.x, world.y])
    }
  }

  #data(): Record<string, unknown> {
    return {
      points: this.#points,
      stroke: this.#style.stroke,
      strokeWidth: this.#style.strokeWidth,
    }
  }

  update(world: Point): DrawUpdate {
    this.#push(world)
    return { preview: { kind: 'path', data: this.#data() }, hoverPlacementId: null }
  }

  finish(world: Point): ToolCreateInput | null {
    this.#push(world)
    if (this.#points.length < 2) return null
    return { kind: 'path', data: this.#data() }
  }
}

class SegmentSession implements DrawSession {
  #kind: 'line' | 'arrow' | 'connector'
  #start: Point
  #current: Point
  #style: ToolStyle
  #minDrag: number
  #items: () => readonly SceneItem[]
  #startAnchor: ScenePlacement | null

  constructor(
    kind: 'line' | 'arrow' | 'connector',
    start: Point,
    style: ToolStyle,
    minDrag: number,
    items: () => readonly SceneItem[],
  ) {
    this.#kind = kind
    this.#start = start
    this.#current = start
    this.#style = style
    this.#minDrag = minDrag
    this.#items = items
    this.#startAnchor = kind === 'connector' ? placementAt(start, items()) : null
  }

  #data(): Record<string, unknown> {
    return {
      x1: this.#start.x,
      y1: this.#start.y,
      x2: this.#current.x,
      y2: this.#current.y,
      stroke: this.#style.stroke,
      strokeWidth: this.#style.strokeWidth,
    }
  }

  update(world: Point): DrawUpdate {
    this.#current = world
    const hover = this.#kind === 'connector' ? placementAt(world, this.#items()) : null
    return {
      preview: { kind: this.#kind, data: this.#data() },
      hoverPlacementId: hover?.id ?? null,
    }
  }

  finish(world: Point): ToolCreateInput | null {
    this.#current = world
    if (dist(this.#start, this.#current) < this.#minDrag) return null
    if (this.#kind !== 'connector') return { kind: this.#kind, data: this.#data() }
    const endAnchor = placementAt(world, this.#items())
    // Anchored endpoints still store a point: the free/fallback
    // position, seeded with the placement's position at creation.
    const data = this.#data()
    if (this.#startAnchor) {
      data['x1'] = this.#startAnchor.x
      data['y1'] = this.#startAnchor.y
    }
    if (endAnchor) {
      data['x2'] = endAnchor.x
      data['y2'] = endAnchor.y
    }
    return {
      kind: 'connector',
      data,
      anchorStartPlacementId: this.#startAnchor?.id ?? null,
      anchorEndPlacementId: endAnchor?.id ?? null,
    }
  }
}

export type DrawToolKind =
  | 'rect'
  | 'ellipse'
  | 'triangle'
  | 'path'
  | 'line'
  | 'arrow'
  | 'connector'

export function beginDrawSession(
  tool: DrawToolKind,
  startWorld: Point,
  style: ToolStyle,
  opts: { zoom: number; items: () => readonly SceneItem[] },
): DrawSession {
  const minDrag = MIN_DRAG_SCREEN_PX / Math.max(opts.zoom, 1e-6)
  switch (tool) {
    case 'rect':
    case 'ellipse':
    case 'triangle':
      return new ShapeSession(tool, startWorld, style, minDrag)
    case 'path':
      return new PathSession(startWorld, style)
    case 'line':
    case 'arrow':
    case 'connector':
      return new SegmentSession(tool, startWorld, style, minDrag, opts.items)
  }
}

const PREVIEW_ALPHA = 0.9
const HIGHLIGHT_COLOR = 0x4a9df0

/**
 * World-space ephemeral overlay for tool previews and connector
 * anchor-target highlights. Lives under the camera-transformed world
 * container (a sibling of the content plane), so preview geometry is
 * authored in the same world units it will commit as.
 */
export class ToolOverlay {
  #gfx = new Graphics()
  #items: () => readonly SceneItem[]
  #preview: ToolPreview | null = null
  #highlightId: string | null = null

  constructor(parent: Container, items: () => readonly SceneItem[]) {
    this.#gfx.label = 'tool-overlay'
    parent.addChild(this.#gfx)
    this.#items = items
  }

  renderPreview(preview: ToolPreview | null): void {
    this.#preview = preview
    this.#draw()
  }

  highlightPlacement(placementId: string | null): void {
    this.#highlightId = placementId
    this.#draw()
  }

  clear(): void {
    this.#preview = null
    this.#highlightId = null
    this.#draw()
  }

  #draw(): void {
    const gfx = this.#gfx
    gfx.clear()
    const preview = this.#preview
    if (preview) {
      const d = preview.data as Record<string, number> & { points?: Array<[number, number]> }
      const stroke = {
        width: (preview.data['strokeWidth'] as number) ?? 2,
        color: (preview.data['stroke'] as string) ?? '#dde3ea',
        alpha: PREVIEW_ALPHA,
      }
      if (preview.kind === 'shape') {
        const shape = preview.data['shape'] as string
        if (shape === 'ellipse') {
          gfx.ellipse(d['x']! + d['width']! / 2, d['y']! + d['height']! / 2, d['width']! / 2, d['height']! / 2)
        } else if (shape === 'triangle') {
          gfx.poly([
            d['x']! + d['width']! / 2,
            d['y']!,
            d['x']! + d['width']!,
            d['y']! + d['height']!,
            d['x']!,
            d['y']! + d['height']!,
          ])
        } else {
          gfx.rect(d['x']!, d['y']!, d['width']!, d['height']!)
        }
        gfx.stroke(stroke)
      } else if (preview.kind === 'path' && d.points && d.points.length > 0) {
        const [first, ...rest] = d.points
        gfx.moveTo(first![0], first![1])
        for (const [x, y] of rest) gfx.lineTo(x, y)
        gfx.stroke({ ...stroke, cap: 'round', join: 'round' })
      } else if (preview.kind === 'line' || preview.kind === 'arrow' || preview.kind === 'connector') {
        gfx.moveTo(d['x1']!, d['y1']!).lineTo(d['x2']!, d['y2']!).stroke(stroke)
      }
    }
    if (this.#highlightId) {
      const item = this.#items().find((i) => i.id === this.#highlightId)
      const aabb = item ? itemWorldAABB(item) : null
      if (aabb) {
        gfx
          .rect(aabb.x - 4, aabb.y - 4, aabb.width + 8, aabb.height + 8)
          .stroke({ width: 2, color: HIGHLIGHT_COLOR })
      }
    }
  }

  destroy(): void {
    this.#gfx.destroy()
  }
}
