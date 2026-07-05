import { isLineData } from './decoration-data'
import { arrowPolygon } from './renderers/decorations/line'
import { DEFAULT_DOT_RADIUS } from './renderers/placement'
import type { Point, Rect } from './camera'
import type { SceneDecoration, SceneItem, ScenePlacement } from './types'

/**
 * Hit-testing policy (§13.1): walk the shared content plane top-down
 * by render order; locked and hidden decorations never hit; the
 * background plane is not part of the walk (§6.7: backgrounds are
 * selectable only in the explicit edit mode, AI-IMP-022). Placements
 * test against their rotated body rect; decorations against the AABB
 * of their data geometry.
 */

export function placementSize(item: ScenePlacement): { width: number; height: number } {
  const width = item.width ?? item.assetWidth ?? DEFAULT_DOT_RADIUS * 2
  const height = item.height ?? item.assetHeight ?? DEFAULT_DOT_RADIUS * 2
  return { width: width * item.scale, height: height * item.scale }
}

function inflate(rect: Rect, pad: number): Rect {
  if (pad <= 0) return rect
  return { x: rect.x - pad, y: rect.y - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 }
}

/**
 * Visual bounds, stroke included (AI-IMP-029): strokes center on the
 * geometry edge, so the drawn body extends strokeWidth/2 beyond the
 * raw coordinates — round caps/joins and 90° rect miters land exactly
 * on the half-width-inflated box. Block arrows use their exact filled
 * silhouette. Selection outlines, hit areas, marquees, snapping, and
 * alignment all read these bounds, so they agree with what's on
 * screen.
 */
function decorationAABB(item: SceneDecoration): Rect | null {
  const d = item.data as Record<string, unknown>
  const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
  const strokePad = num(d['strokeWidth']) ? d['strokeWidth'] / 2 : 0
  if (item.kind === 'arrow' && isLineData(item.data)) {
    const points = arrowPolygon(item.data)
    if (points.length >= 2) {
      const xs = points.filter((_, i) => i % 2 === 0)
      const ys = points.filter((_, i) => i % 2 === 1)
      const x = Math.min(...xs)
      const y = Math.min(...ys)
      return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y }
    }
  }
  if (num(d['x1']) && num(d['y1']) && num(d['x2']) && num(d['y2'])) {
    const x = Math.min(d['x1'], d['x2'])
    const y = Math.min(d['y1'], d['y2'])
    return inflate(
      { x, y, width: Math.abs(d['x2'] - d['x1']), height: Math.abs(d['y2'] - d['y1']) },
      strokePad,
    )
  }
  if (Array.isArray(d['points']) && d['points'].length > 0) {
    const points = d['points'] as Array<[number, number]>
    const xs = points.map((p) => p[0])
    const ys = points.map((p) => p[1])
    const x = Math.min(...xs)
    const y = Math.min(...ys)
    return inflate(
      { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y },
      strokePad,
    )
  }
  if (num(d['x']) && num(d['y'])) {
    const width = num(d['width']) ? d['width'] : 0
    const height = num(d['height']) ? d['height'] : 0
    return inflate({ x: d['x'], y: d['y'], width, height }, strokePad)
  }
  return null
}

/** Axis-aligned world bounds; placements include rotation expansion. */
export function itemWorldAABB(item: SceneItem): Rect | null {
  if (item.itemKind === 'decoration') return decorationAABB(item)
  const { width, height } = placementSize(item)
  const cos = Math.abs(Math.cos(item.rotation))
  const sin = Math.abs(Math.sin(item.rotation))
  const w = width * cos + height * sin
  const h = width * sin + height * cos
  return { x: item.x - w / 2, y: item.y - h / 2, width: w, height: h }
}

function pointInPlacement(point: Point, item: ScenePlacement): boolean {
  const { width, height } = placementSize(item)
  // Rotate the point into the placement's local frame about its center.
  const dx = point.x - item.x
  const dy = point.y - item.y
  const cos = Math.cos(-item.rotation)
  const sin = Math.sin(-item.rotation)
  const localX = dx * cos - dy * sin
  const localY = dx * sin + dy * cos
  return Math.abs(localX) <= width / 2 && Math.abs(localY) <= height / 2
}

const HIT_SLOP = 4

function pointInRect(point: Point, rect: Rect, slop = 0): boolean {
  return (
    point.x >= rect.x - slop &&
    point.x <= rect.x + rect.width + slop &&
    point.y >= rect.y - slop &&
    point.y <= rect.y + rect.height + slop
  )
}

export function isHittable(item: SceneItem): boolean {
  return item.itemKind === 'placement' || (item.locked !== 1 && item.hidden !== 1)
}

/** Topmost hit or null. `items` arrive render_order-sorted (bottom first). */
export function hitTest(point: Point, items: readonly SceneItem[]): SceneItem | null {
  for (let i = items.length - 1; i >= 0; i -= 1) {
    const item = items[i]!
    if (!isHittable(item)) continue
    if (item.itemKind === 'placement') {
      if (pointInPlacement(point, item)) return item
    } else {
      const aabb = decorationAABB(item)
      if (aabb && pointInRect(point, aabb, HIT_SLOP)) return item
    }
  }
  return null
}

function rectsIntersect(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
}

/** Marquee: every hittable item whose AABB intersects the world rect. */
export function marqueeHits(rect: Rect, items: readonly SceneItem[]): SceneItem[] {
  return items.filter((item) => {
    if (!isHittable(item)) return false
    const aabb = itemWorldAABB(item)
    return aabb !== null && rectsIntersect(rect, aabb)
  })
}

/** Union AABB of the given items (zoom-to-selection, handle frames). */
export function unionBounds(items: readonly SceneItem[]): Rect | null {
  let bounds: Rect | null = null
  for (const item of items) {
    const aabb = itemWorldAABB(item)
    if (!aabb) continue
    if (!bounds) {
      bounds = { ...aabb }
      continue
    }
    const x = Math.min(bounds.x, aabb.x)
    const y = Math.min(bounds.y, aabb.y)
    bounds = {
      x,
      y,
      width: Math.max(bounds.x + bounds.width, aabb.x + aabb.width) - x,
      height: Math.max(bounds.y + bounds.height, aabb.y + aabb.height) - y,
    }
  }
  return bounds
}
