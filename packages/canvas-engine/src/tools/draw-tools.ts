import { Container, Graphics } from 'pixi.js'
import { ARROW_LEGIBLE_SCREEN_PX, STROKE_LEGIBLE_SCREEN_PX } from '../decoration-data'
import { hitTest, itemWorldAABB } from '../hit-test'
import { arrowPolygon } from '../renderers/decorations/line'
import { diamondPolygon, shapeArrowPolygon } from '../renderers/decorations/shape'
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
  update(world: Point, modifiers?: DrawModifiers): DrawUpdate
  /** Null means degenerate: no command may be issued. */
  finish(world: Point, modifiers?: DrawModifiers): ToolCreateInput | null
}

/** §6.8 rev 0.12: Shift constrains to the tidy form while drawing —
 * canonical shape proportions, 45°-stepped segments. */
export interface DrawModifiers {
  shift?: boolean
}

const OCTANT = Math.PI / 4

/** Snaps `end` onto the nearest 45° ray from `start`, length kept. */
export function constrainSegmentTo45(start: Point, end: Point): Point {
  const length = dist(start, end)
  if (length === 0) return end
  const angle = Math.round(Math.atan2(end.y - start.y, end.x - start.x) / OCTANT) * OCTANT
  return { x: start.x + length * Math.cos(angle), y: start.y + length * Math.sin(angle) }
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

type ShapeVariant = 'rect' | 'ellipse' | 'triangle' | 'diamond' | 'arrow'

class ShapeSession implements DrawSession {
  #shape: ShapeVariant
  #start: Point
  #current: Point
  #style: ToolStyle
  #minDrag: number
  #strokeWidth: number

  constructor(
    shape: ShapeVariant,
    start: Point,
    style: ToolStyle,
    minDrag: number,
    strokeWidth: number,
  ) {
    this.#shape = shape
    this.#start = start
    this.#current = start
    this.#style = style
    this.#minDrag = minDrag
    this.#strokeWidth = strokeWidth
  }

  #data(shift: boolean): Record<string, unknown> {
    const dx = this.#current.x - this.#start.x
    const dy = this.#current.y - this.#start.y
    let width = Math.abs(dx)
    let height = Math.abs(dy)
    if (shift) {
      // Canonical proportions (§6.8 rev 0.12/0.13): square, circle,
      // an equilateral triangle, or a 2:1 arrow box, grown from the
      // dominant drag extent.
      width = Math.max(width, height)
      height =
        this.#shape === 'triangle'
          ? (width * Math.sqrt(3)) / 2
          : this.#shape === 'arrow'
            ? width / 2
            : width
    }
    const x = dx >= 0 ? this.#start.x : this.#start.x - width
    const y = dy >= 0 ? this.#start.y : this.#start.y - height
    return {
      shape: this.#shape,
      x,
      y,
      width,
      height,
      stroke: this.#style.stroke,
      strokeWidth: this.#strokeWidth,
      ...(this.#style.fill !== null ? { fill: this.#style.fill } : {}),
    }
  }

  update(world: Point, modifiers?: DrawModifiers): DrawUpdate {
    this.#current = world
    return {
      preview: { kind: 'shape', data: this.#data(modifiers?.shift ?? false) },
      hoverPlacementId: null,
    }
  }

  finish(world: Point, modifiers?: DrawModifiers): ToolCreateInput | null {
    this.#current = world
    const data = this.#data(modifiers?.shift ?? false)
    if ((data['width'] as number) < this.#minDrag && (data['height'] as number) < this.#minDrag) {
      return null
    }
    return { kind: 'shape', data }
  }
}

class PathSession implements DrawSession {
  #points: Array<[number, number]>
  #style: ToolStyle
  #strokeWidth: number

  constructor(start: Point, style: ToolStyle, strokeWidth: number) {
    this.#points = [[start.x, start.y]]
    this.#style = style
    this.#strokeWidth = strokeWidth
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
      strokeWidth: this.#strokeWidth,
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
  #strokeWidth: number

  constructor(
    kind: 'line' | 'arrow' | 'connector',
    start: Point,
    style: ToolStyle,
    minDrag: number,
    items: () => readonly SceneItem[],
    strokeWidth: number,
  ) {
    this.#kind = kind
    this.#start = start
    this.#current = start
    this.#style = style
    this.#minDrag = minDrag
    this.#items = items
    this.#startAnchor = kind === 'connector' ? placementAt(start, items()) : null
    this.#strokeWidth = strokeWidth
  }

  #data(): Record<string, unknown> {
    return {
      x1: this.#start.x,
      y1: this.#start.y,
      x2: this.#current.x,
      y2: this.#current.y,
      stroke: this.#style.stroke,
      strokeWidth: this.#strokeWidth,
    }
  }

  update(world: Point, modifiers?: DrawModifiers): DrawUpdate {
    this.#current = modifiers?.shift ? constrainSegmentTo45(this.#start, world) : world
    const hover = this.#kind === 'connector' ? placementAt(this.#current, this.#items()) : null
    return {
      preview: { kind: this.#kind, data: this.#data() },
      hoverPlacementId: hover?.id ?? null,
    }
  }

  finish(world: Point, modifiers?: DrawModifiers): ToolCreateInput | null {
    this.#current = modifiers?.shift ? constrainSegmentTo45(this.#start, world) : world
    if (dist(this.#start, this.#current) < this.#minDrag) return null
    if (this.#kind !== 'connector') return { kind: this.#kind, data: this.#data() }
    const endAnchor = placementAt(this.#current, this.#items())
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
  | 'diamond'
  | 'shape-arrow'
  | 'path'
  | 'line'
  | 'arrow'
  | 'connector'

/**
 * §6.8 rev 0.14: strokes are born legible at the creating viewport —
 * a screen-pixel baseline (pen arrows get a thicker one so the head
 * reads) scaled by the toolbar's weight multiplier, converted to a
 * fixed world width at the creating zoom.
 */
export function legibleStrokeWidth(
  tool: DrawToolKind,
  strokeScale: number,
  zoom: number,
): number {
  const basePx = tool === 'arrow' ? ARROW_LEGIBLE_SCREEN_PX : STROKE_LEGIBLE_SCREEN_PX
  return (basePx * strokeScale) / Math.max(zoom, 1e-6)
}

export function beginDrawSession(
  tool: DrawToolKind,
  startWorld: Point,
  style: ToolStyle,
  opts: { zoom: number; items: () => readonly SceneItem[] },
): DrawSession {
  const minDrag = MIN_DRAG_SCREEN_PX / Math.max(opts.zoom, 1e-6)
  const strokeWidth = legibleStrokeWidth(tool, style.strokeScale, opts.zoom)
  switch (tool) {
    case 'rect':
    case 'ellipse':
    case 'triangle':
    case 'diamond':
      return new ShapeSession(tool, startWorld, style, minDrag, strokeWidth)
    case 'shape-arrow':
      return new ShapeSession('arrow', startWorld, style, minDrag, strokeWidth)
    case 'path':
      return new PathSession(startWorld, style, strokeWidth)
    case 'line':
    case 'arrow':
    case 'connector':
      return new SegmentSession(tool, startWorld, style, minDrag, opts.items, strokeWidth)
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
        if (shape === 'arrow') {
          const cx = d['x']! + d['width']! / 2
          const cy = d['y']! + d['height']! / 2
          const points = shapeArrowPolygon(d['width']!, d['height']!)
          const world: number[] = []
          for (let i = 0; i < points.length; i += 2) {
            world.push(cx + points[i]!, cy + points[i + 1]!)
          }
          gfx.poly(world)
        } else if (shape === 'ellipse') {
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
        } else if (shape === 'diamond') {
          const cx = d['x']! + d['width']! / 2
          const cy = d['y']! + d['height']! / 2
          const points = diamondPolygon(d['width']!, d['height']!)
          const world: number[] = []
          for (let i = 0; i < points.length; i += 2) {
            world.push(cx + points[i]!, cy + points[i + 1]!)
          }
          gfx.poly(world)
        } else {
          gfx.rect(d['x']!, d['y']!, d['width']!, d['height']!)
        }
        // WYSIWYG (AI-IMP-040): the preview shows the final result —
        // fill included — not a wireframe that pops at commit.
        const fill = preview.data['fill'] as string | undefined
        if (fill !== undefined) gfx.fill({ color: fill, alpha: PREVIEW_ALPHA })
        gfx.stroke(stroke)
      } else if (preview.kind === 'path' && d.points && d.points.length > 0) {
        const [first, ...rest] = d.points
        gfx.moveTo(first![0], first![1])
        for (const [x, y] of rest) gfx.lineTo(x, y)
        gfx.stroke({ ...stroke, cap: 'round', join: 'round' })
      } else if (preview.kind === 'arrow') {
        // The pen arrow previews as its true block silhouette, not a
        // bare segment (AI-IMP-040).
        const points = arrowPolygon({
          x1: d['x1']!,
          y1: d['y1']!,
          x2: d['x2']!,
          y2: d['y2']!,
          stroke: stroke.color as string,
          strokeWidth: stroke.width,
        })
        if (points.length > 0) gfx.poly(points).fill({ color: stroke.color, alpha: PREVIEW_ALPHA })
      } else if (preview.kind === 'line' || preview.kind === 'connector') {
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
