import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { uuidv7 } from '@ew/domain'
import {
  COMMAND_COMMIT_ASSET_IMPORT,
  CommandRegistry,
  type CommandEnvelope,
  type CommitAssetImportPayload,
  type CommittedResult,
} from '@ew/commands'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Dispatcher, type CommandContext } from '../dispatcher'
import { createProject, type ProjectHandle } from '../project'
import { QueryRegistry } from '../queries'
import { registerAssetHandlers, registerAssetQueries } from './assets'

let dir: string
let project: ProjectHandle
let dispatcher: Dispatcher
let queries: QueryRegistry

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'ew-assets-'))
  project = createProject(dir, 'Assets Test')
  const registry = new CommandRegistry<CommandContext>()
  registerAssetHandlers(registry)
  dispatcher = new Dispatcher(project, registry)
  queries = new QueryRegistry()
  registerAssetQueries(queries)
})

afterEach(() => {
  project.close()
  rmSync(dir, { recursive: true, force: true })
})

function payload(overrides: Partial<CommitAssetImportPayload> = {}): CommitAssetImportPayload {
  const hash = 'c0ffee00'.repeat(8)
  return {
    assetId: uuidv7(),
    kind: 'image',
    contentHash: hash,
    originalFilename: 'ref.png',
    mimeType: 'image/png',
    width: 640,
    height: 480,
    storagePath: join('assets', hash.slice(0, 2), hash),
    sourceUrl: 'https://example.com/ref.png',
    ...overrides,
  }
}

function commit(p: CommitAssetImportPayload): ReturnType<Dispatcher['execute']> {
  const envelope: CommandEnvelope = {
    commandId: uuidv7(),
    projectId: project.projectId,
    commandType: COMMAND_COMMIT_ASSET_IMPORT,
    commandVersion: 1,
    issuedAt: new Date().toISOString(),
    payload: p,
  }
  return dispatcher.execute(envelope)
}

const queryCtx = () => ({
  db: project.db,
  projectId: project.projectId,
  rootNodeId: project.rootNodeId,
  rootCanvasId: project.rootCanvasId,
})

describe('CommitAssetImport handler', () => {
  it('inserts the Asset row with §4.7 fields, affected, and no inverse', () => {
    const p = payload()
    const result = commit(p)
    expect(result.status).toBe('committed')
    const committed = result as CommittedResult
    expect(committed.affected).toEqual([{ kind: 'asset', id: p.assetId }])
    // Import is not undoable in Phase 1 (recorded decision).
    expect(committed.inverse).toBeNull()

    const row = project.db.get(
      `SELECT kind, content_hash, original_filename, mime_type, width, height,
              storage_path, source_url
       FROM asset WHERE id = ?`,
      p.assetId,
    )
    expect(row).toEqual({
      kind: 'image',
      content_hash: p.contentHash,
      original_filename: 'ref.png',
      mime_type: 'image/png',
      width: 640,
      height: 480,
      storage_path: p.storagePath,
      source_url: 'https://example.com/ref.png',
    })
  })

  it('enqueues the thumbnail job in the same commit', () => {
    const p = payload()
    commit(p)
    const job = project.db.get<{ kind: string; state: string }>(
      'SELECT kind, state FROM derivative_jobs WHERE asset_id = ?',
      p.assetId,
    )
    expect(job).toEqual({ kind: 'thumbnail', state: 'queued' })
  })

  it('stores null source_url and dimensions when absent', () => {
    const p = payload({ width: null, height: null })
    delete p.sourceUrl
    commit(p)
    expect(
      project.db.get('SELECT width, height, source_url FROM asset WHERE id = ?', p.assetId),
    ).toEqual({ width: null, height: null, source_url: null })
  })

  it('rejects structurally invalid payloads', () => {
    expect(commit(payload({ assetId: '' }))).toMatchObject({
      status: 'error',
      code: 'VALIDATION_FAILED',
    })
    expect(
      commit(payload({ kind: 'web-reference' as unknown as 'image' })),
    ).toMatchObject({ status: 'error', code: 'VALIDATION_FAILED' })
  })
})

describe('asset queries', () => {
  it('getAsset returns the row, null when missing', () => {
    const p = payload()
    commit(p)
    const found = queries.run(queryCtx(), 'getAsset', { assetId: p.assetId })
    expect(found).toMatchObject({
      ok: true,
      result: {
        id: p.assetId,
        contentHash: p.contentHash,
        originalFilename: 'ref.png',
        mimeType: 'image/png',
        width: 640,
        height: 480,
        storagePath: p.storagePath,
        sourceUrl: 'https://example.com/ref.png',
        lifecycleState: 'active',
      },
    })
    expect(queries.run(queryCtx(), 'getAsset', { assetId: 'missing' })).toEqual({
      ok: true,
      result: null,
    })
  })

  it('listAssets returns active assets', () => {
    const a = payload()
    const b = payload({ originalFilename: 'copy.png' })
    commit(a)
    commit(b)
    const listed = queries.run(queryCtx(), 'listAssets')
    expect(listed.ok).toBe(true)
    const rows = (listed as { result: Array<{ id: string }> }).result
    expect(rows.map((r) => r.id).sort()).toEqual([a.assetId, b.assetId].sort())
  })
})
