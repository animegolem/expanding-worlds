import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { uuidv7 } from '@ew/domain'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { blobPath, IMPORT_TMP_DIR } from './import/store'
import { createProject, type ProjectHandle } from './project'
import { runRecovery, type RecoveryReport } from './recovery'
import { openProjectService } from './service'

let dir: string
let handle: ProjectHandle

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'ew-recovery-'))
  handle = createProject(join(dir, 'p'), 'Recovery Test')
})

afterEach(() => {
  handle.close()
  rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
})

const now = (): string => new Date().toISOString()

function recover(): RecoveryReport {
  return runRecovery({ db: handle.db, projectId: handle.projectId, dir: handle.dir })
}

function insertAsset(hash: string): string {
  const id = uuidv7()
  handle.db.run(
    `INSERT INTO asset (id, project_id, kind, content_hash, original_filename,
       mime_type, storage_path, created_at, updated_at)
     VALUES (?, ?, 'image', ?, 'x.png', 'image/png', ?, ?, ?)`,
    id,
    handle.projectId,
    hash,
    `assets/${hash.slice(0, 2)}/${hash}`,
    now(),
    now(),
  )
  return id
}

function writeBlob(hash: string): void {
  const p = blobPath(handle.dir, hash)
  mkdirSync(join(handle.dir, 'assets', hash.slice(0, 2)), { recursive: true })
  writeFileSync(p, `bytes-${hash}`)
}

describe('runRecovery', () => {
  it('reports all checks and nothing else on a clean project', () => {
    const report = recover()
    expect(report.checksRun).toEqual([
      'database-integrity',
      'pending-imports',
      'import-temp-sweep',
      'canonical-blobs',
      'search-index',
    ])
    expect(report.repairs).toEqual([])
    expect(report.integrityErrors).toEqual([])
  })

  it.each(['staging', 'hashed'] as const)(
    'drops an interrupted import in state %s with its temp files',
    (state) => {
      const importId = uuidv7()
      const temp = join(handle.dir, IMPORT_TMP_DIR, importId)
      mkdirSync(temp, { recursive: true })
      writeFileSync(join(temp, 'original'), 'partial bytes')
      handle.db.run(
        `INSERT INTO pending_imports (id, project_id, state, original_filename,
           temp_path, content_hash, created_at, updated_at)
         VALUES (?, ?, ?, 'x.png', ?, ?, ?, ?)`,
        importId,
        handle.projectId,
        state,
        join(IMPORT_TMP_DIR, importId, 'original'),
        state === 'hashed' ? 'a'.repeat(64) : null,
        now(),
        now(),
      )

      const report = recover()
      expect(report.repairs.join(' ')).toContain(importId)
      expect(existsSync(temp)).toBe(false)
      expect(handle.db.get('SELECT id FROM pending_imports WHERE id = ?', importId)).toBeUndefined()
      expect(report.integrityErrors).toEqual([])
    },
  )

  it('sweeps temp dirs that have no pending row at all', () => {
    const stray = join(handle.dir, IMPORT_TMP_DIR, 'no-row-here')
    mkdirSync(stray, { recursive: true })
    writeFileSync(join(stray, 'original'), 'x')
    const report = recover()
    expect(existsSync(stray)).toBe(false)
    expect(report.repairs.join(' ')).toContain('no-row-here')
  })

  it('flags a missing canonical original as an integrity error, never a repair', () => {
    insertAsset('b'.repeat(64))
    const report = recover()
    expect(report.integrityErrors.join(' ')).toContain('b'.repeat(64))
    expect(report.repairs).toEqual([])
    // The asset row must survive — recovery never deletes user data.
    expect(handle.db.get('SELECT id FROM asset')).toBeDefined()
  })

  it('leaves canonical orphan blobs for the age-checked End Session sweep', () => {
    const kept = 'c'.repeat(64)
    const orphan = 'd'.repeat(64)
    insertAsset(kept)
    writeBlob(kept)
    writeBlob(orphan)

    const report = recover()
    expect(existsSync(blobPath(handle.dir, kept))).toBe(true)
    expect(existsSync(blobPath(handle.dir, orphan))).toBe(true)
    expect(report.repairs.join(' ')).not.toContain(orphan)
    expect(report.integrityErrors).toEqual([])
  })

  it('rebuilds a corrupted search index', () => {
    handle.db.run(
      `INSERT INTO note (id, project_id, title, title_key, body, created_at, updated_at)
       VALUES (?, ?, 'Lighthouse Keeper', 'lighthouse keeper', 'beacon prose', ?, ?)`,
      uuidv7(),
      handle.projectId,
      now(),
      now(),
    )
    // Desynchronize the external-content index from its base table.
    handle.db.run(`INSERT INTO note_fts(note_fts) VALUES ('delete-all')`)
    const report = recover()
    expect(report.repairs.join(' ')).toContain('rebuilt search index')
    const hits = handle.db.all(
      `SELECT rowid FROM note_fts WHERE note_fts MATCH '"beacon"'`,
    )
    expect(hits).toHaveLength(1)
  })
})

describe('openProjectService recovery integration', () => {
  it('recovers on open and exposes the report before commands run', () => {
    const svcDir = join(dir, 'svc')
    openProjectService(svcDir, { createIfMissing: true, title: 'T' }).close()

    // Seed an interrupted import between sessions.
    const importId = uuidv7()
    const temp = join(svcDir, IMPORT_TMP_DIR, importId)
    mkdirSync(temp, { recursive: true })
    writeFileSync(join(temp, 'original'), 'partial')

    const service = openProjectService(svcDir, {})
    try {
      expect(service.recovery().repairs.join(' ')).toContain(importId)
      expect(service.recovery().integrityErrors).toEqual([])
    } finally {
      service.close()
    }
  })
})
