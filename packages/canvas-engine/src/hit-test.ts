import { isLineData, isTextData } from './decoration-data'
import { arrowPolygon } from './renderers/decorations/line'
import { DEFAULT_DOT_RADIUS, placementLabelWorldBottom } from './renderers/placement'
import { pinEffectiveDiameterWorld } from './pin-geometry'
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
  if (item.appearanceKind === 'dot') {
    const diameter = pinEffectiveDiameterWorld(item)
    return { width: diameter, height: diameter }
  }
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
  if (item.kind === 'text' && isTextData(item.data)) {
    // Measured extents from the entry overlay when present; a font
    // -metric estimate otherwise so legacy rows stay selectable.
    const t = item.data
    const lines = t.text.split('\n')
    const longest = lines.reduce((max, line) => Math.max(max, line.length), 1)
    const width = t.measuredWidth ?? Math.max(longest * t.fontSize * 0.55, t.fontSize)
    const height = t.measuredHeight ?? lines.length * t.fontSize * 1.2
    return { x: t.x, y: t.y, width, height }
  }
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
    const rotation = num(d['rotation']) ? d['rotation'] : 0
    if (rotation !== 0) {
      // Stroke-including outer box, rotated about the shape center:
      // exact for 90° miters, and what cull/marquee/outline must see.
      const ow = width + strokePad * 2
      const oh = height + strokePad * 2
      const cx = d['x'] + width / 2
      const cy = d['y'] + height / 2
      const cos = Math.abs(Math.cos(rotation))
      const sin = Math.abs(Math.sin(rotation))
      const w = ow * cos + oh * sin
      const h = ow * sin + oh * cos
      return { x: cx - w / 2, y: cy - h / 2, width: w, height: h }
    }
    return inflate({ x: d['x'], y: d['y'], width, height }, strokePad)
  }
  return null
}

/** Unrotated body box + orientation: the frame cursor zones and
 * selection chrome share. Stroke included for shapes (AI-IMP-029). */
export interface OrientedBox {
  cx: number
  cy: number
  halfW: number
  halfH: number
  /** Radians about (cx, cy). */
  rotation: number
}

/**
 * Oriented visual box for single-selection chrome and cursor zones
 * (AI-IMP-031/062). Null for kinds with no oriented rect (lines,
 * paths, text, connectors) — callers fall back to the axis-aligned
 * bounds.
 */
export function orientedBox(item: SceneItem): OrientedBox | null {
  if (item.itemKind === 'placement') {
    const size = placementSize(item)
    return {
      cx: item.x,
      cy: item.y,
      halfW: size.width / 2,
      halfH: size.height / 2,
      rotation: item.rotation,
    }
  }
  if (item.kind === 'shape') {
    const d = item.data as Record<string, unknown>
    const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
    if (!num(d['x']) || !num(d['y']) || !num(d['width']) || !num(d['height'])) return null
    const strokePad = num(d['strokeWidth']) ? d['strokeWidth'] / 2 : 0
    return {
      cx: d['x'] + d['width'] / 2,
      cy: d['y'] + d['height'] / 2,
      halfW: d['width'] / 2 + strokePad,
      halfH: d['height'] / 2 + strokePad,
      rotation: num(d['rotation']) ? d['rotation'] : 0,
    }
  }
  return null
}

/**
 * Oriented body corners for single-selection chrome (AI-IMP-031):
 * the visual box (stroke included for shapes) rotated with the item,
 * in nw/ne/se/sw order of the unrotated frame. Null for kinds with
 * no oriented rect (lines, paths, text, connectors) — chrome falls
 * back to the axis-aligned bounds.
 */
export function orientedCorners(item: SceneItem): [Point, Point, Point, Point] | null {
  const box = orientedBox(item)
  if (!box) return null
  const { cx, cy, halfW, halfH, rotation } = box
  const cos = Math.cos(rotation)
  const sin = Math.sin(rotation)
  const corner = (lx: number, ly: number): Point => ({
    x: cx + lx * cos - ly * sin,
    y: cy + lx * sin + ly * cos,
  })
  return [
    corner(-halfW, -halfH),
    corner(halfW, -halfH),
    corner(halfW, halfH),
    corner(-halfW, halfH),
  ]
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

/**
 * itemWorldAABB extended DOWNWARD to enclose the §4.5 world-scale
 * label when one is visible, so §8.4 chrome that floats beneath the
 * body — the charm bar — clears the title instead of covering it
 * (AI-IMP-161). BYTE-IDENTICAL to itemWorldAABB when no label reaches
 * below the body (the owner chose the tighter unlabeled anchor over
 * always-stable positioning). Zoom feeds the label's fixed
 * screen-space clearance; pass the live camera zoom.
 */
export function adornedWorldAABB(item: SceneItem, zoom: number): Rect | null {
  const aabb = itemWorldAABB(item)
  if (!aabb || item.itemKind !== 'placement') return aabb
  const labelBottom = placementLabelWorldBottom(item, zoom)
  if (labelBottom === null) return aabb
  const bottom = Math.max(aabb.y + aabb.height, labelBottom)
  return { x: aabb.x, y: aabb.y, width: aabb.width, height: bottom - aabb.y }
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
  if (item.appearanceKind === 'dot') {
    const radius = width / 2
    return localX * localX + localY * localY <= radius * radius
  }
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

/** The recorded frame relation needed by selection targeting. */
export interface FrameHitIndex {
  isFrame(placementId: string): boolean
  parentOf(placementId: string): string | null
}

function isRecordedDescendant(
  placementId: string,
  ancestorFrameId: string,
  frames: FrameHitIndex,
): boolean {
  const seen = new Set<string>()
  let parent = frames.parentOf(placementId)
  while (parent !== null && !seen.has(parent)) {
    if (parent === ancestorFrameId) return true
    seen.add(parent)
    parent = frames.parentOf(parent)
  }
  return false
}

/**
 * Selection-only frame priority (AI-IMP-308): a recorded descendant
 * under the pointer outranks its ancestor frame's translucent wash.
 * The ordinary render-order walk otherwise stays intact, so unrelated
 * topmost content still wins and an uncovered frame body selects the
 * frame. Other interaction dialects (notably double-click activation)
 * continue to use `hitTest` and retain their established semantics.
 */
export function hitTestForSelection(
  point: Point,
  items: readonly SceneItem[],
  frames: FrameHitIndex,
): SceneItem | null {
  const hits: SceneItem[] = []
  for (let i = items.length - 1; i >= 0; i -= 1) {
    const item = items[i]!
    if (!isHittable(item)) continue
    if (item.itemKind === 'placement') {
      if (pointInPlacement(point, item)) hits.push(item)
    } else {
      const aabb = decorationAABB(item)
      if (aabb && pointInRect(point, aabb, HIT_SLOP)) hits.push(item)
    }
  }

  for (const hit of hits) {
    if (hit.itemKind !== 'placement' || !frames.isFrame(hit.id)) return hit
    const coveredDescendant = hits.some(
      (candidate) =>
        candidate.itemKind === 'placement' &&
        candidate.id !== hit.id &&
        isRecordedDescendant(candidate.id, hit.id, frames),
    )
    if (!coveredDescendant) return hit
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

// ------------------------------------------------------- cursor zones

/**
 * Cursor-zone widths (§6.9 rev 0.17): provisional feel constants, in
 * SCREEN pixels so the zones feel identical at any zoom. The resize
 * band straddles each edge by ±edgePx; the rotate band lies
 * rotateInnerPx..rotateOuterPx outside each corner.
 */
export const CURSOR_ZONES = {
  edgePx: 4,
  // 4..24 keeps ~18 usable px of ring after the resize box's diagonal
  // overhang (edge·√2) — 14 left ~8 px, too thin to find by feel
  // (owner pass 2026-07-06, AI-IMP-031).
  rotateInnerPx: 4,
  rotateOuterPx: 24,
} as const

export type CursorZoneWidths = { edgePx: number; rotateInnerPx: number; rotateOuterPx: number }

export type CursorZone =
  | 'move'
  | 'resize-n'
  | 'resize-ne'
  | 'resize-e'
  | 'resize-se'
  | 'resize-s'
  | 'resize-sw'
  | 'resize-w'
  | 'resize-nw'
  | 'rotate-ne'
  | 'rotate-se'
  | 'rotate-sw'
  | 'rotate-nw'
  | 'none'

/**
 * Cursor-zone classification (§6.9 rev 0.17): the cursor is the
 * affordance — no handles are drawn. `bounds` is the item's UNROTATED
 * body rect in world units, `rotation` its angle about the rect
 * center (0 with the union AABB of a multi-selection). The pointer is
 * rotated into the local frame, so returned directions name the
 * item's own edges — exactly the frame createResizeDriver resizes in
 * (AI-IMP-031). Zone widths are screen px divided by `cameraScale`
 * into world units, so zones feel constant at any zoom. Priority:
 * move/resize inside the edge-expanded box, then the rotate band
 * outside a corner, then none (empty canvas — grab/pan).
 */
export function classifyCursorZone(
  pointerWorld: Point,
  bounds: Rect,
  rotation: number,
  cameraScale: number,
  zones: CursorZoneWidths = CURSOR_ZONES,
): CursorZone {
  const scale = cameraScale > 0 ? cameraScale : 1
  const edge = zones.edgePx / scale
  const rotInner = zones.rotateInnerPx / scale
  const rotOuter = zones.rotateOuterPx / scale
  const halfW = bounds.width / 2
  const halfH = bounds.height / 2
  const cx = bounds.x + halfW
  const cy = bounds.y + halfH
  const cos = Math.cos(-rotation)
  const sin = Math.sin(-rotation)
  const dx = pointerWorld.x - cx
  const dy = pointerWorld.y - cy
  const lx = dx * cos - dy * sin
  const ly = dx * sin + dy * cos
  if (Math.abs(lx) <= halfW + edge && Math.abs(ly) <= halfH + edge) {
    // The inward half of the band clamps on small-on-screen items so
    // the move zone never vanishes entirely.
    const insetX = Math.min(edge, halfW / 2)
    const insetY = Math.min(edge, halfH / 2)
    const xBand = lx <= -(halfW - insetX) ? 'w' : lx >= halfW - insetX ? 'e' : ''
    const yBand = ly <= -(halfH - insetY) ? 'n' : ly >= halfH - insetY ? 's' : ''
    if (xBand === '' && yBand === '') return 'move'
    return `resize-${yBand}${xBand}` as CursorZone
  }
  const cornerX = lx >= 0 ? halfW : -halfW
  const cornerY = ly >= 0 ? halfH : -halfH
  const d = Math.hypot(lx - cornerX, ly - cornerY)
  if (d >= rotInner && d <= rotOuter) {
    return `rotate-${ly >= 0 ? 's' : 'n'}${lx >= 0 ? 'e' : 'w'}` as CursorZone
  }
  return 'none'
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
