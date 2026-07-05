import type { Graphics } from 'pixi.js'
import type { SnapGuide } from './snap'
import type { SceneCamera } from './types'

/**
 * Quiet smart-guide rendering (§6.9 rev 0.9, AI-IMP-026). Guides are
 * drawn as manually dashed lines — PixiJS 8 has no native dashed
 * stroke — thin (1px screen-equivalent) and at reduced opacity, so an
 * engaged snap reads as a whisper, not a flash. The Graphics object
 * MUST live under the camera-transformed world container (like
 * ToolOverlay): geometry is authored in world units and all
 * screen-constant sizes are divided by `view.zoom`.
 */

/** Muted rose, distinct from the selection blue but quiet at 40%. */
export const SNAP_GUIDE_COLOR = 0xc06a8e
export const SNAP_GUIDE_ALPHA = 0.4
/** Screen-equivalent stroke width in pixels (world width = 1/zoom). */
export const SNAP_GUIDE_WIDTH_PX = 1
/** Dash and gap lengths in screen pixels (world length = px/zoom). */
export const SNAP_GUIDE_DASH_PX = 4
export const SNAP_GUIDE_GAP_PX = 4

export interface GuideSegment {
  fromX: number
  fromY: number
  toX: number
  toY: number
}

/**
 * Dash segmentation for one guide in world coordinates. Pure — the
 * geometry is unit-testable without a renderer. Dash and gap lengths
 * are screen-constant (divided by zoom); the trailing dash is clamped
 * to the guide's end so the line never overshoots the span.
 */
export function snapGuideSegments(guide: SnapGuide, view: Pick<SceneCamera, 'zoom'>): GuideSegment[] {
  const dash = SNAP_GUIDE_DASH_PX / view.zoom
  const gap = SNAP_GUIDE_GAP_PX / view.zoom
  const segments: GuideSegment[] = []
  for (let start = guide.from; start < guide.to; start += dash + gap) {
    const end = Math.min(start + dash, guide.to)
    if (guide.axis === 'x') {
      segments.push({ fromX: guide.position, fromY: start, toX: guide.position, toY: end })
    } else {
      segments.push({ fromX: start, fromY: guide.position, toX: end, toY: guide.position })
    }
  }
  return segments
}

/**
 * Clears `gfx` and draws the given guides dashed, 1px
 * screen-equivalent, at reduced opacity. Call with an empty array to
 * erase the overlay when the last snap releases.
 */
export function drawSnapGuides(gfx: Graphics, guides: readonly SnapGuide[], view: SceneCamera): void {
  gfx.clear()
  if (guides.length === 0) return
  for (const guide of guides) {
    for (const s of snapGuideSegments(guide, view)) {
      gfx.moveTo(s.fromX, s.fromY).lineTo(s.toX, s.toY)
    }
  }
  gfx.stroke({
    width: SNAP_GUIDE_WIDTH_PX / view.zoom,
    color: SNAP_GUIDE_COLOR,
    alpha: SNAP_GUIDE_ALPHA,
  })
}
