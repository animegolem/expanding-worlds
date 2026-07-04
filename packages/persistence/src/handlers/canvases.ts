import {
  COMMAND_CREATE_CANVAS,
  COMMAND_DELETE_DRAFT_CANVAS,
  COMMAND_SET_CANVAS_BACKGROUND,
  COMMAND_SET_CANVAS_BACKGROUND_COLOR,
  DomainError,
  type CommandRegistry,
  type CreateCanvasPayload,
  type DeleteDraftCanvasPayload,
  type SetCanvasBackgroundPayload,
  type SetCanvasBackgroundColorPayload,
} from '@ew/commands'
import type { CommandContext } from '../dispatcher'

/** Looks up an active canvas or throws CANVAS_NOT_FOUND. */
export function requireCanvas<T extends Record<string, unknown>>(
  ctx: CommandContext,
  canvasId: string,
  columns: string,
): T {
  const row = ctx.db.get<T>(
    `SELECT ${columns} FROM canvas
     WHERE id = ? AND project_id = ? AND lifecycle_state = 'active'`,
    canvasId,
    ctx.projectId,
  )
  if (!row) throw new DomainError('CANVAS_NOT_FOUND', `no active canvas ${canvasId}`)
  return row
}

/**
 * Canvas command handlers (RFC-0001 §4.4, §6.7): creation under
 * invariant 10 (one canvas per node) and the two independent
 * background fields (image asset + settings, solid color).
 */
export function registerCanvasHandlers(registry: CommandRegistry<CommandContext>): void {
  registry.register<CreateCanvasPayload>(COMMAND_CREATE_CANVAS, 1, (ctx, payload) => {
    const node = ctx.db.get<{ id: string }>(
      `SELECT id FROM node
       WHERE id = ? AND project_id = ? AND lifecycle_state = 'active'`,
      payload.nodeId,
      ctx.projectId,
    )
    if (!node) throw new DomainError('NODE_NOT_FOUND', `no active node ${payload.nodeId}`)
    const existing = ctx.db.get<{ id: string }>(
      'SELECT id FROM canvas WHERE node_id = ?',
      payload.nodeId,
    )
    if (existing) {
      // Invariant 10: at most one canvas per node in Phase 1.
      throw new DomainError('NODE_HAS_CANVAS', `node ${payload.nodeId} already owns a canvas`, {
        nodeId: payload.nodeId,
        canvasId: existing.id,
      })
    }
    // §4.4: persisted immediately (camera defaults from the schema) so
    // navigation history and bookmarks can target it before any edit.
    const now = ctx.now()
    ctx.db.run(
      `INSERT INTO canvas (id, project_id, node_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
      payload.canvasId,
      ctx.projectId,
      payload.nodeId,
      now,
      now,
    )
    return {
      affected: [{ kind: 'canvas', id: payload.canvasId }],
      inverse: {
        commandType: COMMAND_DELETE_DRAFT_CANVAS,
        commandVersion: 1,
        payload: { canvasId: payload.canvasId } satisfies DeleteDraftCanvasPayload,
      },
    }
  })

  registry.register<DeleteDraftCanvasPayload>(COMMAND_DELETE_DRAFT_CANVAS, 1, (ctx, payload) => {
    const canvas = requireCanvas<{
      id: string
      node_id: string
      background_asset_id: string | null
      background_color: string | null
    }>(ctx, payload.canvasId, 'id, node_id, background_asset_id, background_color')
    const contents = ctx.db.get<{ placements: number; decorations: number; bookmarks: number }>(
      `SELECT
         (SELECT count(*) FROM placement WHERE canvas_id = ?1) AS placements,
         (SELECT count(*) FROM decoration WHERE canvas_id = ?1) AS decorations,
         (SELECT count(*) FROM bookmark WHERE canvas_id = ?1) AS bookmarks`,
      payload.canvasId,
    )!
    if (
      contents.placements > 0 ||
      contents.decorations > 0 ||
      contents.bookmarks > 0 ||
      canvas.background_asset_id !== null ||
      canvas.background_color !== null
    ) {
      throw new DomainError(
        'CANVAS_NOT_DRAFT',
        'DeleteDraftCanvas only removes canvases with no content, bookmarks, or background',
        { canvasId: payload.canvasId },
      )
    }
    ctx.db.run('DELETE FROM canvas WHERE id = ?', payload.canvasId)
    return {
      affected: [{ kind: 'canvas', id: payload.canvasId }],
      inverse: {
        commandType: COMMAND_CREATE_CANVAS,
        commandVersion: 1,
        payload: {
          canvasId: payload.canvasId,
          nodeId: canvas.node_id,
        } satisfies CreateCanvasPayload,
      },
    }
  })

  registry.register<SetCanvasBackgroundPayload>(COMMAND_SET_CANVAS_BACKGROUND, 1, (ctx, payload) => {
    const prior = requireCanvas<{
      background_asset_id: string | null
      background_settings: string | null
    }>(ctx, payload.canvasId, 'background_asset_id, background_settings')
    if (payload.assetId !== null) {
      const asset = ctx.db.get<{ id: string }>(
        `SELECT id FROM asset
         WHERE id = ? AND project_id = ? AND lifecycle_state = 'active'`,
        payload.assetId,
        ctx.projectId,
      )
      if (!asset) throw new DomainError('ASSET_NOT_FOUND', `no active asset ${payload.assetId}`)
    }
    ctx.db.run(
      `UPDATE canvas SET background_asset_id = ?, background_settings = ?, updated_at = ?
       WHERE id = ?`,
      payload.assetId,
      payload.settings === null ? null : JSON.stringify(payload.settings),
      ctx.now(),
      payload.canvasId,
    )
    return {
      affected: [{ kind: 'canvas', id: payload.canvasId }],
      inverse: {
        commandType: COMMAND_SET_CANVAS_BACKGROUND,
        commandVersion: 1,
        payload: {
          canvasId: payload.canvasId,
          assetId: prior.background_asset_id,
          settings:
            prior.background_settings === null
              ? null
              : (JSON.parse(prior.background_settings) as Record<string, unknown>),
        } satisfies SetCanvasBackgroundPayload,
      },
    }
  })

  registry.register<SetCanvasBackgroundColorPayload>(
    COMMAND_SET_CANVAS_BACKGROUND_COLOR,
    1,
    (ctx, payload) => {
      // §4.4: the solid color is independent of the image background.
      const prior = requireCanvas<{ background_color: string | null }>(
        ctx,
        payload.canvasId,
        'background_color',
      )
      ctx.db.run(
        'UPDATE canvas SET background_color = ?, updated_at = ? WHERE id = ?',
        payload.color,
        ctx.now(),
        payload.canvasId,
      )
      return {
        affected: [{ kind: 'canvas', id: payload.canvasId }],
        inverse: {
          commandType: COMMAND_SET_CANVAS_BACKGROUND_COLOR,
          commandVersion: 1,
          payload: {
            canvasId: payload.canvasId,
            color: prior.background_color,
          } satisfies SetCanvasBackgroundColorPayload,
        },
      }
    },
  )
}
