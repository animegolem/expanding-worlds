import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { uuidv7 } from '@ew/domain'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createProject, type ProjectHandle } from '../project'
import { openProjectService } from '../service'
import {
  NoopThumbnailGenerator,
  claimNextJob,
  claimNextThumbnailJob,
  completeThumbnailJob,
  enqueueMissingThumbnails,
  enqueueThumbnail,
  markJobDone,
  markJobFailed,
  processNextJob,
  type DerivativeCtx,
  type DerivativeGenerator,
} from './derivatives'
import { thumbnailPath } from './store'

let dir: string
let project: ProjectHandle
let ctx: DerivativeCtx

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'ew-deriv-'))
  project = createProject(dir, 'Derivatives Test')
  ctx = { db: project.db, now: () => new Date().toISOString() }
})

afterEach(() => {
  project.close()
  rmSync(dir, { recursive: true, force: true })
})

function insertAsset(hash = 'hash'): string {
  const id = uuidv7()
  const now = new Date().toISOString()
  project.db.run(
    `INSERT INTO asset
       (id, project_id, kind, content_hash, original_filename, mime_type,
        storage_path, created_at, updated_at)
     VALUES (?, ?, 'image', ?, 'f.png', 'image/png', ?, ?, ?)`,
    id,
    project.projectId,
    hash,
    `assets/${hash.slice(0, 2)}/${hash}`,
    now,
    now,
  )
  return id
}

describe('derivative job queue', () => {
  it('enqueues thumbnail jobs and claims them oldest-first', () => {
    const assetA = insertAsset()
    const assetB = insertAsset()
    const jobA = enqueueThumbnail(ctx, assetA)
    const jobB = enqueueThumbnail(ctx, assetB)

    expect(claimNextJob(ctx)).toEqual({
      id: jobA,
      assetId: assetA,
      kind: 'thumbnail',
      state: 'queued',
    })
    markJobDone(ctx, jobA)
    expect(claimNextJob(ctx)).toMatchObject({ id: jobB, assetId: assetB })
  })

  it('rejects jobs for a missing asset (FK)', () => {
    expect(() => enqueueThumbnail(ctx, 'no-such-asset')).toThrow()
  })

  it('marks jobs done and failed', () => {
    const jobId = enqueueThumbnail(ctx, insertAsset())
    markJobFailed(ctx, jobId)
    expect(
      project.db.get<{ state: string }>('SELECT state FROM derivative_jobs WHERE id = ?', jobId),
    ).toEqual({ state: 'failed' })
    expect(claimNextJob(ctx)).toBeNull()
  })

  it('processNextJob runs the generator and marks done (noop Phase 1 stand-in)', async () => {
    const jobId = enqueueThumbnail(ctx, insertAsset())
    expect(await processNextJob(ctx, dir, new NoopThumbnailGenerator())).toBe(true)
    expect(
      project.db.get<{ state: string }>('SELECT state FROM derivative_jobs WHERE id = ?', jobId),
    ).toEqual({ state: 'done' })
    // Idle queue: nothing to process.
    expect(await processNextJob(ctx, dir, new NoopThumbnailGenerator())).toBe(false)
  })

  it('processNextJob marks failed when the generator throws', async () => {
    const jobId = enqueueThumbnail(ctx, insertAsset())
    const failing: DerivativeGenerator = {
      generate: () => Promise.reject(new Error('no codec')),
    }
    expect(await processNextJob(ctx, dir, failing)).toBe(true)
    expect(
      project.db.get<{ state: string }>('SELECT state FROM derivative_jobs WHERE id = ?', jobId),
    ).toEqual({ state: 'failed' })
  })
})

describe('renderer-driven thumbnail pipeline (AI-IMP-076)', () => {
  it('claims with asset identity and lands submitted bytes atomically', () => {
    const assetId = insertAsset('aa11')
    const jobId = enqueueThumbnail(ctx, assetId)

    const job = claimNextThumbnailJob(ctx, dir)
    expect(job).toEqual({ jobId, assetId, contentHash: 'aa11', mimeType: 'image/png' })

    const bytes = new Uint8Array([1, 2, 3, 4])
    completeThumbnailJob(ctx, dir, { jobId, contentHash: 'aa11', bytes })
    expect(readFileSync(thumbnailPath(dir, 'aa11'))).toEqual(Buffer.from(bytes))
    expect(
      project.db.get<{ state: string }>('SELECT state FROM derivative_jobs WHERE id = ?', jobId),
    ).toEqual({ state: 'done' })
    expect(claimNextThumbnailJob(ctx, dir)).toBeNull()
  })

  it('null bytes mark the job failed and write nothing', () => {
    const jobId = enqueueThumbnail(ctx, insertAsset('bb22'))
    completeThumbnailJob(ctx, dir, { jobId, contentHash: 'bb22', bytes: null })
    expect(existsSync(thumbnailPath(dir, 'bb22'))).toBe(false)
    expect(
      project.db.get<{ state: string }>('SELECT state FROM derivative_jobs WHERE id = ?', jobId),
    ).toEqual({ state: 'failed' })
  })

  it('claim skips-and-completes jobs whose thumbnail already exists (shared bytes)', () => {
    // Two assets share a hash: the first job materializes the file,
    // the second must resolve without a decode.
    const first = enqueueThumbnail(ctx, insertAsset('cc33'))
    completeThumbnailJob(ctx, dir, {
      jobId: first,
      contentHash: 'cc33',
      bytes: new Uint8Array([9]),
    })
    const second = enqueueThumbnail(ctx, insertAsset('cc33'))
    expect(claimNextThumbnailJob(ctx, dir)).toBeNull()
    expect(
      project.db.get<{ state: string }>('SELECT state FROM derivative_jobs WHERE id = ?', second),
    ).toEqual({ state: 'done' })
  })

  it('enqueueMissingThumbnails backfills missing files once per hash and is idempotent', () => {
    insertAsset('dd44')
    insertAsset('dd44') // shared bytes: one job, not two
    const materialized = insertAsset('ee55')
    const done = enqueueThumbnail(ctx, materialized)
    completeThumbnailJob(ctx, dir, {
      jobId: done,
      contentHash: 'ee55',
      bytes: new Uint8Array([7]),
    })

    expect(enqueueMissingThumbnails(ctx, dir)).toBe(1)
    // Idempotent: the queued job suppresses re-enqueue.
    expect(enqueueMissingThumbnails(ctx, dir)).toBe(0)
    const job = claimNextThumbnailJob(ctx, dir)
    expect(job?.contentHash).toBe('dd44')
  })

  it('openProjectService backfills on open (§11.4 lazy rebuild)', () => {
    insertAsset('ff66')
    project.close()

    const service = openProjectService(dir)
    try {
      const job = service.claimThumbnailJob()
      expect(job?.contentHash).toBe('ff66')
      service.completeThumbnailJob({
        jobId: job!.jobId,
        contentHash: 'ff66',
        bytes: new Uint8Array([5]),
      })
      expect(existsSync(thumbnailPath(dir, 'ff66'))).toBe(true)
      expect(service.claimThumbnailJob()).toBeNull()
    } finally {
      service.close()
      // beforeEach/afterEach own `project`; reopen so close() succeeds.
      project = createProject(mkdtempSync(join(tmpdir(), 'ew-deriv-reopen-')), 'x')
    }
  })
})
