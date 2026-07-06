import type { Rect } from './camera'
import type { SceneItem } from './types'

/**
 * Snapping seam (§6.9). The gesture pipeline consults the provider on
 * every update; the provider returns an adjusted delta plus the smart
 * guides to draw in the overlay plane. Snapping is an ephemeral
 * interaction aid — providers never issue commands, and the gesture
 * still commits exactly one durable command. The real implementation
 * lands in AI-IMP-022; the default is a no-op.
 */

export interface SnapGuide {
  axis: 'x' | 'y'
  /** World coordinate of the guide line on its axis. */
  position: number
  from: number
  to: number
}

export interface SnapQuery {
  /** Moving selection's world bounds at the proposed position. */
  movingBounds: Rect
  proposedDelta: { dx: number; dy: number }
  /**
   * Optional edge mask (AI-IMP-082, resize): when present, ONLY the
   * named edges of movingBounds are moving candidates — no centers,
   * no opposite edges — and an omitted axis never snaps. Absent mask
   * means the full edge/center/edge candidate set (move semantics).
   */
  edges?: { x?: 'min' | 'max' | undefined; y?: 'min' | 'max' | undefined }
  /** Held modifier temporarily disables snapping (§6.9). */
  disabled: boolean
  zoom: number
}

export interface SnapResult {
  dx: number
  dy: number
  guides: SnapGuide[]
}

export interface SnapProvider {
  /** Called at gesture begin with the NON-moving content. */
  begin(staticItems: readonly SceneItem[]): void
  query(query: SnapQuery): SnapResult
  end(): void
}

export const noopSnapProvider: SnapProvider = {
  begin() {},
  query({ proposedDelta }) {
    return { dx: proposedDelta.dx, dy: proposedDelta.dy, guides: [] }
  },
  end() {},
}
