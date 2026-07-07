import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { uuidv7 } from '@ew/domain'
import yauzl from 'yauzl'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { blobRelativePath } from '../import/store'
import { openProjectService, type ProjectService } from '../service'
import { DB_ENTRY, MANIFEST_ENTRY, parseManifest, type ExportManifest } from './manifest'
import { estimateExportSize } from './project-export'
import { Db } from '../db'

/**
 * §16 portable export (AI-IMP-157): the archive is one `.ewproj` ZIP —
 * manifest + consistent db copy + notes tree + stored assets. These
 * tests exercise the real service seam end to end on a temp project.
 */

let dir: string
let outDir: string
let service: ProjectService

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'ew-export-'))
  outDir = mkdtempSync(join(tmpdir(), 'ew-export-out-'))
  service = openProjectService(dir, { createIfMissing: true, title: 'Export Fixture' })
})

afterEach(() => {
  service.close()
  rmSync(dir, { recursive: true, force: true })
  rmSync(outDir, { recursive: true, force: true })
})

/** Reach the live connection the way the service's own modules do —
 * through a fresh read handle on the same file (WAL allows readers). */
function readDb(): Db {
  return Db.open(join(dir, 'project.sqlite'), { readOnly: true })
}

/** Insert an asset row + a real content-addressed blob whose name is
 * its true sha256, so import-side verification semantics hold. */
function seedAsset(bytes: Buffer): string {
  const hash = createHash('sha256').update(bytes).digest('hex')
  const blob = join(dir, blobRelativePath(hash))
  mkdirSync(dirname(blob), { recursive: true })
  writeFileSync(blob, bytes)
  const db = readDb()
  const projectId = (db.get<{ id: string }>('SELECT id FROM project') ?? { id: '' }).id
  db.close()
  const now = new Date().toISOString()
  // Write through the service's writer via direct SQL on a writable
  // handle: the service holds the lock, so reuse ITS connection by
  // routing through a command-free seam — the test-only direct open.
  const writer = Db.open(join(dir, 'project.sqlite'))
  writer.run(
    `INSERT INTO asset (id, project_id, kind, content_hash, original_filename,
       mime_type, storage_path, created_at, updated_at)
     VALUES (?, ?, 'image', ?, 'seed.png', 'image/png', ?, ?, ?)`,
    uuidv7(),
    projectId,
    hash,
    blobRelativePath(hash),
    now,
    now,
  )
  writer.close()
  return hash
}

interface ZipEntrySummary {
  path: string
  compressionMethod: number
  uncompressedSize: number
}

function listZip(path: string): Promise<ZipEntrySummary[]> {
  return new Promise((resolve, reject) => {
    const entries: ZipEntrySummary[] = []
    yauzl.open(path, { lazyEntries: true }, (err, zip) => {
      if (err || !zip) return reject(err ?? new Error('no zipfile'))
      zip.on('entry', (entry) => {
        entries.push({
          path: entry.fileName,
          compressionMethod: entry.compressionMethod,
          uncompressedSize: entry.uncompressedSize,
        })
        zip.readEntry()
      })
      zip.on('end', () => resolve(entries))
      zip.on('error', reject)
      zip.readEntry()
    })
  })
}

function readZipEntry(path: string, entryPath: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    yauzl.open(path, { lazyEntries: true }, (err, zip) => {
      if (err || !zip) return reject(err ?? new Error('no zipfile'))
      zip.on('entry', (entry) => {
        if (entry.fileName !== entryPath) return zip.readEntry()
        zip.openReadStream(entry, (streamErr, stream) => {
          if (streamErr || !stream) return reject(streamErr ?? new Error('no stream'))
          const chunks: Buffer[] = []
          stream.on('data', (c: Buffer) => chunks.push(c))
          stream.on('end', () => {
            zip.close()
            resolve(Buffer.concat(chunks))
          })
          stream.on('error', reject)
        })
      })
      zip.on('end', () => reject(new Error(`entry not found: ${entryPath}`)))
      zip.on('error', reject)
      zip.readEntry()
    })
  })
}

describe('exportProject (§16, container rev 0.57)', () => {
  it('writes manifest + db + notes + stored assets, inventory verifying', async () => {
    const assetBytes = Buffer.from('not-really-a-png-but-content-addressed')
    const hash = seedAsset(assetBytes)
    const dest = join(outDir, 'fixture.ewproj')

    const progress: number[] = []
    const result = await service.exportProject(dest, {
      activeOnly: false,
      onProgress: (p) => progress.push(p.bytesWritten),
    })

    expect(result.assets).toBe(1)
    expect(result.bytesWritten).toBeGreaterThan(0)

    const entries = await listZip(dest)
    const paths = entries.map((e) => e.path)
    expect(paths).toContain(MANIFEST_ENTRY)
    expect(paths).toContain(DB_ENTRY)
    expect(paths).toContain(blobRelativePath(hash).replaceAll('\\', '/'))

    // Media is STORED (method 0); the database deflates (method 8).
    const assetEntry = entries.find((e) => e.path.startsWith('assets/'))!
    expect(assetEntry.compressionMethod).toBe(0)
    const dbEntry = entries.find((e) => e.path === DB_ENTRY)!
    expect(dbEntry.compressionMethod).toBe(8)

    // The manifest parses, matches the project, and inventories every
    // non-manifest entry with true sizes.
    const manifest: ExportManifest = parseManifest(
      (await readZipEntry(dest, MANIFEST_ENTRY)).toString('utf8'),
    )
    const info = service.info()
    expect(manifest.projectId).toBe(info.projectId)
    expect(manifest.rootNodeId).toBe(info.rootNodeId)
    expect(manifest.activeOnly).toBe(false)
    expect(manifest.counts.assets).toBe(1)
    const inventoried = new Map(manifest.inventory.map((e) => [e.path, e]))
    for (const entry of entries) {
      if (entry.path === MANIFEST_ENTRY) continue
      const row = inventoried.get(entry.path)
      expect(row, `inventory missing ${entry.path}`).toBeTruthy()
      expect(row!.bytes).toBe(entry.uncompressedSize)
    }
    // The asset's inventory hash IS its content hash.
    expect(inventoried.get(blobRelativePath(hash).replaceAll('\\', '/'))!.sha256).toBe(hash)

    // The archived database is a working SQLite copy of THIS project.
    const dbBytes = await readZipEntry(dest, DB_ENTRY)
    const extracted = join(outDir, 'extracted.sqlite')
    writeFileSync(extracted, dbBytes)
    const copy = Db.open(extracted, { readOnly: true })
    const projectRow = copy.get<{ id: string }>('SELECT id FROM project')
    copy.close()
    expect(projectRow?.id).toBe(info.projectId)
  })

  it('active-only strips trashed records, keeps active ones, and stays FK-clean', async () => {
    const info = service.info()
    const exec = (commandType: string, payload: unknown): void => {
      const result = service.execute({
        commandId: uuidv7(),
        projectId: info.projectId,
        commandType,
        commandVersion: 1,
        issuedAt: new Date().toISOString(),
        payload,
      } as never)
      if (result.status !== 'committed') throw new Error(`${commandType}: ${JSON.stringify(result)}`)
    }
    const keeperId = uuidv7()
    const gonerId = uuidv7()
    exec('CreateNote', { noteId: keeperId, title: 'Keeper', body: 'stays [[Goner]]' })
    exec('CreateNote', { noteId: gonerId, title: 'Goner', body: 'leaves' })
    exec('TrashNote', { noteId: gonerId })

    // Full export still carries the trashed note (§16: backups keep Trash).
    const fullDest = join(outDir, 'full.ewproj')
    await service.exportProject(fullDest, { activeOnly: false })
    const fullDb = join(outDir, 'full.sqlite')
    writeFileSync(fullDb, await readZipEntry(fullDest, DB_ENTRY))
    const full = Db.open(fullDb, { readOnly: true })
    expect(full.all('SELECT id FROM note').length).toBe(2)
    full.close()

    // Active-only drops it and the copy satisfies its own FKs.
    const dest = join(outDir, 'active.ewproj')
    await service.exportProject(dest, { activeOnly: true })
    const manifest = parseManifest((await readZipEntry(dest, MANIFEST_ENTRY)).toString('utf8'))
    expect(manifest.activeOnly).toBe(true)
    const activeDb = join(outDir, 'active.sqlite')
    writeFileSync(activeDb, await readZipEntry(dest, DB_ENTRY))
    const copy = Db.open(activeDb, { readOnly: true })
    const notes = copy.all<{ id: string; title: string }>('SELECT id, title FROM note')
    expect(notes.map((n) => n.title)).toEqual(['Keeper'])
    // The keeper's link to the dropped note broke rather than dangled.
    const links = copy.all<{ state: string; target_note_id: string | null }>(
      'SELECT state, target_note_id FROM link',
    )
    expect(links.length).toBe(1)
    expect(links[0]!.state).toBe('broken')
    expect(links[0]!.target_note_id).toBeNull()
    expect(copy.all('PRAGMA foreign_key_check').length).toBe(0)
    copy.close()
  })

  it('estimates source size by stat and fails loudly on a missing blob', async () => {
    const hash = seedAsset(Buffer.from('here-then-gone'))
    const db = readDb()
    const estimate = await estimateExportSize({ db, dir })
    db.close()
    expect(estimate).toBeGreaterThan(0)

    // Remove the blob out from under the store: export must throw, not
    // write a silently incomplete archive (§16 — the artist's promise).
    rmSync(join(dir, blobRelativePath(hash)))
    await expect(
      service.exportProject(join(outDir, 'broken.ewproj'), { activeOnly: false }),
    ).rejects.toThrow()
  })
})
