import { itemWorldAABB } from './hit-test'
import type { SnapGuide, SnapProvider } from './snap'
import type { SceneItem } from './types'

/**
 * Real SnapProvider (§6.9, AI-IMP-022). `begin` indexes the static
 * (non-moving) content's world-AABB edges and centers per axis, plus
 * the canvas origin axes; `query` finds the smallest within-threshold
 * adjustment for the moving bounds' own edges/centers on each axis
 * independently. The threshold is SCREEN pixels divided by zoom, so
 * the feel is constant at any magnification. Ephemeral by
 * construction: the provider only adjusts proposed deltas and emits
 * guides — it never issues commands.
 */

/** Snap radius in screen pixels (divided by zoom into world units). */
export const SNAP_THRESHOLD_PX = 6

interface Stop {
  /** World coordinate on the snapping axis. */
  value: number
  /** Extent of the source geometry along the OTHER axis (for guides). */
  from: number
  to: number
}

interface Hit {
  adjust: number
  stop: Stop
}

/**
 * Smallest |adjustment| wins; equal magnitudes tie-break to the lowest
 * stop coordinate. Stops arrive sorted by value and candidates in
 * edge/center/edge order, so the scan is deterministic.
 */
function bestHit(stops: readonly Stop[], candidates: readonly number[], threshold: number): Hit | null {
  let best: Hit | null = null
  for (const stop of stops) {
    for (const candidate of candidates) {
      const adjust = stop.value - candidate
      if (Math.abs(adjust) > threshold) continue
      if (best === null || Math.abs(adjust) < Math.abs(best.adjust)) best = { adjust, stop }
    }
  }
  return best
}

export function createSnapProvider(thresholdPx = SNAP_THRESHOLD_PX): SnapProvider {
  let xStops: Stop[] = []
  let yStops: Stop[] = []

  return {
    begin(staticItems: readonly SceneItem[]) {
      // The canvas origin axes are always snappable (§6.9 index).
      xStops = [{ value: 0, from: 0, to: 0 }]
      yStops = [{ value: 0, from: 0, to: 0 }]
      for (const item of staticItems) {
        const aabb = itemWorldAABB(item)
        if (!aabb) continue
        const xSpan = { from: aabb.y, to: aabb.y + aabb.height }
        const ySpan = { from: aabb.x, to: aabb.x + aabb.width }
        xStops.push(
          { value: aabb.x, ...xSpan },
          { value: aabb.x + aabb.width / 2, ...xSpan },
          { value: aabb.x + aabb.width, ...xSpan },
        )
        yStops.push(
          { value: aabb.y, ...ySpan },
          { value: aabb.y + aabb.height / 2, ...ySpan },
          { value: aabb.y + aabb.height, ...ySpan },
        )
      }
      xStops.sort((a, b) => a.value - b.value)
      yStops.sort((a, b) => a.value - b.value)
    },

    query({ movingBounds, proposedDelta, disabled, zoom }) {
      if (disabled) return { dx: proposedDelta.dx, dy: proposedDelta.dy, guides: [] }
      const threshold = thresholdPx / zoom
      const xHit = bestHit(
        xStops,
        [movingBounds.x, movingBounds.x + movingBounds.width / 2, movingBounds.x + movingBounds.width],
        threshold,
      )
      const yHit = bestHit(
        yStops,
        [movingBounds.y, movingBounds.y + movingBounds.height / 2, movingBounds.y + movingBounds.height],
        threshold,
      )
      const adjustX = xHit?.adjust ?? 0
      const adjustY = yHit?.adjust ?? 0
      // Guides span from the matched static geometry to the (snapped)
      // moving bounds, so the user sees what they snapped to.
      const guides: SnapGuide[] = []
      if (xHit) {
        guides.push({
          axis: 'x',
          position: xHit.stop.value,
          from: Math.min(xHit.stop.from, movingBounds.y + adjustY),
          to: Math.max(xHit.stop.to, movingBounds.y + movingBounds.height + adjustY),
        })
      }
      if (yHit) {
        guides.push({
          axis: 'y',
          position: yHit.stop.value,
          from: Math.min(yHit.stop.from, movingBounds.x + adjustX),
          to: Math.max(yHit.stop.to, movingBounds.x + movingBounds.width + adjustX),
        })
      }
      return { dx: proposedDelta.dx + adjustX, dy: proposedDelta.dy + adjustY, guides }
    },

    end() {
      xStops = []
      yStops = []
    },
  }
}
