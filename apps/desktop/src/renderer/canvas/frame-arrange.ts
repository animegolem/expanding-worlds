import {
  arrangePayload,
  itemWorldAABB,
  unionBounds,
  type Rect,
  type SceneItem,
  type ScenePlacement,
} from '@ew/canvas-engine'
import type { TransformContentPayload } from '@ew/commands'

/**
 * Frame-scoped arrange geometry (RFC-0001 §4.9 rev 0.38, AI-IMP-129).
 * Pure helpers shared by the drop-behavior compound (frame sizing), the
 * host's sort-on-drop hook, and the Dock's auto-sort / load-into-frame
 * actions. Every layout goes through 128's `arrangePayload` packer — no
 * new arrange algorithm lives here, only the frame's inner-box framing
 * (origin / rowWidth) and the region a fresh frame is drawn around.
 */

/** World-unit margin between a frame's border and the content packed
 *  inside it. Used both to size a fresh frame around a set (outward)
 *  and to inset a frame's inner box for a scoped arrange (inward). */
export const FRAME_CONTENT_PADDING = 24

/** The frame's inner box as packer origin + wrap width: the AABB inset
 *  by {@link FRAME_CONTENT_PADDING} on every side. */
export function frameInnerBox(frame: ScenePlacement): {
  origin: { x: number; y: number }
  rowWidth: number
} | null {
  const box = itemWorldAABB(frame)
  if (!box) return null
  return {
    origin: { x: box.x + FRAME_CONTENT_PADDING, y: box.y + FRAME_CONTENT_PADDING },
    rowWidth: Math.max(1, box.width - FRAME_CONTENT_PADDING * 2),
  }
}

/**
 * Compact-pack `members` inside `frame`'s inner box (128 packer, default
 * key). ONE TransformContent (invariant 25) or null for a no-op / an
 * ungeometried frame. The arrange lands where the frame is, wrapping at
 * the frame's inner width.
 */
export function scopedArrangePayload(
  canvasId: string,
  frame: ScenePlacement,
  members: readonly SceneItem[],
): TransformContentPayload | null {
  const inner = frameInnerBox(frame)
  if (!inner) return null
  return arrangePayload(canvasId, members, 'default', {
    origin: inner.origin,
    rowWidth: inner.rowWidth,
  })
}

/**
 * The drawn region for a NEW frame around `items`: their union AABB
 * grown by {@link FRAME_CONTENT_PADDING} on every side, as a top-left +
 * size rect (the shape `host.commitFrame` consumes). Null when nothing
 * has bounds.
 */
export function frameRegionAround(items: readonly SceneItem[]): Rect | null {
  const bounds = unionBounds(items)
  if (!bounds) return null
  return {
    x: bounds.x - FRAME_CONTENT_PADDING,
    y: bounds.y - FRAME_CONTENT_PADDING,
    width: bounds.width + FRAME_CONTENT_PADDING * 2,
    height: bounds.height + FRAME_CONTENT_PADDING * 2,
  }
}
