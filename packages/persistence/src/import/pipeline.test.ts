import { createHash, randomFillSync } from 'node:crypto'
import { createWriteStream, mkdtempSync, rmSync } from 'node:fs'
import { readdir, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { CommandRegistry, DomainError } from '@ew/commands'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Dispatcher, type CommandContext } from '../dispatcher'
import { registerAssetHandlers } from '../handlers/assets'
import { createProject, type ProjectHandle } from '../project'
import { openProjectService, type ProjectService } from '../service'
import {
  commitStaged,
  hashStaged,
  importAsset,
  sniffStaged,
  stageImport,
  type ImportDeps,
} from './pipeline'
import { blobPath } from './store'

let dir: string
let project: ProjectHandle
let deps: ImportDeps

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'ew-pipeline-'))
  project = createProject(join(dir, 'proj'), 'Pipeline Test')
  const registry = new CommandRegistry<CommandContext>()
  registerAssetHandlers(registry)
  const dispatcher = new Dispatcher(project, registry)
  deps = {
    db: project.db,
    projectId: project.projectId,
    dir: project.dir,
    execute: (envelope) => dispatcher.execute(envelope),
    now: () => new Date().toISOString(),
  }
})

afterEach(() => {
  project.close()
  rmSync(dir, { recursive: true, force: true })
})

// Minimal byte-built fixtures (parsers are covered in sniff.test.ts).
function pngBytes(width: number, height: number): Buffer {
  const ihdr = Buffer.alloc(25)
  ihdr.writeUInt32BE(13, 0)
  ihdr.write('IHDR', 4, 'latin1')
  ihdr.writeUInt32BE(width, 8)
  ihdr.writeUInt32BE(height, 12)
  ihdr[16] = 8
  ihdr[17] = 6
  const iend = Buffer.from([0, 0, 0, 0, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82])
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    ihdr,
    iend,
  ])
}

function gifBytes(width: number, height: number): Buffer {
  const buf = Buffer.alloc(14)
  buf.write('GIF89a', 0, 'latin1')
  buf.writeUInt16LE(width, 6)
  buf.writeUInt16LE(height, 8)
  buf[13] = 0x3b
  return buf
}

const sha256 = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex')

function counts(): { assets: number; pending: number; jobs: number; logs: number } {
  const one = (sql: string): number => project.db.get<{ n: number }>(sql)!.n
  return {
    assets: one('SELECT count(*) AS n FROM asset'),
    pending: one('SELECT count(*) AS n FROM pending_imports'),
    jobs: one('SELECT count(*) AS n FROM derivative_jobs'),
    logs: one('SELECT count(*) AS n FROM command_log'),
  }
}

const revision = (): number =>
  project.db.get<{ project_revision: number }>('SELECT project_revision FROM project')!
    .project_revision

describe('importAsset pipeline', () => {
  it('imports a PNG end to end (acceptance: RFC slice item 3)', async () => {
    const bytes = pngBytes(640, 480)
    const before = revision()
    const result = await importAsset(deps, {
      bytes,
      originalFilename: 'ref.png',
      sourceUrl: 'https://example.com/ref.png',
    })
    expect(result.deduplicated).toBe(false)

    // Original landed in assets/ under its content hash.
    const hash = sha256(bytes)
    expect((await stat(blobPath(project.dir, hash))).size).toBe(bytes.length)

    // Asset row records filename, MIME, dimensions, hash, source URL.
    const asset = project.db.get(
      `SELECT content_hash, original_filename, mime_type, width, height, source_url
       FROM asset WHERE id = ?`,
      result.assetId,
    )
    expect(asset).toEqual({
      content_hash: hash,
      original_filename: 'ref.png',
      mime_type: 'image/png',
      width: 640,
      height: 480,
      source_url: 'https://example.com/ref.png',
    })

    // Revision advanced once, through the dispatcher (command_log row).
    expect(revision()).toBe(before + 1)
    expect(
      project.db.get<{ n: number }>(
        `SELECT count(*) AS n FROM command_log WHERE command_type = 'CommitAssetImport'`,
      )!.n,
    ).toBe(1)

    // A thumbnail job exists.
    expect(
      project.db.get('SELECT kind, state FROM derivative_jobs WHERE asset_id = ?', result.assetId),
    ).toEqual({ kind: 'thumbnail', state: 'queued' })

    // Pending row reached 'committed'; temp staging is cleaned.
    expect(project.db.all<{ state: string }>('SELECT state FROM pending_imports')).toEqual([
      { state: 'committed' },
    ])
    expect(await readdir(join(project.dir, 'cache', 'import-tmp'))).toEqual([])
  })

  it('dedupes bytes without merging Asset records (§4.7)', async () => {
    const bytes = pngBytes(64, 64)
    const first = await importAsset(deps, { bytes, originalFilename: 'ref.png' })
    const second = await importAsset(deps, { bytes, originalFilename: 'copy.png' })

    expect(first.deduplicated).toBe(false)
    expect(second.deduplicated).toBe(true)
    expect(second.assetId).not.toBe(first.assetId)

    // One blob on disk, two Asset rows with their own metadata.
    const hash = sha256(bytes)
    expect(await readdir(join(project.dir, 'assets', hash.slice(0, 2)))).toEqual([hash])
    const names = project.db
      .all<{ original_filename: string }>('SELECT original_filename FROM asset ORDER BY id')
      .map((r) => r.original_filename)
    expect(names).toEqual(['ref.png', 'copy.png'])
  })

  it('sniffs by bytes, never extension: a GIF mislabeled .png imports as image/gif', async () => {
    const result = await importAsset(deps, {
      bytes: gifBytes(3, 4),
      originalFilename: 'photo.png',
    })
    expect(
      project.db.get('SELECT mime_type, width, height FROM asset WHERE id = ?', result.assetId),
    ).toEqual({ mime_type: 'image/gif', width: 3, height: 4 })
  })

  it('rejects a PDF with IMPORT_UNSUPPORTED_TYPE and zero records (§4.7)', async () => {
    const before = { counts: counts(), revision: revision() }
    await expect(
      importAsset(deps, {
        bytes: Buffer.from('%PDF-1.7\n1 0 obj\nendobj\n', 'latin1'),
        originalFilename: 'doc.pdf',
      }),
    ).rejects.toMatchObject({ name: 'DomainError', code: 'IMPORT_UNSUPPORTED_TYPE' })

    expect(counts()).toEqual(before.counts)
    expect(revision()).toBe(before.revision)
    // Temp cleaned; nothing landed in assets/.
    expect(await readdir(join(project.dir, 'cache', 'import-tmp'))).toEqual([])
    expect(await readdir(join(project.dir, 'assets'))).toEqual([])
  })

  it('rejects truncated image bytes the same way', async () => {
    await expect(
      importAsset(deps, {
        bytes: pngBytes(9, 9).subarray(0, 12), // signature + partial IHDR
        originalFilename: 'cut.png',
      }),
    ).rejects.toMatchObject({ code: 'IMPORT_UNSUPPORTED_TYPE' })
    expect(counts()).toMatchObject({ assets: 0, pending: 0, jobs: 0 })
  })

  it('validates input shape: bytes xor sourcePath, non-empty filename', async () => {
    await expect(importAsset(deps, { originalFilename: 'x.png' })).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    })
    await expect(
      importAsset(deps, {
        bytes: pngBytes(1, 1),
        sourcePath: '/nope',
        originalFilename: 'x.png',
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' })
    await expect(
      importAsset(deps, { bytes: pngBytes(1, 1), originalFilename: '' }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' })
  })

  it('cleans up when the source file is unreadable', async () => {
    await expect(
      importAsset(deps, {
        sourcePath: join(dir, 'does-not-exist.png'),
        originalFilename: 'ghost.png',
      }),
    ).rejects.toMatchObject({ code: 'IMPORT_IO_FAILED' })
    expect(counts()).toMatchObject({ assets: 0, pending: 0 })
    expect(await readdir(join(project.dir, 'cache', 'import-tmp'))).toEqual([])
  })

  it('interruption after hashing leaves exactly the state AI-IMP-016 reconciles', async () => {
    const bytes = pngBytes(320, 200)
    const staged = await stageImport(deps, { bytes, originalFilename: 'interrupted.png' })
    const sniffed = await sniffStaged(deps, staged)
    expect(sniffed.format).toBe('png')
    const hash = await hashStaged(deps, staged)
    // Stop here: simulated crash between hash and commit.

    // The pending row + temp file fully describe the interruption:
    const pending = project.db.get<{ state: string; content_hash: string; temp_path: string }>(
      'SELECT state, content_hash, temp_path FROM pending_imports WHERE id = ?',
      staged.importId,
    )
    expect(pending).toEqual({
      state: 'hashed',
      content_hash: hash,
      temp_path: join('cache', 'import-tmp', staged.importId, 'original'),
    })
    // Temp bytes are intact where temp_path points (relative to dir).
    expect((await stat(join(project.dir, pending!.temp_path))).size).toBe(bytes.length)
    // No dangling Asset row, no blob, no job, no revision bump.
    expect(counts()).toMatchObject({ assets: 0, jobs: 0, logs: 0 })
    await expect(stat(blobPath(project.dir, hash))).rejects.toThrow()
    expect(revision()).toBe(0)

    // And the recorded state is resumable: committing later succeeds.
    const result = await commitStaged(deps, staged, sniffed, hash)
    expect(result.deduplicated).toBe(false)
    expect(counts()).toMatchObject({ assets: 1, jobs: 1 })
  })

  it(
    'streams a ~64MB file without blocking queries, hashing correctly (NFR)',
    { timeout: 60_000 },
    async () => {
      // Generate random bytes to a temp source file, hashing as we go.
      const sourcePath = join(dir, 'big.bin.png')
      const digest = createHash('sha256')
      const chunk = Buffer.alloc(4 * 1024 * 1024)
      // First chunk carries a PNG header so the import is accepted.
      pngBytes(4096, 4096).copy(chunk, 0)
      await new Promise<void>((resolve, reject) => {
        const out = createWriteStream(sourcePath)
        out.on('error', reject)
        for (let i = 0; i < 16; i += 1) {
          if (i > 0) randomFillSync(chunk)
          digest.update(chunk)
          out.write(Buffer.from(chunk))
        }
        out.end(resolve)
      })
      const expectedHash = digest.digest('hex')

      let settled = false
      const importing = importAsset(deps, { sourcePath, originalFilename: 'big.png' }).finally(
        () => {
          settled = true
        },
      )
      // Yield once so the import starts its async IO...
      await new Promise((resolve) => setImmediate(resolve))
      // ...then show the service thread still answers while it runs.
      const t0 = performance.now()
      const row = project.db.get('SELECT id FROM project')
      const queryMs = performance.now() - t0
      expect(row).toBeDefined()
      expect(queryMs).toBeLessThan(1000)
      expect(settled).toBe(false) // the 64MB import was still in flight

      const result = await importing
      const asset = project.db.get<{ content_hash: string }>(
        'SELECT content_hash FROM asset WHERE id = ?',
        result.assetId,
      )
      expect(asset!.content_hash).toBe(expectedHash)
      expect((await stat(blobPath(project.dir, expectedHash))).size).toBe(chunk.length * 16)
    },
  )
})

describe('ProjectService.importAsset (utility seam shape)', () => {
  let service: ProjectService
  let serviceDir: string

  beforeEach(() => {
    serviceDir = join(dir, 'svc')
    service = openProjectService(serviceDir, { createIfMissing: true, title: 'Import Seam' })
  })

  afterEach(() => {
    service.close()
  })

  it('returns the IPC response fields and emits one project-changed event', async () => {
    const events: unknown[] = []
    service.subscribe((e) => events.push(e))
    const result = await service.importAsset({
      bytes: pngBytes(10, 20),
      originalFilename: 'seam.png',
    })
    expect(result).toEqual({ assetId: expect.any(String), deduplicated: false })
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      type: 'project-changed',
      commandType: 'CommitAssetImport',
      affected: [{ kind: 'asset', id: result.assetId }],
    })
    expect(service.query('getAsset', { assetId: result.assetId })).toMatchObject({
      ok: true,
      result: { originalFilename: 'seam.png', mimeType: 'image/png' },
    })
  })

  it('throws DomainError with a structured code on rejection', async () => {
    const attempt = service.importAsset({
      bytes: Buffer.from('plain text'),
      originalFilename: 'nope.txt',
    })
    await expect(attempt).rejects.toBeInstanceOf(DomainError)
    await expect(attempt).rejects.toMatchObject({ code: 'IMPORT_UNSUPPORTED_TYPE' })
  })
})
