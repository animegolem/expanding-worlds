import { uuidv7 } from '@ew/domain'
import type { Db } from '../db'

/**
 * Derivative job queue (RFC-0001 §11.2): thumbnails are regenerable
 * derivatives tracked in derivative_jobs. Phase 1 lands the queue and
 * a pluggable generator seam; actual pixel resizing needs an image
 * codec (native dep or heavy pure-JS decode) and is explicitly
 * deferred — NoopThumbnailGenerator marks jobs done without producing
 * files, and §11.4 recovery rebuilds missing derivatives lazily once
 * a real generator exists.
 */

/** Minimal context for queue accessors: the pipeline calls them from
 * inside CommitAssetImport (CommandContext satisfies this) and the
 * worker loop calls them outside any command. */
export interface DerivativeCtx {
  db: Db
  now(): string
}

export interface DerivativeJob {
  id: string
  assetId: string
  kind: 'thumbnail'
  state: 'queued' | 'done' | 'failed'
}

/** Enqueues a thumbnail job for an asset; returns the job id. */
export function enqueueThumbnail(ctx: DerivativeCtx, assetId: string): string {
  const id = uuidv7()
  const now = ctx.now()
  ctx.db.run(
    `INSERT INTO derivative_jobs (id, asset_id, kind, state, created_at, updated_at)
     VALUES (?, ?, 'thumbnail', 'queued', ?, ?)`,
    id,
    assetId,
    now,
    now,
  )
  return id
}

/** Returns the oldest queued job, or null when the queue is idle. */
export function claimNextJob(ctx: DerivativeCtx): DerivativeJob | null {
  return (
    ctx.db.get<DerivativeJob>(
      `SELECT id, asset_id AS assetId, kind, state
       FROM derivative_jobs WHERE state = 'queued'
       ORDER BY created_at, id LIMIT 1`,
    ) ?? null
  )
}

export function markJobDone(ctx: DerivativeCtx, jobId: string): void {
  ctx.db.run(
    `UPDATE derivative_jobs SET state = 'done', updated_at = ? WHERE id = ?`,
    ctx.now(),
    jobId,
  )
}

export function markJobFailed(ctx: DerivativeCtx, jobId: string): void {
  ctx.db.run(
    `UPDATE derivative_jobs SET state = 'failed', updated_at = ? WHERE id = ?`,
    ctx.now(),
    jobId,
  )
}

/** Seam for the deferred real generator (image decode + resize into
 * derivatives/thumbnails/). Implementations receive the project dir
 * and the claimed job and produce derivative files. */
export interface DerivativeGenerator {
  generate(projectDir: string, job: DerivativeJob): Promise<void>
}

/** Phase 1 stand-in: marks jobs done without producing files.
 * Deliberate no-op — see module doc; derivatives are regenerable. */
export class NoopThumbnailGenerator implements DerivativeGenerator {
  async generate(): Promise<void> {
    // Intentionally empty: thumbnail rendering is deferred.
  }
}

/**
 * Claims and processes one job with the given generator. Returns true
 * when a job was processed (done or failed), false when idle.
 */
export async function processNextJob(
  ctx: DerivativeCtx,
  projectDir: string,
  generator: DerivativeGenerator,
): Promise<boolean> {
  const job = claimNextJob(ctx)
  if (!job) return false
  try {
    await generator.generate(projectDir, job)
    markJobDone(ctx, job.id)
  } catch {
    markJobFailed(ctx, job.id)
  }
  return true
}
