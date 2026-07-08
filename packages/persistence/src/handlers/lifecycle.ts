import {
  COMMAND_DELETE_CONTENT,
  COMMAND_DELETE_PLACEMENT,
  COMMAND_PURGE_RECORD,
  COMMAND_RESTORE_CONTENT,
  COMMAND_RESTORE_PLACEMENT,
  COMMAND_RESTORE_RECORD,
  COMMAND_SET_TRASH_RETENTION,
  COMMAND_TRASH_CANVAS,
  COMMAND_TRASH_NODE,
  COMMAND_TRASH_NOTE,
  DomainError,
  type AffectedRecord,
  type CommandRegistry,
  type DeleteContentPayload,
  type DeletePlacementPayload,
  type PurgeRecordPayload,
  type RestoreContentPayload,
  type RestorePlacementPayload,
  type RestoreRecordPayload,
  type SetTrashRetentionPayload,
  type TrashCanvasPayload,
  type TrashNodePayload,
  type TrashNotePayload,
  type TrashRetention,
} from '@ew/commands'
import { extractWikiLinks } from '@ew/domain'
import type { CommandContext } from '../dispatcher'
import { bindUnresolvedMatching } from '../links'
import { deleteDecorationRow, insertDecoration, requireDecoration } from './decorations'
import { releaseConnectorAnchors, releaseConnectorAnchorsCapturing } from './placements'

const TRASH_RETENTION_KEY = 'trash_retention'
const TRASH_RETENTIONS = new Set<TrashRetention>(['never', '30d', '60d', '90d'])

type LifecycleTable = 'note' | 'node' | 'canvas'

/** Flip one row to trashed, stamping when and by which command (§9.1). */
function trashRow(
  ctx: CommandContext,
  table: LifecycleTable,
  id: string,
  commandId: string,
): void {
  ctx.db.run(
    `UPDATE ${table}
     SET lifecycle_state = 'trashed', trashed_at = ?, trashed_by_command_id = ?,
         updated_at = ?
     WHERE id = ?`,
    ctx.now(),
    commandId,
    ctx.now(),
    id,
  )
}

/** Flip one trashed row back to active, clearing the trash stamps. */
function restoreRow(ctx: CommandContext, table: LifecycleTable, id: string): void {
  ctx.db.run(
    `UPDATE ${table}
     SET lifecycle_state = 'active', trashed_at = NULL, trashed_by_command_id = NULL,
         updated_at = ?
     WHERE id = ?`,
    ctx.now(),
    id,
  )
}

function requireLifecycleRow(
  ctx: CommandContext,
  table: LifecycleTable,
  id: string,
): { id: string; lifecycle_state: 'active' | 'trashed' } {
  const row = ctx.db.get<{ id: string; lifecycle_state: 'active' | 'trashed' }>(
    `SELECT id, lifecycle_state FROM ${table} WHERE id = ? AND project_id = ?`,
    id,
    ctx.projectId,
  )
  if (!row) {
    throw new DomainError('RECORD_NOT_FOUND', `no ${table} ${id}`, { kind: table, id })
  }
  return row
}

function requireKind(kind: unknown): LifecycleTable {
  if (kind !== 'note' && kind !== 'node' && kind !== 'canvas') {
    throw new DomainError('VALIDATION_FAILED', 'kind must be "note", "node", or "canvas"')
  }
  return kind
}

/**
 * §9.2 bare node: no note reference, no tag assignments, no owned
 * canvas, and no placements (rows in any lifecycle state count — a
 * placement preserved by a trashed canvas still revives on restore).
 */
function isBareNode(ctx: CommandContext, nodeId: string): boolean {
  const counts = ctx.db.get<{ notes: number; tags: number; canvases: number; placements: number }>(
    `SELECT
       (SELECT count(*) FROM node WHERE id = ?1 AND note_id IS NOT NULL) AS notes,
       (SELECT count(*) FROM tag_assignment WHERE node_id = ?1) AS tags,
       (SELECT count(*) FROM canvas WHERE node_id = ?1) AS canvases,
       (SELECT count(*) FROM placement WHERE node_id = ?1) AS placements`,
    nodeId,
  )!
  return counts.notes === 0 && counts.tags === 0 && counts.canvases === 0 && counts.placements === 0
}

/**
 * §9.2 placement delete, shared by DeletePlacement and DeleteContent:
 * command-undo-recoverable hard delete that frees anchored connector
 * endpoints immediately, and — when this was the last placement of a
 * bare node — trashes that node within the same user-level command
 * (never the root node, never a purge; invariants 2/11). The node's
 * presence in `affected` is the Keep in Project signal. Returns the
 * payload that restores the exact prior row.
 */
function deletePlacementRow(
  ctx: CommandContext,
  placementId: string,
  commandId: string,
  affected: AffectedRecord[],
): RestorePlacementPayload {
  const prior = ctx.db.get<{
    id: string
    canvas_id: string
    node_id: string
    x: number
    y: number
    width: number | null
    height: number | null
    scale: number
    rotation: number
    flip_x: number
    flip_y: number
    render_order: number
    label_visible: number
    locked: number
  }>(
    `SELECT id, canvas_id, node_id, x, y, width, height, scale, rotation,
            flip_x, flip_y, render_order, label_visible, locked
     FROM placement
     WHERE id = ? AND project_id = ? AND lifecycle_state = 'active'`,
    placementId,
    ctx.projectId,
  )
  if (!prior) {
    throw new DomainError('PLACEMENT_NOT_FOUND', `no active placement ${placementId}`)
  }

  const releasedAnchors = releaseConnectorAnchorsCapturing(ctx, placementId)
  // AI-IMP-180 (§4.9): snapshot every frame_member row keyed on this
  // placement BEFORE the DELETE — migration 0007's ON DELETE CASCADE on
  // both FKs would silently wipe them otherwise. One OR captures both
  // directions: the row where this placement is a member of some frame,
  // and every row where this placement IS the frame and others are its
  // members. Deleting a frame therefore carries all its members back.
  const capturedFrameMembers = ctx.db
    .all<{ member_placement_id: string; frame_placement_id: string }>(
      `SELECT member_placement_id, frame_placement_id FROM frame_member
       WHERE member_placement_id = ?1 OR frame_placement_id = ?1`,
      placementId,
    )
    .map((r) => ({
      memberPlacementId: r.member_placement_id,
      framePlacementId: r.frame_placement_id,
    }))
  ctx.db.run('DELETE FROM placement WHERE id = ?', placementId)
  affected.push(
    { kind: 'placement', id: placementId },
    ...releasedAnchors.map((a) => ({ kind: 'decoration' as const, id: a.decorationId })),
  )

  let restoreNodeId: string | null = null
  const nodeActive = ctx.db.get<{ id: string }>(
    "SELECT id FROM node WHERE id = ? AND lifecycle_state = 'active'",
    prior.node_id,
  )
  if (nodeActive && prior.node_id !== ctx.rootNodeId && isBareNode(ctx, prior.node_id)) {
    trashRow(ctx, 'node', prior.node_id, commandId)
    affected.push({ kind: 'node', id: prior.node_id })
    restoreNodeId = prior.node_id
  }

  return {
    placementId: prior.id,
    canvasId: prior.canvas_id,
    nodeId: prior.node_id,
    x: prior.x,
    y: prior.y,
    width: prior.width,
    height: prior.height,
    scale: prior.scale,
    rotation: prior.rotation,
    flipX: prior.flip_x === 1,
    flipY: prior.flip_y === 1,
    renderOrder: prior.render_order,
    labelVisible: prior.label_visible === 1,
    locked: prior.locked === 1,
    restoreNodeId,
    releasedAnchors,
    capturedFrameMembers,
  }
}

/** Recreates a deleted placement row (and revives a bare-trashed
 * node) — shared by RestorePlacement and RestoreContent. */
function restorePlacementRow(
  ctx: CommandContext,
  payload: RestorePlacementPayload,
  affected: AffectedRecord[],
): void {
  if (payload.restoreNodeId) {
    // Undo of the bare-node auto-trash; a no-op when the node was
    // already restored via Keep in Project (RestoreRecord).
    const node = requireLifecycleRow(ctx, 'node', payload.restoreNodeId)
    if (node.lifecycle_state === 'trashed') {
      restoreRow(ctx, 'node', payload.restoreNodeId)
      affected.push({ kind: 'node', id: payload.restoreNodeId })
    }
  }
  const now = ctx.now()
  ctx.db.run(
    `INSERT INTO placement
       (id, project_id, canvas_id, node_id, x, y, width, height, scale,
        rotation, flip_x, flip_y, render_order, label_visible, locked,
        created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    payload.placementId,
    ctx.projectId,
    payload.canvasId,
    payload.nodeId,
    payload.x,
    payload.y,
    payload.width,
    payload.height,
    payload.scale,
    payload.rotation,
    payload.flipX ? 1 : 0,
    payload.flipY ? 1 : 0,
    payload.renderOrder,
    payload.labelVisible ? 1 : 0,
    payload.locked ? 1 : 0,
    now,
    now,
  )
  affected.push({ kind: 'placement', id: payload.placementId })

  // AI-IMP-164 (§6.8/§10.2): re-bind every connector endpoint the
  // delete released, now that the placement row exists again. Optional
  // for command-log records written before this field existed — those
  // simply restore the placement alone, as they did before. Each freed
  // side is inverted independently (only its own start/end key and
  // anchor column), so when both endpoints of one connector were
  // deleted+restored the two re-binds never clobber each other's blob
  // regardless of order.
  for (const anchor of payload.releasedAnchors ?? []) {
    const current = ctx.db.get<{ data: string }>(
      'SELECT data FROM decoration WHERE id = ?',
      anchor.decorationId,
    )
    // A connector deleted alongside its anchor was recreated separately
    // with its anchors intact and never entered releasedAnchors; if the
    // row is somehow absent, there is nothing to re-bind.
    if (!current) continue
    const data = JSON.parse(current.data) as Record<string, unknown>
    if (anchor.freedStart) {
      if ('start' in anchor.priorData) data.start = anchor.priorData.start
      else delete data.start
    }
    if (anchor.freedEnd) {
      if ('end' in anchor.priorData) data.end = anchor.priorData.end
      else delete data.end
    }
    ctx.db.run(
      `UPDATE decoration SET
         data = ?1,
         anchor_start_placement_id = CASE WHEN ?2 THEN ?4
                                          ELSE anchor_start_placement_id END,
         anchor_end_placement_id = CASE WHEN ?3 THEN ?4
                                        ELSE anchor_end_placement_id END,
         updated_at = ?5
       WHERE id = ?6`,
      JSON.stringify(data),
      anchor.freedStart ? 1 : 0,
      anchor.freedEnd ? 1 : 0,
      payload.placementId,
      now,
      anchor.decorationId,
    )
    affected.push({ kind: 'decoration', id: anchor.decorationId })
  }
}

/**
 * AI-IMP-180 (§4.9): re-insert the frame_member rows the delete's
 * cascade released. Runs as its OWN pass, AFTER every placement in the
 * restore is live again — a member row keys on two placement rows, and
 * a batch DeleteContent can delete a frame AND its members together.
 * Because a row {member, frame} cascades the instant EITHER endpoint is
 * deleted, only the first-deleted endpoint's payload captures it (the
 * later one finds it already gone); that endpoint may be the frame,
 * whose placement RestoreContent revives before its members exist. So
 * membership must never be re-inserted inside the per-placement restore
 * — only once all placements are back. Optional for command-log records
 * written before this field existed (missing = empty, placement
 * restores ungrouped, exactly as before). The both-endpoints-live guard
 * and ON CONFLICT DO NOTHING are defensive: a captured row referencing a
 * placement not being restored is skipped rather than throwing.
 */
function reinsertCapturedFrameMembers(
  ctx: CommandContext,
  payload: RestorePlacementPayload,
  affected: AffectedRecord[],
): void {
  const now = ctx.now()
  for (const member of payload.capturedFrameMembers ?? []) {
    const bothLive = ctx.db.get<{ n: number }>(
      'SELECT count(*) AS n FROM placement WHERE id IN (?1, ?2)',
      member.memberPlacementId,
      member.framePlacementId,
    )!.n
    if (bothLive < 2) continue
    ctx.db.run(
      `INSERT INTO frame_member
         (member_placement_id, frame_placement_id, project_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(member_placement_id) DO NOTHING`,
      member.memberPlacementId,
      member.framePlacementId,
      ctx.projectId,
      now,
      now,
    )
    // Name both endpoints so frame-tree subscribers re-query (the member
    // rejoins; the frame's grouping changed).
    affected.push(
      { kind: 'placement', id: member.memberPlacementId },
      { kind: 'placement', id: member.framePlacementId },
    )
  }
}

/**
 * §9.7 purge of a canvas-local aggregate: releases connector anchors
 * held by the canvas's placements (anchored decorations may live on
 * any canvas), then hard-deletes decorations, groups, placements,
 * and the canvas row in FK-safe order. Also used for a purged node's
 * owned canvas (§9.6). Appends every removed record to `affected`.
 *
 * Bookmarks targeting the canvas deliberately SURVIVE (§8.1,
 * AI-IMP-061): they are never deleted automatically — the menu
 * presents them as broken and offers removal. The bookmark table has
 * no FK on canvas_id for exactly this reason.
 */
function purgeCanvasAggregate(ctx: CommandContext, canvasId: string, affected: AffectedRecord[]): void {
  const placements = ctx.db.all<{ id: string }>(
    'SELECT id FROM placement WHERE canvas_id = ?',
    canvasId,
  )
  for (const placement of placements) {
    for (const decorationId of releaseConnectorAnchors(ctx, placement.id)) {
      affected.push({ kind: 'decoration', id: decorationId })
    }
  }
  const decorations = ctx.db.all<{ id: string }>(
    'SELECT id FROM decoration WHERE canvas_id = ?',
    canvasId,
  )
  ctx.db.run('DELETE FROM decoration WHERE canvas_id = ?', canvasId)
  ctx.db.run('DELETE FROM decoration_group WHERE canvas_id = ?', canvasId)
  ctx.db.run('DELETE FROM placement WHERE canvas_id = ?', canvasId)
  ctx.db.run('DELETE FROM canvas WHERE id = ?', canvasId)
  for (const d of decorations) affected.push({ kind: 'decoration', id: d.id })
  for (const p of placements) affected.push({ kind: 'placement', id: p.id })
  // Surviving bookmarks changed state (active/trashed → broken): name
  // them so subscribers (the bookmark menu) re-query.
  const bookmarks = ctx.db.all<{ id: string }>(
    'SELECT id FROM bookmark WHERE canvas_id = ?',
    canvasId,
  )
  for (const b of bookmarks) affected.push({ kind: 'bookmark', id: b.id })
  affected.push({ kind: 'canvas', id: canvasId })
}

/**
 * §9.6/§9.7 purge of a node aggregate: every placement of the node
 * (anchors released first), its owned canvas and canvas-local
 * content, its tag assignments, and the node row. The attached note
 * and any Asset rows survive; asset blob eligibility is recomputed
 * lazily by gc.ts (§9.8).
 */
function purgeNodeAggregate(ctx: CommandContext, nodeId: string, affected: AffectedRecord[]): void {
  const placements = ctx.db.all<{ id: string }>(
    'SELECT id FROM placement WHERE node_id = ?',
    nodeId,
  )
  for (const placement of placements) {
    for (const decorationId of releaseConnectorAnchors(ctx, placement.id)) {
      affected.push({ kind: 'decoration', id: decorationId })
    }
  }
  ctx.db.run('DELETE FROM placement WHERE node_id = ?', nodeId)
  for (const p of placements) affected.push({ kind: 'placement', id: p.id })

  const ownedCanvas = ctx.db.get<{ id: string }>(
    'SELECT id FROM canvas WHERE node_id = ?',
    nodeId,
  )
  if (ownedCanvas) purgeCanvasAggregate(ctx, ownedCanvas.id, affected)

  ctx.db.run('DELETE FROM tag_assignment WHERE node_id = ?', nodeId)
  ctx.db.run('DELETE FROM node WHERE id = ?', nodeId)
  affected.push({ kind: 'node', id: nodeId })
}

/**
 * §9.7/§7.1 purge of a note: inbound bound link records from other
 * notes convert to broken, storing the source token's raw title text
 * as last-known display text (re-read from source bodies by token
 * range; falls back to the purged note's title). Broken records never
 * re-bind implicitly (invariant 27), so a later same-title CreateNote
 * binds nothing. The note's own outbound records go with it, node
 * references are cleared, and the row's deletion ends the title_key
 * reservation.
 */
function purgeNoteAggregate(ctx: CommandContext, noteId: string, affected: AffectedRecord[]): void {
  const note = ctx.db.get<{ title: string }>('SELECT title FROM note WHERE id = ?', noteId)!
  const inbound = ctx.db.all<{ id: string; source_note_id: string; range_start: number }>(
    `SELECT id, source_note_id, range_start FROM link
     WHERE target_note_id = ?1 AND state = 'bound' AND source_note_id <> ?1
     ORDER BY source_note_id, range_start`,
    noteId,
  )
  const now = ctx.now()
  let tokensBySource: Map<number, string> | null = null
  let currentSource: string | null = null
  for (const link of inbound) {
    if (link.source_note_id !== currentSource) {
      currentSource = link.source_note_id
      const body = ctx.db.get<{ body: string }>(
        'SELECT body FROM note WHERE id = ?',
        link.source_note_id,
      )!.body
      tokensBySource = new Map(extractWikiLinks(body).map((t) => [t.start, t.title]))
    }
    ctx.db.run(
      `UPDATE link
       SET state = 'broken', target_note_id = NULL, target_title_key = NULL,
           display_text = ?, updated_at = ?
       WHERE id = ?`,
      tokensBySource?.get(link.range_start) ?? note.title,
      now,
      link.id,
    )
    affected.push({ kind: 'link', id: link.id })
  }

  const outbound = ctx.db.all<{ id: string }>(
    'SELECT id FROM link WHERE source_note_id = ?',
    noteId,
  )
  ctx.db.run('DELETE FROM link WHERE source_note_id = ?', noteId)
  for (const l of outbound) affected.push({ kind: 'link', id: l.id })

  const referents = ctx.db.all<{ id: string }>('SELECT id FROM node WHERE note_id = ?', noteId)
  ctx.db.run('UPDATE node SET note_id = NULL, updated_at = ? WHERE note_id = ?', now, noteId)
  for (const n of referents) affected.push({ kind: 'node', id: n.id })

  ctx.db.run('DELETE FROM note WHERE id = ?', noteId)
  affected.push({ kind: 'note', id: noteId })
}

/**
 * Lifecycle command handlers (RFC-0001 §9, AI-IMP-013): trash is a
 * recoverable lifecycle state over intact aggregates, never a
 * container (§9.1). Trash commands touch exactly one row; ordinary
 * queries exclude trashed records (invariant 13); Restore reverses
 * losslessly; Purge is the only hard-deleting path and returns
 * `inverse: null` as the undo-invalidation signal.
 */
export function registerLifecycleHandlers(registry: CommandRegistry<CommandContext>): void {
  registry.register<DeletePlacementPayload>(
    COMMAND_DELETE_PLACEMENT,
    1,
    (ctx, payload, envelope) => {
      const affected: AffectedRecord[] = []
      const restore = deletePlacementRow(ctx, payload.placementId, envelope.commandId, affected)
      return {
        affected,
        inverse: {
          commandType: COMMAND_RESTORE_PLACEMENT,
          commandVersion: 1,
          payload: restore,
        },
      }
    },
  )

  registry.register<DeleteContentPayload>(COMMAND_DELETE_CONTENT, 1, (ctx, payload, envelope) => {
    // One user action — clearing a selection — is ONE durable command
    // and one future undo step (AI-IMP-028), whatever the mix of
    // placements and decorations selected.
    const total = payload.placementIds.length + payload.decorationIds.length
    if (total === 0) {
      throw new DomainError('VALIDATION_FAILED', 'DeleteContent requires at least one item')
    }
    if (
      new Set(payload.placementIds).size !== payload.placementIds.length ||
      new Set(payload.decorationIds).size !== payload.decorationIds.length
    ) {
      throw new DomainError('VALIDATION_FAILED', 'duplicate ids in DeleteContent')
    }
    // Validate everything before touching anything: all items must be
    // active and on the named canvas.
    for (const placementId of payload.placementIds) {
      const row = ctx.db.get<{ canvas_id: string }>(
        `SELECT canvas_id FROM placement
         WHERE id = ? AND project_id = ? AND lifecycle_state = 'active'`,
        placementId,
        ctx.projectId,
      )
      if (!row) throw new DomainError('PLACEMENT_NOT_FOUND', `no active placement ${placementId}`)
      if (row.canvas_id !== payload.canvasId) {
        throw new DomainError('CROSS_CANVAS_CONTENT', 'DeleteContent items must share one canvas', {
          placementId,
        })
      }
    }
    for (const decorationId of payload.decorationIds) {
      const row = requireDecoration(ctx, decorationId)
      if (row.canvas_id !== payload.canvasId) {
        throw new DomainError('CROSS_CANVAS_CONTENT', 'DeleteContent items must share one canvas', {
          decorationId,
        })
      }
    }

    const affected: AffectedRecord[] = []
    // Decorations first: a connector being deleted alongside its
    // anchor placement keeps its anchor ids in the recreate payload
    // (placement deletion would null them via releaseConnectorAnchors).
    const decorations = payload.decorationIds.map((id) => {
      const recreate = deleteDecorationRow(ctx, id)
      affected.push({ kind: 'decoration', id })
      return recreate
    })
    const placements = payload.placementIds.map((id) =>
      deletePlacementRow(ctx, id, envelope.commandId, affected),
    )

    return {
      affected,
      inverse: {
        commandType: COMMAND_RESTORE_CONTENT,
        commandVersion: 1,
        payload: {
          canvasId: payload.canvasId,
          placements,
          decorations,
        } satisfies RestoreContentPayload,
      },
    }
  })

  registry.register<RestoreContentPayload>(COMMAND_RESTORE_CONTENT, 1, (ctx, payload) => {
    const affected: AffectedRecord[] = []
    // Placements first (reviving any bare-trashed nodes), then
    // decorations so connector anchors resolve against live rows.
    for (const placement of payload.placements) {
      restorePlacementRow(ctx, placement, affected)
    }
    // Frame membership only after EVERY placement is live: a batch that
    // deleted a frame with its members captured all rows in the
    // frame's payload, which restores before the members (AI-IMP-180).
    for (const placement of payload.placements) {
      reinsertCapturedFrameMembers(ctx, placement, affected)
    }
    for (const decoration of payload.decorations) {
      insertDecoration(ctx, decoration)
      affected.push({ kind: 'decoration', id: decoration.decorationId })
    }
    return {
      affected,
      inverse: {
        commandType: COMMAND_DELETE_CONTENT,
        commandVersion: 1,
        payload: {
          canvasId: payload.canvasId,
          placementIds: payload.placements.map((p) => p.placementId),
          decorationIds: payload.decorations.map((d) => d.decorationId),
        } satisfies DeleteContentPayload,
      },
    }
  })

  registry.register<RestorePlacementPayload>(COMMAND_RESTORE_PLACEMENT, 1, (ctx, payload) => {
    const affected: AffectedRecord[] = []
    restorePlacementRow(ctx, payload, affected)
    reinsertCapturedFrameMembers(ctx, payload, affected)
    return {
      affected,
      inverse: {
        commandType: COMMAND_DELETE_PLACEMENT,
        commandVersion: 1,
        payload: { placementId: payload.placementId } satisfies DeletePlacementPayload,
      },
    }
  })

  registry.register<TrashNotePayload>(COMMAND_TRASH_NOTE, 1, (ctx, payload, envelope) => {
    // §9.4: only the note row changes state. Node attachments and
    // bound link target ids stay intact so restore is lossless, and
    // the title_key reservation holds while trashed (invariant 5).
    const note = requireLifecycleRow(ctx, 'note', payload.noteId)
    if (note.lifecycle_state !== 'active') {
      throw new DomainError('NOTE_NOT_ACTIVE', `note ${payload.noteId} is already in Trash`, {
        noteId: payload.noteId,
      })
    }
    trashRow(ctx, 'note', payload.noteId, envelope.commandId)
    return {
      affected: [{ kind: 'note', id: payload.noteId }],
      inverse: {
        commandType: COMMAND_RESTORE_RECORD,
        commandVersion: 1,
        payload: { kind: 'note', id: payload.noteId } satisfies RestoreRecordPayload,
      },
    }
  })

  registry.register<TrashNodePayload>(COMMAND_TRASH_NODE, 1, (ctx, payload, envelope) => {
    // Invariant 2/§4.10: the root node is protected (the schema
    // trigger would abort anyway; pre-check for a structured error).
    if (payload.nodeId === ctx.rootNodeId) {
      throw new DomainError('ROOT_NODE_PROTECTED', 'the root node cannot be trashed', {
        nodeId: payload.nodeId,
      })
    }
    const node = requireLifecycleRow(ctx, 'node', payload.nodeId)
    if (node.lifecycle_state !== 'active') {
      throw new DomainError('NODE_NOT_ACTIVE', `node ${payload.nodeId} is already in Trash`, {
        nodeId: payload.nodeId,
      })
    }
    // §9.6: the node row alone flips; placements, owned canvas, tags,
    // appearance, and the note reference stay as rows — one preserved
    // aggregate. The attached note stays active even when this node is
    // its only referent (invariant 15).
    trashRow(ctx, 'node', payload.nodeId, envelope.commandId)
    return {
      affected: [{ kind: 'node', id: payload.nodeId }],
      inverse: {
        commandType: COMMAND_RESTORE_RECORD,
        commandVersion: 1,
        payload: { kind: 'node', id: payload.nodeId } satisfies RestoreRecordPayload,
      },
    }
  })

  registry.register<TrashCanvasPayload>(COMMAND_TRASH_CANVAS, 1, (ctx, payload, envelope) => {
    // Invariant 2/§4.10: the root canvas is protected.
    if (payload.canvasId === ctx.rootCanvasId) {
      throw new DomainError('ROOT_CANVAS_PROTECTED', 'the root canvas cannot be trashed', {
        canvasId: payload.canvasId,
      })
    }
    const canvas = requireLifecycleRow(ctx, 'canvas', payload.canvasId)
    if (canvas.lifecycle_state !== 'active') {
      throw new DomainError('CANVAS_NOT_ACTIVE', `canvas ${payload.canvasId} is already in Trash`, {
        canvasId: payload.canvasId,
      })
    }
    // §9.5: the canvas row alone flips; placements, decorations,
    // background, camera, and grouping stay as rows. Because the
    // aggregate preserves its placements recoverably, this is NOT
    // last-placement deletion — no bare-node auto-trash. Referenced
    // nodes and notes stay active (invariant 14).
    trashRow(ctx, 'canvas', payload.canvasId, envelope.commandId)
    return {
      affected: [{ kind: 'canvas', id: payload.canvasId }],
      inverse: {
        commandType: COMMAND_RESTORE_RECORD,
        commandVersion: 1,
        payload: { kind: 'canvas', id: payload.canvasId } satisfies RestoreRecordPayload,
      },
    }
  })

  registry.register<RestoreRecordPayload>(COMMAND_RESTORE_RECORD, 1, (ctx, payload) => {
    const kind = requireKind(payload.kind)
    const row = requireLifecycleRow(ctx, kind, payload.id)
    if (row.lifecycle_state !== 'trashed') {
      throw new DomainError('RECORD_NOT_TRASHED', `${kind} ${payload.id} is not in Trash`, {
        kind,
        id: payload.id,
      })
    }
    restoreRow(ctx, kind, payload.id)
    const affected: AffectedRecord[] = [{ kind, id: payload.id }]

    let inverseType: string
    let inversePayload: unknown
    if (kind === 'note') {
      // §9.7/invariant 27: the trashed note kept its title_key
      // reservation, so bound links never broke and nothing rebinds —
      // but unresolved records matching the title bind now, exactly as
      // on create/rename.
      const note = ctx.db.get<{ title_key: string }>(
        'SELECT title_key FROM note WHERE id = ?',
        payload.id,
      )!
      affected.push(...bindUnresolvedMatching(ctx, note.title_key, payload.id))
      inverseType = COMMAND_TRASH_NOTE
      inversePayload = { noteId: payload.id } satisfies TrashNotePayload
    } else if (kind === 'node') {
      // §9.6: flipping the node back revives its placements in
      // canvas-contents queries; canvas, tags, appearance, and note
      // attachment were never detached.
      inverseType = COMMAND_TRASH_NODE
      inversePayload = { nodeId: payload.id } satisfies TrashNodePayload
    } else {
      inverseType = COMMAND_TRASH_CANVAS
      inversePayload = { canvasId: payload.id } satisfies TrashCanvasPayload
    }
    return {
      affected,
      inverse: { commandType: inverseType, commandVersion: 1, payload: inversePayload },
    }
  })

  registry.register<PurgeRecordPayload>(COMMAND_PURGE_RECORD, 1, (ctx, payload) => {
    const kind = requireKind(payload.kind)
    const row = requireLifecycleRow(ctx, kind, payload.id)
    // §9.7: purge is Delete Permanently for records already in Trash;
    // active records must go through their trash command first. This
    // also makes the root node/canvas unpurgeable (they can never be
    // trashed), backed by the schema's delete triggers.
    if (row.lifecycle_state !== 'trashed') {
      throw new DomainError('RECORD_NOT_TRASHED', `${kind} ${payload.id} is not in Trash`, {
        kind,
        id: payload.id,
      })
    }
    const affected: AffectedRecord[] = []
    if (kind === 'note') purgeNoteAggregate(ctx, payload.id, affected)
    else if (kind === 'node') purgeNodeAggregate(ctx, payload.id, affected)
    else purgeCanvasAggregate(ctx, payload.id, affected)
    // inverse: null IS the undo-invalidation flag (§9.7): EPIC-007
    // drops undo entries whose inverses depend on any id in
    // `affected`, which names every removed or converted record.
    return { affected, inverse: null }
  })

  registry.register<SetTrashRetentionPayload>(COMMAND_SET_TRASH_RETENTION, 1, (ctx, payload) => {
    if (!TRASH_RETENTIONS.has(payload?.retention as TrashRetention)) {
      throw new DomainError(
        'VALIDATION_FAILED',
        'retention must be one of "never", "30d", "60d", "90d"',
      )
    }
    const prior = ctx.db.get<{ value: string }>(
      'SELECT value FROM settings WHERE project_id = ? AND key = ?',
      ctx.projectId,
      TRASH_RETENTION_KEY,
    )
    const priorRetention = prior ? (JSON.parse(prior.value) as TrashRetention) : 'never'
    ctx.db.run(
      `INSERT INTO settings (project_id, key, value) VALUES (?, ?, ?)
       ON CONFLICT (project_id, key) DO UPDATE SET value = excluded.value`,
      ctx.projectId,
      TRASH_RETENTION_KEY,
      JSON.stringify(payload.retention),
    )
    return {
      affected: [{ kind: 'project', id: ctx.projectId }],
      inverse: {
        commandType: COMMAND_SET_TRASH_RETENTION,
        commandVersion: 1,
        payload: { retention: priorRetention } satisfies SetTrashRetentionPayload,
      },
    }
  })
}
