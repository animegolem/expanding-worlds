import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { uuidv7 } from '@ew/domain'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { CommandContext } from './dispatcher'
import {
  GC_MANIFEST_PATH,
  acquireExportLease,
  computeGcEligibleBlobs,
  exportLeaseGuardedHashes,
  gcStatus,
  runGcSweep,
} from './gc'
import { blobPath, thumbnailPath } from './import/store'
import { createProject, type ProjectHandle } from './project'
import { runRecovery } from './recovery'
import { GC_ELIGIBILITY_KEY, setProjectSetting } from './settings'

let dir: string
let handle: ProjectHandle
let ctx: Omit<CommandContext, 'now'>

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'ew-gc-'))
  handle = createProject(dir, 'GC Test')
  ctx = {
    db: handle.db,
    projectId: handle.projectId,
    rootNodeId: handle.rootNodeId,
    rootCanvasId: handle.rootCanvasId,
  }
})

afterEach(() => {
  handle.close()
  rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
})

function insertAsset(hash: string): string {
  const assetId = uuidv7()
  const now = new Date().toISOString()
  handle.db.run(
    `INSERT INTO asset (id, project_id, kind, content_hash, original_filename,
       mime_type, storage_path, created_at, updated_at)
     VALUES (?, ?, 'image', ?, 'a.png', 'image/png', 'assets/a.png', ?, ?)`,
    assetId,
    handle.projectId,
    hash,
    now,
    now,
  )
  return assetId
}

function insertNode(lifecycle: 'active' | 'trashed', appearanceAssetId: string | null): string {
  const nodeId = uuidv7()
  const now = new Date().toISOString()
  handle.db.run(
    `INSERT INTO node (id, project_id, appearance_kind, appearance_asset_id,
       lifecycle_state, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    nodeId,
    handle.projectId,
    appearanceAssetId === null ? null : 'image',
    appearanceAssetId,
    lifecycle,
    now,
    now,
  )
  return nodeId
}

describe('computeGcEligibleBlobs (§9.8)', () => {
  it('marks unreferenced hashes eligible and referenced ones not', () => {
    insertAsset('hash-orphan')
    const used = insertAsset('hash-used')
    insertNode('active', used)
    expect(computeGcEligibleBlobs(ctx)).toEqual(['hash-orphan'])
  })

  it('protects assets referenced by TRASHED appearances and backgrounds (§9.8)', () => {
    const byTrashedNode = insertAsset('hash-trashed-node')
    insertNode('trashed', byTrashedNode)

    const byBackground = insertAsset('hash-bg')
    const owner = insertNode('active', null)
    const now = new Date().toISOString()
    handle.db.run(
      `INSERT INTO canvas (id, project_id, node_id, background_asset_id,
         lifecycle_state, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'trashed', ?, ?)`,
      uuidv7(),
      handle.projectId,
      owner,
      byBackground,
      now,
      now,
    )
    expect(computeGcEligibleBlobs(ctx)).toEqual([])
  })

  it('keeps a shared hash while ANY asset row carrying it is referenced', () => {
    insertAsset('hash-shared')
    const twin = insertAsset('hash-shared')
    insertNode('active', twin)
    expect(computeGcEligibleBlobs(ctx)).toEqual([])
  })

  it('guards in-flight imports and queued derivative jobs, but not completed ones', () => {
    insertAsset('hash-importing')
    const thumbing = insertAsset('hash-thumbing')
    const done = insertAsset('hash-done')
    const now = new Date().toISOString()
    handle.db.run(
      `INSERT INTO pending_imports (id, project_id, state, original_filename,
         temp_path, content_hash, created_at, updated_at)
       VALUES (?, ?, 'hashed', 'a.png', 'import-tmp/a', 'hash-importing', ?, ?)`,
      uuidv7(),
      handle.projectId,
      now,
      now,
    )
    handle.db.run(
      `INSERT INTO derivative_jobs (id, asset_id, kind, state, created_at, updated_at)
       VALUES (?, ?, 'thumbnail', 'queued', ?, ?)`,
      uuidv7(),
      thumbing,
      now,
      now,
    )
    handle.db.run(
      `INSERT INTO derivative_jobs (id, asset_id, kind, state, created_at, updated_at)
       VALUES (?, ?, 'thumbnail', 'done', ?, ?)`,
      uuidv7(),
      done,
      now,
      now,
    )
    expect(computeGcEligibleBlobs(ctx)).toEqual(['hash-done'])
    // A committed import no longer guards; the asset row governs.
    handle.db.run("UPDATE pending_imports SET state = 'committed'")
    handle.db.run("UPDATE derivative_jobs SET state = 'done' WHERE asset_id = ?", thumbing)
    expect(computeGcEligibleBlobs(ctx).sort()).toEqual([
      'hash-done',
      'hash-importing',
      'hash-thumbing',
    ])
  })

  it('ref-counts live export leases', () => {
    const releaseA = acquireExportLease(['hash-export'])
    const releaseB = acquireExportLease(['hash-export'])
    expect(exportLeaseGuardedHashes()).toEqual(new Set(['hash-export']))
    releaseA()
    expect(exportLeaseGuardedHashes()).toEqual(new Set(['hash-export']))
    releaseB()
    expect(exportLeaseGuardedHashes()).toEqual(new Set())
  })
})

describe('runGcSweep (§9.8 rev 0.70)', () => {
  const hash = 'a'.repeat(64)
  const at = (iso: string) => new Date(iso)

  function writeManagedBlob(contentHash = hash): void {
    const original = blobPath(dir, contentHash)
    const thumb = thumbnailPath(dir, contentHash)
    mkdirSync(join(original, '..'), { recursive: true })
    mkdirSync(join(thumb, '..'), { recursive: true })
    writeFileSync(original, 'original-bytes')
    writeFileSync(thumb, 'thumb')
  }

  it('waits 30 days, tears down metadata/files, manifests, and reopens cleanly', () => {
    const assetId = insertAsset(hash)
    writeManagedBlob()
    const sweepCtx = { ...ctx, dir }

    const first = runGcSweep(sweepCtx, { now: at('2026-01-01T00:00:00.000Z') })
    expect(first).toMatchObject({ reclaimed: [], deferred: 1 })
    expect(gcStatus(sweepCtx, at('2026-01-20T00:00:00.000Z'))).toEqual({
      reclaimableBytes: 0,
      reclaimableCount: 0,
    })
    expect(gcStatus(sweepCtx, at('2026-02-01T00:00:00.000Z'))).toEqual({
      reclaimableBytes: 19,
      reclaimableCount: 1,
    })

    const swept = runGcSweep(sweepCtx, { now: at('2026-02-01T00:00:00.000Z') })
    expect(swept).toMatchObject({ reclaimed: [hash], failed: [], reclaimableBytes: 19 })
    expect(handle.db.get('SELECT id FROM asset WHERE id = ?', assetId)).toBeUndefined()
    expect(existsSync(blobPath(dir, hash))).toBe(false)
    expect(existsSync(thumbnailPath(dir, hash))).toBe(false)
    expect(readFileSync(join(dir, GC_MANIFEST_PATH), 'utf8')).toContain(hash)
    expect(
      handle.db.get('SELECT value FROM settings WHERE key = ?', GC_ELIGIBILITY_KEY),
    ).toBeUndefined()

    const recovery = runRecovery({ db: handle.db, projectId: handle.projectId, dir })
    expect(recovery.integrityErrors).toEqual([])
  })

  it('ages filesystem-only orphans and compacts a re-referenced candidate', () => {
    writeManagedBlob()
    const reReferencedHash = 'b'.repeat(64)
    const assetId = insertAsset(reReferencedHash)
    const sweepCtx = { ...ctx, dir }
    runGcSweep(sweepCtx, { now: at('2026-01-01T00:00:00.000Z') })

    insertNode('active', assetId)
    const later = runGcSweep(sweepCtx, { now: at('2026-02-01T00:00:00.000Z') })
    expect(later.reclaimed).toEqual([hash])
    expect(handle.db.get('SELECT id FROM asset WHERE id = ?', assetId)).toBeDefined()
    const stored = handle.db.get<{ value: string }>(
      'SELECT value FROM settings WHERE key = ?',
      GC_ELIGIBILITY_KEY,
    )
    expect(stored).toBeUndefined()
  })

  it('does not start a clock while an export lease guards the hash', () => {
    insertAsset(hash)
    writeManagedBlob()
    const release = acquireExportLease([hash])
    const sweepCtx = { ...ctx, dir }
    expect(runGcSweep(sweepCtx, { now: at('2026-01-01T00:00:00.000Z') }).deferred).toBe(0)
    release()
    expect(runGcSweep(sweepCtx, { now: at('2026-02-01T00:00:00.000Z') })).toMatchObject({
      reclaimed: [],
      deferred: 1,
    })
  })

  it('resumes a post-delete manifest receipt and yields to an expired budget', () => {
    const sweepCtx = { ...ctx, dir }
    setProjectSetting(handle.db, handle.projectId, GC_ELIGIBILITY_KEY, {
      [hash]: {
        firstSeenAt: '2026-01-01T00:00:00.000Z',
        pendingManifest: { deletedAt: '2026-02-01T00:00:00.000Z', bytes: 17 },
      },
    })
    const resumed = runGcSweep(sweepCtx, {
      now: at('2026-02-02T00:00:00.000Z'),
      deadlineAtMs: Date.now() + 10_000,
    })
    expect(resumed).toMatchObject({ reclaimed: [hash], reclaimableBytes: 17 })
    expect(readFileSync(join(dir, GC_MANIFEST_PATH), 'utf8')).toContain(hash)

    insertAsset(hash)
    writeManagedBlob()
    const stopped = runGcSweep(sweepCtx, {
      now: at('2026-03-10T00:00:00.000Z'),
      deadlineAtMs: 0,
    })
    expect(stopped).toMatchObject({ stoppedForBudget: true, reclaimed: [] })
    expect(existsSync(blobPath(dir, hash))).toBe(true)
  })
})
