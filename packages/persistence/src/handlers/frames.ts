import {
  COMMAND_CAPTURE_IN_FRAME,
  COMMAND_RELEASE_FROM_FRAME,
  COMMAND_RESTORE_FRAME_MEMBERSHIP,
  DomainError,
  type AffectedRecord,
  type CaptureInFramePayload,
  type CommandRegistry,
  type FrameMembershipTarget,
  type ReleaseFromFramePayload,
  type RestoreFrameMembershipPayload,
} from '@ew/commands'
import type { CommandContext } from '../dispatcher'

/**
 * Frame membership handlers (RFC-0001 §4.9 rev 0.38/0.54, EPIC-017 /
 * AI-IMP-126). Frames are THE grouping: a frame is an ordinary node
 * with a 'frame' appearance, membership is recorded in frame_member,
 * single-parent (the member_placement_id PRIMARY KEY), and edited
 * only by CaptureInFrame / ReleaseFromFrame — never inferred from
 * geometry. Both commands are batch, both invertible; the inverse
 * (RestoreFrameMembership) restores each member's EXACT prior parent
 * so undo of a re-capture is precise.
 *
 * The membership rows themselves carry no lifecycle: trashing a frame
 * NODE leaves its placement (and every frame_member row keyed on it)
 * intact, so restore rejoins the group (§9.6 aggregate); purge
 * hard-deletes the placement and the FK cascades the rows away. No
 * purge hook is needed here — ON DELETE CASCADE on both frame_member
 * FKs handles every hard-delete path (DeletePlacement, DeleteContent,
 * canvas/node purge).
 */

interface ActivePlacement {
  id: string
  canvas_id: string
  appearance_kind: string | null
}

/** An active placement plus the appearance kind of its node. */
function requireActivePlacement(ctx: CommandContext, placementId: string): ActivePlacement {
  const row = ctx.db.get<ActivePlacement>(
    `SELECT p.id, p.canvas_id, n.appearance_kind
     FROM placement p
     JOIN node n ON n.id = p.node_id AND n.lifecycle_state = 'active'
     WHERE p.id = ? AND p.project_id = ? AND p.lifecycle_state = 'active'`,
    placementId,
    ctx.projectId,
  )
  if (!row) throw new DomainError('PLACEMENT_NOT_FOUND', `no active placement ${placementId}`)
  return row
}

/** The frame placement a member currently sits in, or null. */
function currentParent(ctx: CommandContext, memberPlacementId: string): string | null {
  const row = ctx.db.get<{ frame_placement_id: string }>(
    'SELECT frame_placement_id FROM frame_member WHERE member_placement_id = ?',
    memberPlacementId,
  )
  return row?.frame_placement_id ?? null
}

/** Insert-or-reparent (null clears) — the single write over frame_member. */
function writeMembership(
  ctx: CommandContext,
  memberPlacementId: string,
  framePlacementId: string | null,
): void {
  if (framePlacementId === null) {
    ctx.db.run('DELETE FROM frame_member WHERE member_placement_id = ?', memberPlacementId)
    return
  }
  const now = ctx.now()
  // The member_placement_id PRIMARY KEY makes this an upsert: a
  // re-capture MOVES the one row rather than duplicating it, which is
  // the single-parent invariant enforced structurally.
  ctx.db.run(
    `INSERT INTO frame_member
       (member_placement_id, frame_placement_id, project_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(member_placement_id)
       DO UPDATE SET frame_placement_id = excluded.frame_placement_id,
                     updated_at = excluded.updated_at`,
    memberPlacementId,
    framePlacementId,
    ctx.projectId,
    now,
    now,
  )
}

/**
 * Would capturing `memberPlacementId` into `framePlacementId` create a
 * cycle? A member becomes a child of the frame, so a cycle exists iff
 * the frame is the member itself or already sits (transitively) inside
 * the member. Walk UP the frame's parent chain; a visited set guards
 * against any pre-existing corruption (invariant 19).
 */
function wouldCycle(
  ctx: CommandContext,
  memberPlacementId: string,
  framePlacementId: string,
): boolean {
  if (memberPlacementId === framePlacementId) return true
  const visited = new Set<string>()
  let cur: string | null = framePlacementId
  while (cur !== null) {
    if (cur === memberPlacementId) return true
    if (visited.has(cur)) break
    visited.add(cur)
    cur = currentParent(ctx, cur)
  }
  return false
}

/** Members + the distinct frames touched, for the change event. */
function affectedFor(targets: FrameMembershipTarget[], priorFrames: (string | null)[]): AffectedRecord[] {
  const ids = new Set<string>()
  for (const t of targets) {
    ids.add(t.memberPlacementId)
    if (t.framePlacementId !== null) ids.add(t.framePlacementId)
  }
  for (const f of priorFrames) if (f !== null) ids.add(f)
  return [...ids].map((id) => ({ kind: 'placement' as const, id }))
}

/** Reject empty / duplicate member batches uniformly. */
function requireDistinctMembers(memberPlacementIds: string[], command: string): void {
  if (memberPlacementIds.length === 0) {
    throw new DomainError('VALIDATION_FAILED', `${command} requires at least one member`)
  }
  if (new Set(memberPlacementIds).size !== memberPlacementIds.length) {
    throw new DomainError('VALIDATION_FAILED', `duplicate member ids in ${command}`)
  }
}

function payloadRecord(payload: unknown, command: string): Record<string, unknown> {
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new DomainError('VALIDATION_FAILED', `${command} payload must be an object`)
  }
  return payload as Record<string, unknown>
}

function requireId(value: unknown, label: string): void {
  if (typeof value !== 'string' || value.length === 0) {
    throw new DomainError('VALIDATION_FAILED', `${label} must be a non-empty string`)
  }
}

function requireIdArray(value: unknown, label: string): void {
  if (!Array.isArray(value)) {
    throw new DomainError('VALIDATION_FAILED', `${label} must be an array`)
  }
  for (const id of value) requireId(id, `${label} entry`)
}

function validateCapturePayload(payload: unknown): void {
  const record = payloadRecord(payload, 'CaptureInFrame')
  requireId(record.framePlacementId, 'CaptureInFrame framePlacementId')
  requireIdArray(record.memberPlacementIds, 'CaptureInFrame memberPlacementIds')
}

function validateReleasePayload(payload: unknown): void {
  const record = payloadRecord(payload, 'ReleaseFromFrame')
  requireIdArray(record.memberPlacementIds, 'ReleaseFromFrame memberPlacementIds')
}

function validateRestorePayload(payload: unknown): void {
  const record = payloadRecord(payload, 'RestoreFrameMembership')
  if (!Array.isArray(record.targets)) {
    throw new DomainError('VALIDATION_FAILED', 'RestoreFrameMembership targets must be an array')
  }
  for (const raw of record.targets) {
    const target = payloadRecord(raw, 'RestoreFrameMembership target')
    requireId(target.memberPlacementId, 'RestoreFrameMembership memberPlacementId')
    if (target.framePlacementId !== null) {
      requireId(target.framePlacementId, 'RestoreFrameMembership framePlacementId')
    }
  }
}

function validateRestoreState(ctx: CommandContext, targets: FrameMembershipTarget[]): void {
  requireDistinctMembers(
    targets.map((target) => target.memberPlacementId),
    'RestoreFrameMembership',
  )
  const intended = new Map(
    targets.map((target) => [target.memberPlacementId, target.framePlacementId] as const),
  )
  for (const target of targets) {
    const member = requireActivePlacement(ctx, target.memberPlacementId)
    if (target.framePlacementId === null) continue
    const frame = requireActivePlacement(ctx, target.framePlacementId)
    if (frame.appearance_kind !== 'frame') {
      throw new DomainError(
        'VALIDATION_FAILED',
        'membership parent is not a frame placement',
        { framePlacementId: target.framePlacementId },
      )
    }
    if (member.canvas_id !== frame.canvas_id) {
      throw new DomainError('VALIDATION_FAILED', 'frame and member must share one canvas', {
        framePlacementId: target.framePlacementId,
        memberPlacementId: target.memberPlacementId,
      })
    }
    let current: string | null = target.framePlacementId
    const visited = new Set<string>()
    while (current !== null) {
      if (current === target.memberPlacementId || visited.has(current)) {
        throw new DomainError('FRAME_CYCLE', 'membership restore would create a cycle')
      }
      visited.add(current)
      current = intended.has(current) ? intended.get(current)! : currentParent(ctx, current)
    }
  }
}

/**
 * Apply a set of membership targets and return the inverse
 * (each member's prior parent) — shared by CaptureInFrame,
 * ReleaseFromFrame, and RestoreFrameMembership.
 */
function applyTargets(ctx: CommandContext, targets: FrameMembershipTarget[]) {
  const priors: FrameMembershipTarget[] = []
  const priorFrames: (string | null)[] = []
  for (const t of targets) {
    const prior = currentParent(ctx, t.memberPlacementId)
    priors.push({ memberPlacementId: t.memberPlacementId, framePlacementId: prior })
    priorFrames.push(prior)
    writeMembership(ctx, t.memberPlacementId, t.framePlacementId)
  }
  return {
    affected: affectedFor(targets, priorFrames),
    inverse: {
      commandType: COMMAND_RESTORE_FRAME_MEMBERSHIP,
      commandVersion: 1,
      payload: { targets: priors } satisfies RestoreFrameMembershipPayload,
    },
  }
}

export function registerFrameHandlers(registry: CommandRegistry<CommandContext>): void {
  registry.register<CaptureInFramePayload>(COMMAND_CAPTURE_IN_FRAME, 1, (ctx, payload) => {
    requireDistinctMembers(payload.memberPlacementIds, 'CaptureInFrame')
    const frame = requireActivePlacement(ctx, payload.framePlacementId)
    if (frame.appearance_kind !== 'frame') {
      throw new DomainError(
        'VALIDATION_FAILED',
        'capturing placement is not a frame (node appearance must be "frame")',
        { framePlacementId: payload.framePlacementId, appearanceKind: frame.appearance_kind },
      )
    }
    // Validate the whole batch before writing anything.
    for (const memberId of payload.memberPlacementIds) {
      const member = requireActivePlacement(ctx, memberId)
      if (member.canvas_id !== frame.canvas_id) {
        throw new DomainError('VALIDATION_FAILED', 'frame and member must share one canvas', {
          framePlacementId: payload.framePlacementId,
          memberPlacementId: memberId,
        })
      }
      if (wouldCycle(ctx, memberId, payload.framePlacementId)) {
        throw new DomainError('FRAME_CYCLE', 'capture would create a frame membership cycle', {
          framePlacementId: payload.framePlacementId,
          memberPlacementId: memberId,
        })
      }
    }
    const targets: FrameMembershipTarget[] = payload.memberPlacementIds.map((memberPlacementId) => ({
      memberPlacementId,
      framePlacementId: payload.framePlacementId,
    }))
    return applyTargets(ctx, targets)
  }, validateCapturePayload)

  registry.register<ReleaseFromFramePayload>(COMMAND_RELEASE_FROM_FRAME, 1, (ctx, payload) => {
    requireDistinctMembers(payload.memberPlacementIds, 'ReleaseFromFrame')
    for (const memberId of payload.memberPlacementIds) {
      if (currentParent(ctx, memberId) === null) {
        throw new DomainError('FRAME_MEMBER_NOT_FOUND', 'placement is not captured in any frame', {
          memberPlacementId: memberId,
        })
      }
    }
    const targets: FrameMembershipTarget[] = payload.memberPlacementIds.map((memberPlacementId) => ({
      memberPlacementId,
      framePlacementId: null,
    }))
    return applyTargets(ctx, targets)
  }, validateReleasePayload)

  // Inverses cross the same public command seam as forward commands.
  // Validate the complete intended graph before the first write; a
  // forged/stale batch must not bypass frame-kind, canvas, or cycle
  // invariants merely because ordinary undo issued the original shape.
  registry.register<RestoreFrameMembershipPayload>(
    COMMAND_RESTORE_FRAME_MEMBERSHIP,
    1,
    (ctx, payload) => {
      validateRestoreState(ctx, payload.targets)
      return applyTargets(ctx, payload.targets)
    },
    validateRestorePayload,
  )
}
