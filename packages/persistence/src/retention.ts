import {
  COMMAND_PURGE_RECORD,
  type CommandEnvelope,
  type CommandResult,
  type LifecycleRecordKind,
  type TrashRetention,
} from '@ew/commands'
import { uuidv7 } from '@ew/domain'
import type { Db } from './db'
import { decodeTrashRetention, getProjectSetting, TRASH_RETENTION_KEY } from './settings'

export interface RetentionPurgeItem {
  kind: LifecycleRecordKind
  id: string
}

export interface RetentionPurgeReport {
  retention: TrashRetention
  purged: RetentionPurgeItem[]
  failed: RetentionPurgeItem[]
}

interface RetentionContext {
  db: Db
  projectId: string
  execute(envelope: CommandEnvelope): CommandResult
  now(): Date
}

const RETENTION_DAYS: Readonly<Record<Exclude<TrashRetention, 'never'>, number>> = {
  '30d': 30,
  '60d': 60,
  '90d': 90,
}

/**
 * RFC §9.1 rev 0.70: the project-open retention pass selects only
 * top-level Trash records older than the user's explicit policy and
 * drives each through the ordinary PurgeRecord dispatcher path.
 */
export function runTrashRetention(ctx: RetentionContext): RetentionPurgeReport {
  const retention = getProjectSetting(
    ctx.db,
    ctx.projectId,
    TRASH_RETENTION_KEY,
    'never',
    decodeTrashRetention,
  )
  const report: RetentionPurgeReport = { retention, purged: [], failed: [] }
  if (retention === 'never') return report

  const now = ctx.now()
  const cutoff = new Date(now.getTime() - RETENTION_DAYS[retention] * 86_400_000).toISOString()
  const expired = ctx.db.all<RetentionPurgeItem>(
    `SELECT 'note' AS kind, id FROM note
       WHERE project_id = ?1 AND lifecycle_state = 'trashed' AND trashed_at <= ?2
     UNION ALL
     SELECT 'node' AS kind, id FROM node
       WHERE project_id = ?1 AND lifecycle_state = 'trashed' AND trashed_at <= ?2
     UNION ALL
     SELECT 'canvas' AS kind, id FROM canvas
       WHERE project_id = ?1 AND lifecycle_state = 'trashed' AND trashed_at <= ?2
     ORDER BY id`,
    ctx.projectId,
    cutoff,
  )

  for (const item of expired) {
    const issuedAt = ctx.now().toISOString()
    const result = ctx.execute({
      commandId: uuidv7(),
      projectId: ctx.projectId,
      commandType: COMMAND_PURGE_RECORD,
      commandVersion: 1,
      issuedAt,
      payload: item,
    })
    if (result.status === 'committed') report.purged.push(item)
    else report.failed.push(item)
  }
  return report
}
