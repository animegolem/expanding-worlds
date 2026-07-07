import { itemWorldAABB } from './hit-test'
import type { SnapGuide, SnapProvider } from './snap'
import type { SceneItem } from './types'

/**
 * Real SnapProvider (§6.9, AI-IMP-022 + AI-IMP-026). `begin` indexes
 * the static (non-moving) content's world-AABB edges and centers per
 * axis, plus the canvas origin axes; `query` finds the smallest
 * within-threshold adjustment for the moving bounds' own
 * edges/centers on each axis independently (or only the masked edges
 * when the query carries an edge mask — resize, AI-IMP-082).
 * Thresholds are SCREEN
 * pixels divided by zoom, so the feel is constant at any
 * magnification. Ephemeral by construction: the provider only adjusts
 * proposed deltas and emits guides — it never issues commands.
 *
 * Engagement uses hysteresis (§6.9 rev 0.9): a candidate engages when
 * its distance to a stop is within SNAP_ENGAGE_PX/zoom and stays
 * engaged — sticky against marginally closer new candidates — until
 * the distance exceeds SNAP_RELEASE_PX/zoom. Distances are measured
 * against the RAW proposed position (the move driver recomputes
 * movingBounds from the unsnapped pointer delta each update), so the
 * snapped output never feeds back into the hysteresis. Guides are
 * reported only for engaged axes — no approach previews.
 */

/** Engage radius in screen pixels (divided by zoom into world units). */
export const SNAP_ENGAGE_PX = 6
/** Release radius in screen pixels; larger than engage (hysteresis). */
export const SNAP_RELEASE_PX = 9

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
  /** Index into the moving candidates (0 = min edge, 1 = center, 2 = max edge). */
  candidate: number
}

/**
 * Per-axis engaged snap: the stop we latched onto and WHICH moving
 * candidate (edge/center role) latched, so the same pairing is
 * re-measured on every update regardless of what else drifts near.
 */
interface Engaged {
  stop: Stop
  candidate: number
}

/**
 * Smallest |adjustment| wins; equal magnitudes tie-break to the lowest
 * stop coordinate. Stops arrive sorted by value and candidates in
 * edge/center/edge order, so the scan is deterministic.
 */
function bestHit(stops: readonly Stop[], candidates: readonly number[], threshold: number): Hit | null {
  let best: Hit | null = null
  for (const stop of stops) {
    for (let i = 0; i < candidates.length; i++) {
      const adjust = stop.value - candidates[i]!
      if (Math.abs(adjust) > threshold) continue
      if (best === null || Math.abs(adjust) < Math.abs(best.adjust)) best = { adjust, stop, candidate: i }
    }
  }
  return best
}

/**
 * Moving candidates for one axis. Unmasked queries (move) offer the
 * min edge, center, and max edge; a masked query (resize, AI-IMP-082)
 * offers ONLY the named edge — no center, no opposite edge — and an
 * axis omitted from the mask offers nothing at all.
 */
function axisCandidates(
  min: number,
  size: number,
  masked: boolean,
  edge: 'min' | 'max' | undefined,
): number[] {
  if (!masked) return [min, min + size / 2, min + size]
  if (edge === 'min') return [min]
  if (edge === 'max') return [min + size]
  return []
}

/**
 * One axis of hysteresis: while engaged, re-measure the SAME
 * stop/candidate pairing and hold it anywhere inside the release
 * radius (stability beats optimality mid-drag — a marginally closer
 * new stop never steals an engaged snap). Only after release does the
 * axis search for a fresh engagement inside the engage radius.
 */
function resolveAxis(
  stops: readonly Stop[],
  candidates: readonly number[],
  engaged: Engaged | null,
  engageThreshold: number,
  releaseThreshold: number,
): { hit: Hit | null; engaged: Engaged | null } {
  if (engaged) {
    const adjust = engaged.stop.value - candidates[engaged.candidate]!
    if (Math.abs(adjust) <= releaseThreshold) {
      return { hit: { adjust, stop: engaged.stop, candidate: engaged.candidate }, engaged }
    }
  }
  const hit = bestHit(stops, candidates, engageThreshold)
  return { hit, engaged: hit ? { stop: hit.stop, candidate: hit.candidate } : null }
}

export function createSnapProvider(engagePx = SNAP_ENGAGE_PX, releasePx = SNAP_RELEASE_PX): SnapProvider {
  let xStops: Stop[] = []
  let yStops: Stop[] = []
  let engagedX: Engaged | null = null
  let engagedY: Engaged | null = null

  return {
    begin(staticItems: readonly SceneItem[]) {
      engagedX = null
      engagedY = null
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

    query({ movingBounds, proposedDelta, disabled, zoom, edges }) {
      if (disabled) {
        // The modifier breaks any engagement: re-enabling re-evaluates
        // fresh at the (tighter) engage radius.
        engagedX = null
        engagedY = null
        return { dx: proposedDelta.dx, dy: proposedDelta.dy, guides: [] }
      }
      const engageThreshold = engagePx / zoom
      const releaseThreshold = releasePx / zoom
      const x = resolveAxis(
        xStops,
        axisCandidates(movingBounds.x, movingBounds.width, edges !== undefined, edges?.x),
        engagedX,
        engageThreshold,
        releaseThreshold,
      )
      const y = resolveAxis(
        yStops,
        axisCandidates(movingBounds.y, movingBounds.height, edges !== undefined, edges?.y),
        engagedY,
        engageThreshold,
        releaseThreshold,
      )
      // §8.2 nudge (AI-IMP-151): an axis freshly engages when it was
      // null before this query and latched now — the adjust applied on
      // THAT frame is the last-px magnetic seat the host eases away.
      const freshX = engagedX === null && x.engaged !== null
      const freshY = engagedY === null && y.engaged !== null
      engagedX = x.engaged
      engagedY = y.engaged
      const xHit = x.hit
      const yHit = y.hit
      const adjustX = xHit?.adjust ?? 0
      const adjustY = yHit?.adjust ?? 0
      // Guides — engaged axes only — span from the matched static
      // geometry to the (snapped) moving bounds, so the user sees what
      // they snapped to.
      const guides: SnapGuide[] = []
      if (xHit) {
        guides.push({
          axis: 'x',
          position: xHit.stop.value,
          from: Math.min(xHit.stop.from, movingBounds.y + adjustY),
          to: Math.max(xHit.stop.to, movingBounds.y + movingBounds.height + adjustY),
          ...(freshX ? { engagedDelta: adjustX } : {}),
        })
      }
      if (yHit) {
        guides.push({
          axis: 'y',
          position: yHit.stop.value,
          from: Math.min(yHit.stop.from, movingBounds.x + adjustX),
          to: Math.max(yHit.stop.to, movingBounds.x + movingBounds.width + adjustX),
          ...(freshY ? { engagedDelta: adjustY } : {}),
        })
      }
      return { dx: proposedDelta.dx + adjustX, dy: proposedDelta.dy + adjustY, guides }
    },

    end() {
      xStops = []
      yStops = []
      engagedX = null
      engagedY = null
    },
  }
}
