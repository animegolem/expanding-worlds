import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { uuidv7 } from '@ew/domain'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { CommandContext } from './dispatcher'
import { computeGcEligibleBlobs, exportLeaseGuardedHashes } from './gc'
import { createProject, type ProjectHandle } from './project'

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

  it('exposes the EPIC-008 export-lease guard as an empty stub', () => {
    expect(exportLeaseGuardedHashes().size).toBe(0)
  })
})
