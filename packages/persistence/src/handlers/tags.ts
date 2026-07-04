import {
  COMMAND_ASSIGN_TAG_TO_NODE,
  COMMAND_CREATE_TAG,
  COMMAND_DELETE_DRAFT_TAG,
  COMMAND_RENAME_TAG,
  COMMAND_UNASSIGN_TAG_FROM_NODE,
  DomainError,
  type AssignTagToNodePayload,
  type CommandRegistry,
  type CreateTagPayload,
  type DeleteDraftTagPayload,
  type RenameTagPayload,
  type UnassignTagFromNodePayload,
} from '@ew/commands'
import { nameKey } from '@ew/domain'
import type { CommandContext } from '../dispatcher'

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
}
