import {
  COMMAND_ASSIGN_TAG_TO_NODE,
  COMMAND_CREATE_TAG,
  COMMAND_DELETE_DRAFT_TAG,
  COMMAND_DELETE_TAG,
  COMMAND_LIFT_TAG_SUPPRESSION,
  COMMAND_MERGE_TAG,
  COMMAND_RENAME_TAG,
  COMMAND_RESTORE_TAG,
  COMMAND_SET_TAG_APPEARANCE,
  COMMAND_SUPPRESS_TAG_SYNC,
  COMMAND_UNASSIGN_TAG_FROM_NODE,
  COMMAND_UNMERGE_TAG,
  DomainError,
  type AffectedRecord,
  type AssignTagToNodePayload,
  type CommandRegistry,
  type CreateTagPayload,
  type DeleteDraftTagPayload,
  type DeleteTagPayload,
  type LiftTagSuppressionPayload,
  type MergeTagPayload,
  type RenameTagPayload,
  type RestoredTagAssignment,
  type RestoreTagPayload,
  type SetTagAppearancePayload,
  type SuppressTagSyncPayload,
  type UnassignTagFromNodePayload,
  type UnmergeTagPayload,
} from '@ew/commands'
import { nameKey } from '@ew/domain'
import type { CommandContext } from '../dispatcher'

/** Full tag row an inverse must recreate byte-exact (§4.8). */
interface TagRow extends Record<string, unknown> {
  id: string
  name: string
  name_key: string
  color: string | null
  icon: string | null
  created_at: string
}

interface ImageTagSuppression {
  content_hash: string
  name_key: string
}

function imageTagSuppression(
  ctx: CommandContext,
  tagId: string,
  nodeId: string,
): ImageTagSuppression | undefined {
  return ctx.db.get<ImageTagSuppression>(
    `SELECT a.content_hash, t.name_key
       FROM node n
       JOIN asset a ON a.id = n.appearance_asset_id
       JOIN tag t ON t.id = ?
      WHERE n.id = ? AND n.project_id = ? AND n.lifecycle_state = 'active'
        AND n.appearance_kind = 'image'
        AND a.project_id = ? AND a.lifecycle_state = 'active' AND a.kind = 'image'
        AND t.project_id = ? AND t.lifecycle_state = 'active'`,
    tagId,
    nodeId,
    ctx.projectId,
    ctx.projectId,
    ctx.projectId,
  )
}

/** Loads a tag's ordered assignment list for exact-restore inverses. */
function loadAssignments(ctx: CommandContext, tagId: string): RestoredTagAssignment[] {
  return ctx.db
    .all<{ node_id: string; created_at: string }>(
      'SELECT node_id, created_at FROM tag_assignment WHERE tag_id = ? ORDER BY node_id',
      tagId,
    )
    .map((r) => ({ nodeId: r.node_id, createdAt: r.created_at }))
}

/** Re-inserts the tag row (updated_at re-stamped) then its assignments. */
function insertTagRow(
  ctx: CommandContext,
  tag: RestoreTagPayload['tag'],
  assignments: RestoredTagAssignment[],
  affected: AffectedRecord[],
): void {
  ctx.db.run(
    `INSERT INTO tag (id, project_id, name, name_key, color, icon, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    tag.tagId,
    ctx.projectId,
    tag.name,
    tag.nameKey,
    tag.color,
    tag.icon,
    tag.createdAt,
    ctx.now(),
  )
  affected.push({ kind: 'tag', id: tag.tagId })
  for (const a of assignments) {
    ctx.db.run(
      'INSERT INTO tag_assignment (tag_id, node_id, created_at) VALUES (?, ?, ?)',
      tag.tagId,
      a.nodeId,
      a.createdAt,
    )
    affected.push({ kind: 'node', id: a.nodeId })
  }
}

function requireTag<T extends Record<string, unknown>>(
  ctx: CommandContext,
  tagId: string,
  columns: string,
): T {
  const row = ctx.db.get<T>(
    `SELECT ${columns} FROM tag
     WHERE id = ? AND project_id = ? AND lifecycle_state = 'active'`,
    tagId,
    ctx.projectId,
  )
  if (!row) throw new DomainError('TAG_NOT_FOUND', `no active tag ${tagId}`)
  return row
}

function requireActiveNode(ctx: CommandContext, nodeId: string): void {
  const node = ctx.db.get<{ id: string }>(
    `SELECT id FROM node
     WHERE id = ? AND project_id = ? AND lifecycle_state = 'active'`,
    nodeId,
    ctx.projectId,
  )
  if (!node) throw new DomainError('NODE_NOT_FOUND', `no active node ${nodeId}`)
}

/** Throws TAG_NAME_CONFLICT when another tag holds this name_key. */
function checkNameConflict(ctx: CommandContext, name: string, excludeTagId?: string): string {
  const key = nameKey(name)
  if (key.length === 0) {
    throw new DomainError('VALIDATION_FAILED', 'tag name must be non-empty')
  }
  const existing = ctx.db.get<{ id: string }>(
    'SELECT id FROM tag WHERE project_id = ? AND name_key = ?',
    ctx.projectId,
    key,
  )
  if (existing && existing.id !== excludeTagId) {
    throw new DomainError('TAG_NAME_CONFLICT', `tag name "${name}" is already in use`, {
      existingTagId: existing.id,
      requestedName: name,
      nameKey: key,
    })
  }
  return key
}

/** Tombstone payloads carry the persisted key, not display text. */
function requireCanonicalNameKey(payload: unknown): string {
  if (typeof payload !== 'string') {
    throw new DomainError('VALIDATION_FAILED', 'tag sync nameKey must be a string')
  }
  const canonical = nameKey(payload)
  if (canonical.length === 0 || canonical !== payload) {
    throw new DomainError(
      'VALIDATION_FAILED',
      'tag sync nameKey must be non-empty and already normalized',
      { nameKey: payload, canonicalNameKey: canonical },
    )
  }
  return canonical
}

/**
 * Tag command handlers (RFC-0001 §4.8): flat project-scoped records,
 * name_key unique, assigned M:N to nodes only (invariant 8). Tag
 * identity is independent of name, so RenameTag never rewrites
 * assignments.
 */
export function registerTagHandlers(registry: CommandRegistry<CommandContext>): void {
  registry.register<CreateTagPayload>(COMMAND_CREATE_TAG, 1, (ctx, payload) => {
    const key = checkNameConflict(ctx, payload.name)
    const now = ctx.now()
    ctx.db.run(
      `INSERT INTO tag (id, project_id, name, name_key, color, icon, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      payload.tagId,
      ctx.projectId,
      payload.name,
      key,
      payload.color ?? null,
      payload.icon ?? null,
      now,
      now,
    )
    return {
      affected: [{ kind: 'tag', id: payload.tagId }],
      inverse: {
        commandType: COMMAND_DELETE_DRAFT_TAG,
        commandVersion: 1,
        payload: { tagId: payload.tagId } satisfies DeleteDraftTagPayload,
      },
    }
  })

  registry.register<DeleteDraftTagPayload>(COMMAND_DELETE_DRAFT_TAG, 1, (ctx, payload) => {
    const tag = requireTag<{ id: string; name: string; color: string | null; icon: string | null }>(
      ctx,
      payload.tagId,
      'id, name, color, icon',
    )
    const assignments = ctx.db.get<{ n: number }>(
      'SELECT count(*) AS n FROM tag_assignment WHERE tag_id = ?',
      payload.tagId,
    )!
    if (assignments.n > 0) {
      throw new DomainError(
        'TAG_NOT_DRAFT',
        'DeleteDraftTag only removes tags with no assignments',
        { tagId: payload.tagId, assignments: assignments.n },
      )
    }
    ctx.db.run('DELETE FROM tag WHERE id = ?', payload.tagId)
    return {
      affected: [{ kind: 'tag', id: payload.tagId }],
      inverse: {
        commandType: COMMAND_CREATE_TAG,
        commandVersion: 1,
        payload: {
          tagId: payload.tagId,
          name: tag.name,
          color: tag.color,
          icon: tag.icon,
        } satisfies CreateTagPayload,
      },
    }
  })

  registry.register<RenameTagPayload>(COMMAND_RENAME_TAG, 1, (ctx, payload) => {
    const prior = requireTag<{ name: string }>(ctx, payload.tagId, 'name')
    const key = checkNameConflict(ctx, payload.name, payload.tagId)
    // §4.8: identity is independent of name; tag_assignment rows
    // reference tag_id and are deliberately untouched here.
    ctx.db.run(
      'UPDATE tag SET name = ?, name_key = ?, updated_at = ? WHERE id = ?',
      payload.name,
      key,
      ctx.now(),
      payload.tagId,
    )
    return {
      affected: [{ kind: 'tag', id: payload.tagId }],
      inverse: {
        commandType: COMMAND_RENAME_TAG,
        commandVersion: 1,
        payload: { tagId: payload.tagId, name: prior.name } satisfies RenameTagPayload,
      },
    }
  })

  registry.register<AssignTagToNodePayload>(COMMAND_ASSIGN_TAG_TO_NODE, 1, (ctx, payload) => {
    requireTag(ctx, payload.tagId, 'id')
    requireActiveNode(ctx, payload.nodeId)
    const existing = ctx.db.get<{ tag_id: string }>(
      'SELECT tag_id FROM tag_assignment WHERE tag_id = ? AND node_id = ?',
      payload.tagId,
      payload.nodeId,
    )
    if (existing) {
      throw new DomainError('TAG_ALREADY_ASSIGNED', 'tag is already assigned to this node', {
        tagId: payload.tagId,
        nodeId: payload.nodeId,
      })
    }
    ctx.db.run(
      'INSERT INTO tag_assignment (tag_id, node_id, created_at) VALUES (?, ?, ?)',
      payload.tagId,
      payload.nodeId,
      ctx.now(),
    )
    const suppression = imageTagSuppression(ctx, payload.tagId, payload.nodeId)
    if (suppression) {
      ctx.db.run(
        `DELETE FROM tag_unassign_suppression
          WHERE project_id = ? AND content_hash = ? AND name_key = ? AND node_id = ?`,
        ctx.projectId,
        suppression.content_hash,
        suppression.name_key,
        payload.nodeId,
      )
    }
    return {
      affected: [
        { kind: 'tag', id: payload.tagId },
        { kind: 'node', id: payload.nodeId },
      ],
      inverse: {
        commandType: COMMAND_UNASSIGN_TAG_FROM_NODE,
        commandVersion: 1,
        payload: {
          tagId: payload.tagId,
          nodeId: payload.nodeId,
        } satisfies UnassignTagFromNodePayload,
      },
    }
  })

  registry.register<UnassignTagFromNodePayload>(
    COMMAND_UNASSIGN_TAG_FROM_NODE,
    1,
    (ctx, payload) => {
      const suppression = imageTagSuppression(ctx, payload.tagId, payload.nodeId)
      const removed = ctx.db.run(
        'DELETE FROM tag_assignment WHERE tag_id = ? AND node_id = ?',
        payload.tagId,
        payload.nodeId,
      )
      if (Number(removed.changes) === 0) {
        throw new DomainError('TAG_NOT_ASSIGNED', 'tag is not assigned to this node', {
          tagId: payload.tagId,
          nodeId: payload.nodeId,
        })
      }
      if (suppression) {
        ctx.db.run(
          `INSERT OR IGNORE INTO tag_unassign_suppression
             (project_id, content_hash, name_key, node_id, created_at)
           VALUES (?, ?, ?, ?, ?)`,
          ctx.projectId,
          suppression.content_hash,
          suppression.name_key,
          payload.nodeId,
          ctx.now(),
        )
      }
      return {
        affected: [
          { kind: 'tag', id: payload.tagId },
          { kind: 'node', id: payload.nodeId },
        ],
        inverse: {
          commandType: COMMAND_ASSIGN_TAG_TO_NODE,
          commandVersion: 1,
          payload: {
            tagId: payload.tagId,
            nodeId: payload.nodeId,
          } satisfies AssignTagToNodePayload,
        },
      }
    },
  )

  // §4.8 lifecycle-aware delete (AI-IMP-105): unassign everywhere and
  // remove the tag row in one transaction. Unlike DeleteDraftTag it
  // accepts in-use tags; the inverse (RestoreTag) recreates the row and
  // every prior assignment exactly.
  registry.register<DeleteTagPayload>(COMMAND_DELETE_TAG, 1, (ctx, payload) => {
    const tag = requireTag<TagRow>(
      ctx,
      payload.tagId,
      'id, name, name_key, color, icon, created_at',
    )
    const assignments = loadAssignments(ctx, payload.tagId)

    ctx.db.run('DELETE FROM tag_assignment WHERE tag_id = ?', payload.tagId)
    ctx.db.run('DELETE FROM tag WHERE id = ?', payload.tagId)

    const affected: AffectedRecord[] = [{ kind: 'tag', id: payload.tagId }]
    for (const a of assignments) affected.push({ kind: 'node', id: a.nodeId })
    return {
      affected,
      inverse: {
        commandType: COMMAND_RESTORE_TAG,
        commandVersion: 1,
        payload: {
          tag: {
            tagId: tag.id,
            name: tag.name,
            nameKey: tag.name_key,
            color: tag.color,
            icon: tag.icon,
            createdAt: tag.created_at,
          },
          assignments,
        } satisfies RestoreTagPayload,
      },
    }
  })

  registry.register<RestoreTagPayload>(COMMAND_RESTORE_TAG, 1, (ctx, payload) => {
    const affected: AffectedRecord[] = []
    insertTagRow(ctx, payload.tag, payload.assignments, affected)
    return {
      affected,
      inverse: {
        commandType: COMMAND_DELETE_TAG,
        commandVersion: 1,
        payload: { tagId: payload.tag.tagId } satisfies DeleteTagPayload,
      },
    }
  })

  registry.register<SuppressTagSyncPayload>(
    COMMAND_SUPPRESS_TAG_SYNC,
    1,
    (ctx, payload) => {
      const key = requireCanonicalNameKey(payload.nameKey)
      if (payload.createdAt !== undefined && typeof payload.createdAt !== 'string') {
        throw new DomainError('VALIDATION_FAILED', 'tag sync createdAt must be a string')
      }
      const existing = ctx.db.get<{ name_key: string }>(
        'SELECT name_key FROM tag_sync_tombstone WHERE project_id = ? AND name_key = ?',
        ctx.projectId,
        key,
      )
      if (existing) {
        throw new DomainError(
          'TAG_SYNC_ALREADY_SUPPRESSED',
          `tag sync is already suppressed for "${key}"`,
          { nameKey: key },
        )
      }
      ctx.db.run(
        'INSERT INTO tag_sync_tombstone (project_id, name_key, created_at) VALUES (?, ?, ?)',
        ctx.projectId,
        key,
        payload.createdAt ?? ctx.now(),
      )
      return {
        affected: [{ kind: 'project', id: ctx.projectId }],
        inverse: {
          commandType: COMMAND_LIFT_TAG_SUPPRESSION,
          commandVersion: 1,
          payload: { nameKey: key } satisfies LiftTagSuppressionPayload,
        },
      }
    },
  )

  registry.register<LiftTagSuppressionPayload>(
    COMMAND_LIFT_TAG_SUPPRESSION,
    1,
    (ctx, payload) => {
      const key = requireCanonicalNameKey(payload.nameKey)
      const existing = ctx.db.get<{ created_at: string }>(
        `SELECT created_at FROM tag_sync_tombstone
          WHERE project_id = ? AND name_key = ?`,
        ctx.projectId,
        key,
      )
      if (!existing) {
        throw new DomainError(
          'TAG_SYNC_NOT_SUPPRESSED',
          `tag sync is not suppressed for "${key}"`,
          { nameKey: key },
        )
      }
      ctx.db.run(
        'DELETE FROM tag_sync_tombstone WHERE project_id = ? AND name_key = ?',
        ctx.projectId,
        key,
      )
      return {
        affected: [{ kind: 'project', id: ctx.projectId }],
        inverse: {
          commandType: COMMAND_SUPPRESS_TAG_SYNC,
          commandVersion: 1,
          payload: {
            nameKey: key,
            createdAt: existing.created_at,
          } satisfies SuppressTagSyncPayload,
        },
      }
    },
  )

  // §4.8 merge (AI-IMP-105): checks-before-writes (CreatePin shape).
  // Loser assignments the winner already holds are dropped (dedupe);
  // the rest move to the winner. The inverse restores the loser exactly
  // and removes ONLY the assignments this merge added to the winner.
  registry.register<MergeTagPayload>(COMMAND_MERGE_TAG, 1, (ctx, payload) => {
    if (payload.loserTagId === payload.winnerTagId) {
      throw new DomainError('VALIDATION_FAILED', 'MergeTag requires two distinct tags', {
        loserTagId: payload.loserTagId,
        winnerTagId: payload.winnerTagId,
      })
    }
    const loser = requireTag<TagRow>(
      ctx,
      payload.loserTagId,
      'id, name, name_key, color, icon, created_at',
    )
    requireTag(ctx, payload.winnerTagId, 'id')

    const loserAssignments = loadAssignments(ctx, payload.loserTagId)
    const winnerNodes = new Set(
      ctx.db
        .all<{ node_id: string }>(
          'SELECT node_id FROM tag_assignment WHERE tag_id = ?',
          payload.winnerTagId,
        )
        .map((r) => r.node_id),
    )

    const affected: AffectedRecord[] = [
      { kind: 'tag', id: payload.loserTagId },
      { kind: 'tag', id: payload.winnerTagId },
    ]
    const addedNodeIds: string[] = []
    for (const a of loserAssignments) {
      if (winnerNodes.has(a.nodeId)) {
        // Overlap: the winner already carries this node — drop the
        // loser's assignment so the node is tagged exactly once.
        ctx.db.run(
          'DELETE FROM tag_assignment WHERE tag_id = ? AND node_id = ?',
          payload.loserTagId,
          a.nodeId,
        )
      } else {
        // Move the assignment onto the winner (created_at preserved).
        ctx.db.run(
          'UPDATE tag_assignment SET tag_id = ? WHERE tag_id = ? AND node_id = ?',
          payload.winnerTagId,
          payload.loserTagId,
          a.nodeId,
        )
        addedNodeIds.push(a.nodeId)
      }
      affected.push({ kind: 'node', id: a.nodeId })
    }
    ctx.db.run('DELETE FROM tag WHERE id = ?', payload.loserTagId)

    return {
      affected,
      inverse: {
        commandType: COMMAND_UNMERGE_TAG,
        commandVersion: 1,
        payload: {
          loser: {
            tagId: loser.id,
            name: loser.name,
            nameKey: loser.name_key,
            color: loser.color,
            icon: loser.icon,
            createdAt: loser.created_at,
          },
          loserAssignments,
          winnerTagId: payload.winnerTagId,
          addedNodeIds,
        } satisfies UnmergeTagPayload,
      },
    }
  })

  registry.register<UnmergeTagPayload>(COMMAND_UNMERGE_TAG, 1, (ctx, payload) => {
    const affected: AffectedRecord[] = [{ kind: 'tag', id: payload.winnerTagId }]
    // Remove only what the merge added to the winner; the winner's
    // pre-existing assignments (overlap nodes included) stay put.
    for (const nodeId of payload.addedNodeIds) {
      ctx.db.run(
        'DELETE FROM tag_assignment WHERE tag_id = ? AND node_id = ?',
        payload.winnerTagId,
        nodeId,
      )
      affected.push({ kind: 'node', id: nodeId })
    }
    // Recreate the loser row and its exact original assignments.
    insertTagRow(ctx, payload.loser, payload.loserAssignments, affected)
    // Internal inverse of a lifecycle command: redo re-issues MergeTag,
    // so this offers no inverse of its own.
    return { affected, inverse: null }
  })

  // §4.8 presentation fields (AI-IMP-105): sets the whole appearance —
  // color and icon together (SetNodeAppearance shape) — with a
  // prior-state inverse.
  registry.register<SetTagAppearancePayload>(COMMAND_SET_TAG_APPEARANCE, 1, (ctx, payload) => {
    const prior = requireTag<{ color: string | null; icon: string | null }>(
      ctx,
      payload.tagId,
      'color, icon',
    )
    const color = payload.color ?? null
    const icon = payload.icon ?? null
    ctx.db.run(
      'UPDATE tag SET color = ?, icon = ?, updated_at = ? WHERE id = ?',
      color,
      icon,
      ctx.now(),
      payload.tagId,
    )
    return {
      affected: [{ kind: 'tag', id: payload.tagId }],
      inverse: {
        commandType: COMMAND_SET_TAG_APPEARANCE,
        commandVersion: 1,
        payload: {
          tagId: payload.tagId,
          color: prior.color,
          icon: prior.icon,
        } satisfies SetTagAppearancePayload,
      },
    }
  })
}
