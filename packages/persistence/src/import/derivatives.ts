import { existsSync, mkdirSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { uuidv7 } from '@ew/domain'
import type { Db } from '../db'
import { thumbnailPath } from './store'

/**
 * Derivative job queue (RFC-0001 §11.2): thumbnails are regenerable
 * derivatives tracked in derivative_jobs. The queue and the
 * pluggable generator seam landed with the pipeline; AI-IMP-076
 * added the real generation path — RENDERER-driven (Chromium
 * decodes every §4.7 format the board can display; zero native
 * deps, preserving the AI-IMP-009 stance): the renderer claims the
 * oldest queued job, decodes/resizes/encodes WebP with alpha, and
 * submits bytes back; this module owns claim/complete/backfill on
 * the DB-and-files side. Claiming does not lock — a job leaves
 * 'queued' only via done/failed, so a generator that dies mid-work
 * leaves the job claimable and the pipeline self-heals.
 * NoopThumbnailGenerator remains for tests that exercise the queue
 * without producing files.
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

/** What a generator needs: the job plus its asset's identity. */
export interface ThumbnailJob {
  jobId: string
  assetId: string
  contentHash: string
  mimeType: string
}

/**
 * Oldest queued thumbnail job joined with its asset, skipping (and
 * completing) jobs whose derivative file already exists — assets
 * sharing bytes share one thumbnail, so only the first job per hash
 * costs a decode. Returns null when the queue is drained.
 */
export function claimNextThumbnailJob(ctx: DerivativeCtx, dir: string): ThumbnailJob | null {
  for (;;) {
    const job =
      ctx.db.get<ThumbnailJob>(
        `SELECT j.id AS jobId, j.asset_id AS assetId,
                a.content_hash AS contentHash, a.mime_type AS mimeType
         FROM derivative_jobs j
         JOIN asset a ON a.id = j.asset_id
         WHERE j.state = 'queued' AND j.kind = 'thumbnail'
         ORDER BY j.created_at, j.id LIMIT 1`,
      ) ?? null
    if (!job) return null
    if (!existsSync(thumbnailPath(dir, job.contentHash))) return job
    markJobDone(ctx, job.jobId)
  }
}

/**
 * Lands submitted thumbnail bytes atomically (temp + rename beside
 * the destination) and marks the job done; null bytes mark it
 * failed (undecodable source — the grid falls back to the
 * original). The thumbnails directory is recreated on demand: a
 * user deleting derivatives/ must never wedge the pipeline.
 *
 * The write path DERIVES the content hash from the job's own asset
 * row — the submitting renderer is never trusted with a filesystem
 * path component (PR #3 review, P1: a compromised renderer could
 * otherwise smuggle separators through the preload surface). An
 * unknown or non-queued job writes nothing and returns null.
 */
export function completeThumbnailJob(
  ctx: DerivativeCtx,
  dir: string,
  input: { jobId: string; bytes: Uint8Array | null },
): { assetId: string; contentHash: string } | null {
  const job = ctx.db.get<{ assetId: string; contentHash: string; state: string }>(
    `SELECT j.asset_id AS assetId, a.content_hash AS contentHash, j.state
     FROM derivative_jobs j
     JOIN asset a ON a.id = j.asset_id
     WHERE j.id = ? AND j.kind = 'thumbnail'`,
    input.jobId,
  )
  if (!job || job.state !== 'queued') return null
  if (input.bytes === null || input.bytes.length === 0) {
    markJobFailed(ctx, input.jobId)
    return null
  }
  const dest = thumbnailPath(dir, job.contentHash)
  mkdirSync(dirname(dest), { recursive: true })
  const tmp = `${dest}.tmp-${input.jobId}`
  writeFileSync(tmp, input.bytes)
  renameSync(tmp, dest)
  markJobDone(ctx, input.jobId)
  return { assetId: job.assetId, contentHash: job.contentHash }
}

/**
 * §11.4 lazy rebuild (AI-IMP-076): enqueue a thumbnail job for every
 * active image asset whose derivative file is missing and which has
 * no queued job — so a deleted derivatives directory (or a project
 * predating the generator) regenerates on next open. One job per
 * content hash; returns how many were enqueued.
 */
export function enqueueMissingThumbnails(ctx: DerivativeCtx, dir: string): number {
  const assets = ctx.db.all<{ id: string; contentHash: string }>(
    `SELECT a.id, a.content_hash AS contentHash
     FROM asset a
     WHERE a.kind = 'image' AND a.lifecycle_state = 'active'
       AND NOT EXISTS (
         SELECT 1 FROM derivative_jobs j
         JOIN asset shared ON shared.id = j.asset_id
         WHERE shared.content_hash = a.content_hash
           AND j.kind = 'thumbnail' AND j.state = 'queued'
       )
     ORDER BY a.created_at, a.id`,
  )
  const seen = new Set<string>()
  let enqueued = 0
  for (const asset of assets) {
    if (seen.has(asset.contentHash)) continue
    seen.add(asset.contentHash)
    if (existsSync(thumbnailPath(dir, asset.contentHash))) continue
    enqueueThumbnail(ctx, asset.id)
    enqueued += 1
  }
  return enqueued
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
