import {
  COMMAND_CREATE_NODE,
  COMMAND_DELETE_DRAFT_NODE,
  DomainError,
  type CommandRegistry,
  type CreateNodePayload,
  type DeleteDraftNodePayload,
} from '@ew/commands'
import type { CommandContext } from '../dispatcher'

/**
 * Node command handlers. AI-IMP-010 lands the CreateNode reference
 * pair proving the pipeline; AI-IMP-012 extends this file with
 * attach/detach/appearance commands.
 */
export function registerNodeHandlers(registry: CommandRegistry<CommandContext>): void {
  registry.register<CreateNodePayload>(COMMAND_CREATE_NODE, 1, (ctx, payload) => {
    if (typeof payload?.nodeId !== 'string' || payload.nodeId.length === 0) {
      throw new DomainError('VALIDATION_FAILED', 'CreateNode requires payload.nodeId')
    }
    const now = ctx.now()
    ctx.db.run(
      'INSERT INTO node (id, project_id, created_at, updated_at) VALUES (?, ?, ?, ?)',
      payload.nodeId,
      ctx.projectId,
      now,
      now,
    )
    return {
      affected: [{ kind: 'node', id: payload.nodeId }],
      inverse: {
        commandType: COMMAND_DELETE_DRAFT_NODE,
        commandVersion: 1,
        payload: { nodeId: payload.nodeId } satisfies DeleteDraftNodePayload,
      },
    }
  })

  registry.register<DeleteDraftNodePayload>(COMMAND_DELETE_DRAFT_NODE, 1, (ctx, payload) => {
    const node = ctx.db.get<{ id: string; note_id: string | null }>(
      'SELECT id, note_id FROM node WHERE id = ? AND project_id = ?',
      payload.nodeId,
      ctx.projectId,
    )
    if (!node) {
      throw new DomainError('NODE_NOT_FOUND', `no node ${payload.nodeId}`)
    }
    const attachments = ctx.db.get<{ placements: number; tags: number; canvases: number }>(
      `SELECT
         (SELECT count(*) FROM placement WHERE node_id = ?1) AS placements,
         (SELECT count(*) FROM tag_assignment WHERE node_id = ?1) AS tags,
         (SELECT count(*) FROM canvas WHERE node_id = ?1) AS canvases`,
      payload.nodeId,
    )!
    if (
      node.note_id !== null ||
      attachments.placements > 0 ||
      attachments.tags > 0 ||
      attachments.canvases > 0
    ) {
      throw new DomainError(
        'NODE_NOT_DRAFT',
        'DeleteDraftNode only removes nodes with no note, tags, canvas, or placements',
        { nodeId: payload.nodeId },
      )
    }
    ctx.db.run('DELETE FROM node WHERE id = ?', payload.nodeId)
    return {
      affected: [{ kind: 'node', id: payload.nodeId }],
      inverse: {
        commandType: COMMAND_CREATE_NODE,
        commandVersion: 1,
        payload: { nodeId: payload.nodeId } satisfies CreateNodePayload,
      },
    }
  })
}
