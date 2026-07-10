import {
  COMMAND_CREATE_DECORATION,
  COMMAND_DELETE_DECORATION,
  COMMAND_GROUP_DECORATIONS,
  COMMAND_UNGROUP_DECORATIONS,
  COMMAND_UPDATE_DECORATION,
  DomainError,
  type CommandRegistry,
  type CreateDecorationPayload,
  type DeleteDecorationPayload,
  type GroupDecorationsPayload,
  type UngroupDecorationsPayload,
  type UpdateDecorationPayload,
} from '@ew/commands'
import type { CommandContext } from '../dispatcher'
import { nextRenderOrder } from '../render-order'

const DECORATION_KINDS = new Set(['text', 'path', 'shape', 'line', 'arrow', 'connector', 'guide'])

interface DecorationRow {
  id: string
  canvas_id: string
  kind: string
  data: string
  render_order: number
  locked: number
  hidden: number
  group_id: string | null
  anchor_start_placement_id: string | null
  anchor_end_placement_id: string | null
}

const DECORATION_COLUMNS = `id, canvas_id, kind, data, render_order, locked, hidden,
  group_id, anchor_start_placement_id, anchor_end_placement_id`

export function requireDecoration(ctx: CommandContext, decorationId: string): DecorationRow {
  const row = ctx.db.get<DecorationRow>(
    `SELECT ${DECORATION_COLUMNS} FROM decoration
     WHERE id = ? AND project_id = ? AND lifecycle_state = 'active'`,
    decorationId,
    ctx.projectId,
  )
  if (!row) throw new DomainError('DECORATION_NOT_FOUND', `no active decoration ${decorationId}`)
  return row
}

/** §4.9: anchors are a connector capability referencing placements.
 * `canvasId` is the decoration's own (stored, never payload-claimed)
 * canvas — an anchor is only valid if the placement lives on that
 * same canvas (CA-012: the scene has no way to draw a cross-canvas
 * anchor, so authoritative state must refuse to hold one). */
function validateAnchor(
  ctx: CommandContext,
  kind: string,
  placementId: string | null | undefined,
  which: 'start' | 'end',
  canvasId: string,
): void {
  if (placementId === null || placementId === undefined) return
  if (kind !== 'connector') {
    throw new DomainError(
      'VALIDATION_FAILED',
      `only connector decorations may anchor endpoints (got kind "${kind}")`,
    )
  }
  const placement = ctx.db.get<{ id: string; canvas_id: string }>(
    `SELECT id, canvas_id FROM placement
     WHERE id = ? AND project_id = ? AND lifecycle_state = 'active'`,
    placementId,
    ctx.projectId,
  )
  if (!placement) {
    throw new DomainError('PLACEMENT_NOT_FOUND', `no active placement ${placementId}`, {
      anchor: which,
      placementId,
    })
  }
  if (placement.canvas_id !== canvasId) {
    throw new DomainError(
      'VALIDATION_FAILED',
      `anchor placement ${placementId} is on a different canvas than the decoration`,
      { anchor: which, placementId, placementCanvasId: placement.canvas_id, canvasId },
    )
  }
}

/**
 * Decoration command handlers (RFC-0001 §4.9, §6.8): canvas-local
 * visual records with stable identity and no node capabilities
 * (invariant 16 — this API surface exposes no note, tag, link, or
 * graph fields for decorations). Groups are movement aids only.
 */
/** Validated decoration insert — shared by CreateDecoration and the
 * DeleteContent inverse (AI-IMP-028). */
export function insertDecoration(ctx: CommandContext, payload: CreateDecorationPayload): void {
  if (!DECORATION_KINDS.has(payload.kind)) {
    throw new DomainError('VALIDATION_FAILED', `unknown decoration kind "${payload.kind}"`)
  }
  const canvas = ctx.db.get<{ id: string }>(
    `SELECT id FROM canvas
     WHERE id = ? AND project_id = ? AND lifecycle_state = 'active'`,
    payload.canvasId,
    ctx.projectId,
  )
  if (!canvas) throw new DomainError('CANVAS_NOT_FOUND', `no active canvas ${payload.canvasId}`)
  validateAnchor(ctx, payload.kind, payload.anchorStartPlacementId, 'start', payload.canvasId)
  validateAnchor(ctx, payload.kind, payload.anchorEndPlacementId, 'end', payload.canvasId)
  if (payload.groupId !== undefined && payload.groupId !== null) {
    const group = ctx.db.get<{ id: string }>(
      'SELECT id FROM decoration_group WHERE id = ? AND canvas_id = ?',
      payload.groupId,
      payload.canvasId,
    )
    if (!group) {
      throw new DomainError('GROUP_NOT_FOUND', `no decoration group ${payload.groupId}`)
    }
  }
  const now = ctx.now()
  ctx.db.run(
    `INSERT INTO decoration
       (id, project_id, canvas_id, kind, data, render_order, locked, hidden,
        group_id, anchor_start_placement_id, anchor_end_placement_id,
        created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    payload.decorationId,
    ctx.projectId,
    payload.canvasId,
    payload.kind,
    JSON.stringify(payload.data),
    payload.renderOrder ?? nextRenderOrder(ctx, payload.canvasId),
    payload.locked ? 1 : 0,
    payload.hidden ? 1 : 0,
    payload.groupId ?? null,
    payload.anchorStartPlacementId ?? null,
    payload.anchorEndPlacementId ?? null,
    now,
    now,
  )
}

/** Hard-deletes one active decoration and returns the exact payload
 * that recreates it — shared by DeleteDecoration and DeleteContent. */
export function deleteDecorationRow(
  ctx: CommandContext,
  decorationId: string,
): CreateDecorationPayload {
  const prior = requireDecoration(ctx, decorationId)
  ctx.db.run('DELETE FROM decoration WHERE id = ?', decorationId)
  return {
    decorationId: prior.id,
    canvasId: prior.canvas_id,
    kind: prior.kind as CreateDecorationPayload['kind'],
    data: JSON.parse(prior.data) as Record<string, unknown>,
    anchorStartPlacementId: prior.anchor_start_placement_id,
    anchorEndPlacementId: prior.anchor_end_placement_id,
    renderOrder: prior.render_order,
    groupId: prior.group_id,
    locked: prior.locked === 1,
    hidden: prior.hidden === 1,
  }
}

export function registerDecorationHandlers(registry: CommandRegistry<CommandContext>): void {
  registry.register<CreateDecorationPayload>(COMMAND_CREATE_DECORATION, 1, (ctx, payload) => {
    insertDecoration(ctx, payload)
    return {
      affected: [{ kind: 'decoration', id: payload.decorationId }],
      inverse: {
        commandType: COMMAND_DELETE_DECORATION,
        commandVersion: 1,
        payload: { decorationId: payload.decorationId } satisfies DeleteDecorationPayload,
      },
    }
  })

  registry.register<UpdateDecorationPayload>(COMMAND_UPDATE_DECORATION, 1, (ctx, payload) => {
    const prior = requireDecoration(ctx, payload.decorationId)
    const set = payload.set ?? {}
    const priorSet: UpdateDecorationPayload['set'] = {}

    const assignments: string[] = []
    const params: (string | number | null)[] = []
    if (set.data !== undefined) {
      assignments.push('data = ?')
      params.push(JSON.stringify(set.data))
      priorSet.data = JSON.parse(prior.data) as Record<string, unknown>
    }
    if (set.locked !== undefined) {
      assignments.push('locked = ?')
      params.push(set.locked ? 1 : 0)
      priorSet.locked = prior.locked === 1
    }
    if (set.hidden !== undefined) {
      assignments.push('hidden = ?')
      params.push(set.hidden ? 1 : 0)
      priorSet.hidden = prior.hidden === 1
    }
    if (set.anchorStartPlacementId !== undefined) {
      // Validate against the decoration's stored canvas (prior.canvas_id),
      // never a payload claim — UpdateDecorationPayload carries no
      // canvasId, but re-anchoring must still be pinned to where the
      // decoration actually lives (CA-012).
      validateAnchor(ctx, prior.kind, set.anchorStartPlacementId, 'start', prior.canvas_id)
      assignments.push('anchor_start_placement_id = ?')
      params.push(set.anchorStartPlacementId)
      priorSet.anchorStartPlacementId = prior.anchor_start_placement_id
    }
    if (set.anchorEndPlacementId !== undefined) {
      validateAnchor(ctx, prior.kind, set.anchorEndPlacementId, 'end', prior.canvas_id)
      assignments.push('anchor_end_placement_id = ?')
      params.push(set.anchorEndPlacementId)
      priorSet.anchorEndPlacementId = prior.anchor_end_placement_id
    }
    if (assignments.length === 0) {
      throw new DomainError('VALIDATION_FAILED', 'UpdateDecoration requires at least one field')
    }
    ctx.db.run(
      `UPDATE decoration SET ${assignments.join(', ')}, updated_at = ? WHERE id = ?`,
      ...params,
      ctx.now(),
      payload.decorationId,
    )
    return {
      affected: [{ kind: 'decoration', id: payload.decorationId }],
      inverse: {
        commandType: COMMAND_UPDATE_DECORATION,
        commandVersion: 1,
        payload: {
          decorationId: payload.decorationId,
          set: priorSet,
        } satisfies UpdateDecorationPayload,
      },
    }
  })

  registry.register<DeleteDecorationPayload>(COMMAND_DELETE_DECORATION, 1, (ctx, payload) => {
    // Hard delete: decorations are canvas-local visual content, and
    // the inverse recreates the exact prior row, so no trash round
    // trip is needed (AI-IMP-013 owns lifecycle semantics).
    const recreate = deleteDecorationRow(ctx, payload.decorationId)
    return {
      affected: [{ kind: 'decoration', id: payload.decorationId }],
      inverse: {
        commandType: COMMAND_CREATE_DECORATION,
        commandVersion: 1,
        payload: recreate,
      },
    }
  })

  registry.register<GroupDecorationsPayload>(COMMAND_GROUP_DECORATIONS, 1, (ctx, payload) => {
    if (payload.decorationIds.length < 2) {
      throw new DomainError('VALIDATION_FAILED', 'GroupDecorations requires at least two members')
    }
    const canvas = ctx.db.get<{ id: string }>(
      `SELECT id FROM canvas
       WHERE id = ? AND project_id = ? AND lifecycle_state = 'active'`,
      payload.canvasId,
      ctx.projectId,
    )
    if (!canvas) throw new DomainError('CANVAS_NOT_FOUND', `no active canvas ${payload.canvasId}`)
    for (const decorationId of payload.decorationIds) {
      const row = requireDecoration(ctx, decorationId)
      if (row.canvas_id !== payload.canvasId) {
        // §6.8: groups are canvas-local.
        throw new DomainError('VALIDATION_FAILED', 'grouped decorations must share one canvas', {
          decorationId,
          canvasId: payload.canvasId,
        })
      }
      if (row.group_id !== null) {
        throw new DomainError('DECORATION_ALREADY_GROUPED', 'decoration is already in a group', {
          decorationId,
          groupId: row.group_id,
        })
      }
    }
    ctx.db.run(
      'INSERT INTO decoration_group (id, canvas_id, created_at) VALUES (?, ?, ?)',
      payload.groupId,
      payload.canvasId,
      ctx.now(),
    )
    const now = ctx.now()
    for (const decorationId of payload.decorationIds) {
      ctx.db.run(
        'UPDATE decoration SET group_id = ?, updated_at = ? WHERE id = ?',
        payload.groupId,
        now,
        decorationId,
      )
    }
    return {
      affected: payload.decorationIds.map((id) => ({ kind: 'decoration' as const, id })),
      inverse: {
        commandType: COMMAND_UNGROUP_DECORATIONS,
        commandVersion: 1,
        payload: { groupId: payload.groupId } satisfies UngroupDecorationsPayload,
      },
    }
  })

  registry.register<UngroupDecorationsPayload>(COMMAND_UNGROUP_DECORATIONS, 1, (ctx, payload) => {
    const group = ctx.db.get<{ id: string; canvas_id: string }>(
      'SELECT id, canvas_id FROM decoration_group WHERE id = ?',
      payload.groupId,
    )
    if (!group) throw new DomainError('GROUP_NOT_FOUND', `no decoration group ${payload.groupId}`)
    const members = ctx.db.all<{ id: string }>(
      'SELECT id FROM decoration WHERE group_id = ? ORDER BY id',
      payload.groupId,
    )
    const now = ctx.now()
    ctx.db.run(
      'UPDATE decoration SET group_id = NULL, updated_at = ? WHERE group_id = ?',
      now,
      payload.groupId,
    )
    ctx.db.run('DELETE FROM decoration_group WHERE id = ?', payload.groupId)
    return {
      affected: members.map((m) => ({ kind: 'decoration' as const, id: m.id })),
      inverse: {
        commandType: COMMAND_GROUP_DECORATIONS,
        commandVersion: 1,
        payload: {
          groupId: payload.groupId,
          canvasId: group.canvas_id,
          decorationIds: members.map((m) => m.id),
        } satisfies GroupDecorationsPayload,
      },
    }
  })
}
