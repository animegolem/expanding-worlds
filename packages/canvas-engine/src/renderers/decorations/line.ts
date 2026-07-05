import { Container, Graphics } from 'pixi.js'
import { isLineData, type LineData } from '../../decoration-data'
import type { SceneDecoration } from '../../types'
import type { ItemRenderer } from '../registry'

/**
 * Straight line and arrow decorations (kinds 'line' and 'arrow'): one
 * segment in absolute world coordinates. Lines are stroked with round
 * caps. Arrows are a single filled block polygon (AI-IMP-027): the
 * old stroke+triangle pair pushed a round stroke cap past the head,
 * leaving a lump at the tip; one filled silhouette cannot seam or
 * bulge. Invalid data renders nothing.
 */

/** Thickness never exceeds this fraction of the segment length —
 * arrow thickness is FORM (§6.8 rev 0.12), and unbounded widths on
 * short segments degrade into blobs (owner screenshot). */
export const ARROW_MAX_THICKNESS_FRACTION = 1 / 3
/** Head width across the barbs, in shaft thicknesses. */
export const ARROW_HEAD_WIDTH_FACTOR = 3
/** Head length tip-to-base, in shaft thicknesses. */
export const ARROW_HEAD_LENGTH_FACTOR = 2.2
/** Head length never exceeds this fraction of the segment length. */
export const ARROW_HEAD_MAX_FRACTION = 0.6

/**
 * Pure block-arrow silhouette for (x1,y1)->(x2,y2): a rectangular
 * shaft of thickness strokeWidth and a triangular head, as one
 * 7-point polygon [x0,y0, ..., x6,y6]. Point 3 is the tip, exactly at
 * (x2,y2); points 0 and 6 are the flat tail edge centered on (x1,y1).
 * Degenerate segments (zero-length or non-finite) yield [].
 */
export function arrowPolygon(data: LineData): number[] {
  const dx = data.x2 - data.x1
  const dy = data.y2 - data.y1
  const length = Math.hypot(dx, dy)
  if (length === 0 || !Number.isFinite(length)) return []
  // Unit axis (u) and unit left-normal (p).
  const ux = dx / length
  const uy = dy / length
  const px = -uy
  const py = ux
  const thickness = Math.min(data.strokeWidth, length * ARROW_MAX_THICKNESS_FRACTION)
  const shaftHalf = thickness / 2
  const headHalf = (thickness * ARROW_HEAD_WIDTH_FACTOR) / 2
  const headLength = Math.min(
    thickness * ARROW_HEAD_LENGTH_FACTOR,
    length * ARROW_HEAD_MAX_FRACTION,
  )
  // Head base point on the axis.
  const baseX = data.x2 - ux * headLength
  const baseY = data.y2 - uy * headLength
  return [
    data.x1 + px * shaftHalf,
    data.y1 + py * shaftHalf,
    baseX + px * shaftHalf,
    baseY + py * shaftHalf,
    baseX + px * headHalf,
    baseY + py * headHalf,
    data.x2,
    data.y2,
    baseX - px * headHalf,
    baseY - py * headHalf,
    baseX - px * shaftHalf,
    baseY - py * shaftHalf,
    data.x1 - px * shaftHalf,
    data.y1 - py * shaftHalf,
  ]
}

export function drawSegment(gfx: Graphics, data: LineData, arrowhead: boolean): void {
  if (arrowhead) {
    const points = arrowPolygon(data)
    if (points.length > 0) gfx.poly(points).fill({ color: data.stroke })
    return
  }
  gfx.moveTo(data.x1, data.y1).lineTo(data.x2, data.y2).stroke({
    width: data.strokeWidth,
    color: data.stroke,
    cap: 'round',
  })
}

function makeRenderer(arrowhead: boolean): ItemRenderer<SceneDecoration> {
  const apply = (gfx: Graphics, item: SceneDecoration): void => {
    gfx.clear()
    if (!isLineData(item.data)) return
    drawSegment(gfx, item.data, arrowhead)
  }
  return {
    create(item) {
      const container = new Container()
      container.label = `decoration:${item.id}`
      const gfx = new Graphics()
      gfx.label = 'line'
      container.addChild(gfx)
      apply(gfx, item)
      return container
    },
    update(object, item) {
      const gfx = object.getChildByLabel('line') as Graphics | null
      if (gfx) apply(gfx, item)
    },
  }
}

export const lineRenderer: ItemRenderer<SceneDecoration> = makeRenderer(false)
export const arrowRenderer: ItemRenderer<SceneDecoration> = makeRenderer(true)
