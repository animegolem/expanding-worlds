import {
  COMMAND_COMMIT_ASSET_IMPORT,
  DomainError,
  type CommandRegistry,
  type CommitAssetImportPayload,
} from '@ew/commands'
import type { CommandContext } from '../dispatcher'
import { enqueueThumbnail } from '../import/derivatives'
import type { QueryRegistry } from '../queries'

/**
 * Asset command handlers (AI-IMP-014). CommitAssetImport is the final
 * pipeline stage: bytes are already hashed and moved into
 * content-addressed storage; this commits the Asset record through
 * the dispatcher so revision, command_log, and project-changed events
 * behave like any mutation (§11.2). The thumbnail job is enqueued in
 * the same transaction, so a committed asset always has one.
 */
export function registerAssetHandlers(registry: CommandRegistry<CommandContext>): void {
  registry.register<CommitAssetImportPayload>(COMMAND_COMMIT_ASSET_IMPORT, 1, (ctx, payload) => {
    for (const field of ['assetId', 'contentHash', 'originalFilename', 'mimeType', 'storagePath'] as const) {
      if (typeof payload?.[field] !== 'string' || payload[field].length === 0) {
        throw new DomainError('VALIDATION_FAILED', `CommitAssetImport requires payload.${field}`)
      }
    }
    if (payload.kind !== 'image') {
      throw new DomainError('VALIDATION_FAILED', 'CommitAssetImport supports only kind "image" in Phase 1')
    }
    const now = ctx.now()
    ctx.db.run(
      `INSERT INTO asset
         (id, project_id, kind, content_hash, original_filename, mime_type,
          width, height, storage_path, source_url, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      payload.assetId,
      ctx.projectId,
      payload.kind,
      payload.contentHash,
      payload.originalFilename,
      payload.mimeType,
      payload.width,
      payload.height,
      payload.storagePath,
      payload.sourceUrl ?? null,
      now,
      now,
    )
    enqueueThumbnail(ctx, payload.assetId)
    return {
      affected: [{ kind: 'asset' as const, id: payload.assetId }],
      // Import is not undoable in Phase 1: the blob may be shared via
      // dedupe and removal goes through trash/GC (§9.8).
      inverse: null,
    }
  })
}

const ASSET_COLUMNS = `
  id, kind, content_hash AS contentHash,
  original_filename AS originalFilename, mime_type AS mimeType,
  width, height, storage_path AS storagePath, source_url AS sourceUrl,
  lifecycle_state AS lifecycleState,
  created_at AS createdAt, updated_at AS updatedAt`

export function registerAssetQueries(registry: QueryRegistry): void {
  registry.register('getAsset', (ctx, args) => {
    const { assetId } = args as { assetId: string }
    return (
      ctx.db.get(
        `SELECT ${ASSET_COLUMNS} FROM asset WHERE id = ? AND project_id = ?`,
        assetId,
        ctx.projectId,
      ) ?? null
    )
  })

  registry.register('listAssets', (ctx) =>
    ctx.db.all(
      `SELECT ${ASSET_COLUMNS} FROM asset
       WHERE project_id = ? AND lifecycle_state = 'active'
       ORDER BY id`,
      ctx.projectId,
    ),
  )
}
