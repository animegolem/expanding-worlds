import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { uuidv7 } from '@ew/domain'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createProject, type ProjectHandle } from '../project'
import {
  NoopThumbnailGenerator,
  claimNextJob,
  enqueueThumbnail,
  markJobDone,
  markJobFailed,
  processNextJob,
  type DerivativeCtx,
  type DerivativeGenerator,
} from './derivatives'

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

function insertAsset(): string {
  const id = uuidv7()
  const now = new Date().toISOString()
  project.db.run(
    `INSERT INTO asset
       (id, project_id, kind, content_hash, original_filename, mime_type,
        storage_path, created_at, updated_at)
     VALUES (?, ?, 'image', 'hash', 'f.png', 'image/png', 'assets/ha/hash', ?, ?)`,
    id,
    project.projectId,
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
