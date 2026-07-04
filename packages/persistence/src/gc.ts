import type { CommandContext } from './dispatcher'

/**
 * Garbage-collection eligibility (RFC-0001 §9.8, AI-IMP-013): an
 * explicit mark-and-sweep over asset blob references, computed from
 * the database only — no file IO here. The actual sweep (deleting
 * blob files and reconciling orphans) is AI-IMP-016's recovery work.
 *
 * Asset rows are shared metadata (dedupe never merges them, §4.7) and
 * survive purges; a blob's content hash becomes eligible only when NO
 * asset row carrying that hash is referenced anymore by any node
 * appearance or canvas background — active OR trashed (§9.8: trashed
 * records protect their resources until purge) — and no guard holds
 * it. Purging the last referencing record is what makes a hash
 * eligible.
 */

/**
 * EPIC-008 seam: hashes held by in-progress exports are never
 * eligible. Phase 1 has no exporter, so the lease set is empty; the
 * export implementation replaces this stub.
 */
export function exportLeaseGuardedHashes(): Set<string> {
  return new Set()
}

/** Content hashes whose blobs may be swept from disk (§9.8). */
export function computeGcEligibleBlobs(ctx: Omit<CommandContext, 'now'>): string[] {
  // Mark: every hash referenced through an asset row that some
  // appearance or background (any lifecycle state) still points at.
  const referenced = new Set(
    ctx.db
      .all<{ content_hash: string }>(
        `SELECT DISTINCT a.content_hash FROM asset a
         WHERE EXISTS (SELECT 1 FROM node n WHERE n.appearance_asset_id = a.id)
            OR EXISTS (SELECT 1 FROM canvas c WHERE c.background_asset_id = a.id)`,
      )
      .map((row) => row.content_hash),
  )
  // Guards: imports still in flight (their blob may not have an asset
  // row yet or the row is about to appear) and queued derivative jobs
  // that still need to read the original (§11.2 tables from 0002).
  const guarded = new Set<string>([
    ...ctx.db
      .all<{ content_hash: string }>(
        `SELECT DISTINCT content_hash FROM pending_imports
         WHERE state <> 'committed' AND content_hash IS NOT NULL`,
      )
      .map((row) => row.content_hash),
    ...ctx.db
      .all<{ content_hash: string }>(
        `SELECT DISTINCT a.content_hash FROM derivative_jobs j
         JOIN asset a ON a.id = j.asset_id
         WHERE j.state = 'queued'`,
      )
      .map((row) => row.content_hash),
    ...exportLeaseGuardedHashes(),
  ])

  return ctx.db
    .all<{ content_hash: string }>(
      'SELECT DISTINCT content_hash FROM asset WHERE project_id = ? ORDER BY content_hash',
      ctx.projectId,
    )
    .map((row) => row.content_hash)
    .filter((hash) => !referenced.has(hash) && !guarded.has(hash))
}
