/**
 * Frame membership command payloads (RFC-0001 §4.9 rev 0.38/0.54,
 * EPIC-017 / AI-IMP-126). A frame is an ordinary node with a 'frame'
 * appearance; membership is a recorded relation (frame_member),
 * single-parent (innermost frame owns), edited only by capture and
 * release — never inferred from geometry. Both public commands are
 * batch-capable and fully invertible; the inverse restores each
 * member's EXACT prior parent, so undo of a re-capture is precise.
 */

/**
 * §4.9: capture one or more member placements into a frame placement.
 * Re-capturing an already-captured member RE-PARENTS it (the single
 * PRIMARY KEY row moves). Handler validation: the frame placement's
 * node has the 'frame' appearance, every member shares the frame's
 * canvas, and no cycle is created (a frame may not be captured by
 * itself or by any of its own descendants — the chain is walked).
 */
export interface CaptureInFramePayload {
  framePlacementId: string
  memberPlacementIds: string[]
}

/** §4.9: release one or more member placements from their frame. */
export interface ReleaseFromFramePayload {
  memberPlacementIds: string[]
}

/**
 * One member's target parent for a membership restore: a frame
 * placement id, or null to leave the member uncaptured.
 */
export interface FrameMembershipTarget {
  memberPlacementId: string
  /** null restores the "not a member of any frame" state. */
  framePlacementId: string | null
}

/**
 * Internal inverse of both CaptureInFrame and ReleaseFromFrame:
 * restores each listed member to an EXACT prior parent (or to
 * uncaptured when framePlacementId is null). Self-inverse family —
 * its own inverse is another RestoreFrameMembership carrying the
 * membership state it replaced, so redo is precise too. Not part of
 * the public UI command set.
 */
export interface RestoreFrameMembershipPayload {
  targets: FrameMembershipTarget[]
}

export const COMMAND_CAPTURE_IN_FRAME = 'CaptureInFrame'
export const COMMAND_RELEASE_FROM_FRAME = 'ReleaseFromFrame'
export const COMMAND_RESTORE_FRAME_MEMBERSHIP = 'RestoreFrameMembership'
