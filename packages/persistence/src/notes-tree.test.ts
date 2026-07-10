import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { uuidv7 } from '@ew/domain'
import { METADATA_OPEN } from '@ew/domain'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Db } from './db'
import { openProjectService, type ProjectService } from './service'
import {
  assignNoteFilename,
  safeNoteBaseName,
  writeNotesTree,
} from './notes-tree'

/**
 * §16 readable notes tree (AI-IMP-120): title-named `.md` files with a
 * collision policy, bodies carrying the §7.8 metadata block, and
 * round-trip stability (an unchanged note re-emits an identical file).
 */

describe('safeNoteBaseName', () => {
  it('strips path separators and reserved characters, keeps spaces', () => {
    expect(safeNoteBaseName('A/B: the "sequel"?')).toBe('A B the sequel')
    expect(safeNoteBaseName('  spaced   out  ')).toBe('spaced out')
  })

  it('drops trailing dots and spaces (illegal on Windows)', () => {
    expect(safeNoteBaseName('Report...')).toBe('Report')
  })

  it('returns empty when nothing printable survives', () => {
    expect(safeNoteBaseName('///')).toBe('')
    expect(safeNoteBaseName('   ')).toBe('')
  })

  it('guards Windows reserved device names', () => {
    expect(safeNoteBaseName('CON')).toBe('CON_')
    expect(safeNoteBaseName('nul')).toBe('nul_')
  })
})

describe('assignNoteFilename', () => {
  it('suffixes case-insensitive collisions deterministically', () => {
    const used = new Map<string, number>()
    expect(assignNoteFilename('Sketch', 'x', used)).toBe('Sketch.md')
    // distinct titles that sanitize to the same base collide
    expect(assignNoteFilename('Sketch', 'y', used)).toBe('Sketch (2).md')
    expect(assignNoteFilename('sketch', 'z', used)).toBe('sketch (3).md')
  })

  it('substitutes the fallback when the base is empty', () => {
    const used = new Map<string, number>()
    expect(assignNoteFilename('', 'abc123', used)).toBe('abc123.md')
  })
})

describe('writeNotesTree', () => {
  let dir: string
  let service: ProjectService
  let ctx: { db: Db; projectId: string; rootNodeId: string; rootCanvasId: string }

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'ew-notes-tree-'))
    service = openProjectService(dir, { createIfMissing: true, title: 'Notes Tree' })
    const info = service.info()
    ctx = {
      db: service.ingestSource().db,
      projectId: info.projectId,
      rootNodeId: info.rootNodeId,
      rootCanvasId: info.rootCanvasId,
    }
  })

  afterEach(() => {
    service.close()
    rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
  })

  function createNote(title: string, body = ''): string {
    const noteId = uuidv7()
    const result = service.execute({
      commandId: uuidv7(),
      projectId: ctx.projectId,
      commandType: 'CreateNote',
      commandVersion: 1,
      issuedAt: new Date().toISOString(),
      expectedRevision: service.info().revision,
      payload: { noteId, title, body },
    })
    expect(result.status).toBe('committed')
    return noteId
  }

  function listNotesDir(): string[] {
    return readdirSync(join(dir, 'notes')).sort()
  }

  it('emits one title-named .md per active note', () => {
    createNote('Alpha', 'first body')
    createNote('Beta', 'second body')
    const result = writeNotesTree(ctx, dir)
    expect(result.notes).toBe(2)
    expect(listNotesDir()).toEqual(['Alpha.md', 'Beta.md'])
    expect(readFileSync(join(dir, 'notes', 'Alpha.md'), 'utf8')).toContain('first body')
  })

  it('resolves title collisions with a deterministic suffix', () => {
    // Distinct titles (distinct title_key) that sanitize to one base.
    createNote('A:B', 'x')
    createNote('A/B', 'y')
    const result = writeNotesTree(ctx, dir)
    expect(result.notes).toBe(2)
    expect(listNotesDir()).toEqual(['A B (2).md', 'A B.md'])
  })

  it('includes the §7.8 metadata block for a note with provenance', () => {
    // A note carrying an image-backed node gets a Provenance section.
    const noteId = createNote('Illustrated', 'prose')
    // Direct DB wiring: an image asset + a node attached to the note.
    const assetId = uuidv7()
    const nodeId = uuidv7()
    const db = ctx.db
    const now = new Date().toISOString()
    db.run(
      `INSERT INTO asset (id, project_id, kind, content_hash, original_filename,
                          mime_type, storage_path, created_at, updated_at)
       VALUES (?, ?, 'image', ?, 'pic.png', 'image/png', 'assets/hh/x', ?, ?)`,
      assetId,
      ctx.projectId,
      'h'.repeat(64),
      now,
      now,
    )
    db.run(
      `INSERT INTO node (id, project_id, note_id, appearance_kind, appearance_asset_id,
                        created_at, updated_at)
       VALUES (?, ?, ?, 'image', ?, ?, ?)`,
      nodeId,
      ctx.projectId,
      noteId,
      assetId,
      now,
      now,
    )
    writeNotesTree(ctx, dir)
    const body = readFileSync(join(dir, 'notes', 'Illustrated.md'), 'utf8')
    expect(body).toContain(METADATA_OPEN)
    expect(body).toContain('## Provenance')
    expect(body).toContain('pic.png')
  })

  it('is round-trip stable — an unchanged note re-emits an identical file untouched', () => {
    createNote('Stable', 'unchanging body')
    writeNotesTree(ctx, dir)
    const path = join(dir, 'notes', 'Stable.md')
    const first = readFileSync(path, 'utf8')
    const mtime1 = statSync(path).mtimeMs
    // Second pass: identical content must not rewrite the file.
    writeNotesTree(ctx, dir)
    expect(readFileSync(path, 'utf8')).toBe(first)
    expect(statSync(path).mtimeMs).toBe(mtime1)
  })

  it('sweeps orphan .md files for notes that disappeared', () => {
    createNote('Keep', 'a')
    createNote('Gone', 'b')
    writeNotesTree(ctx, dir)
    expect(listNotesDir()).toEqual(['Gone.md', 'Keep.md'])
    // Trashing a note removes it from the active set — its file must go.
    ctx.db.run("UPDATE note SET lifecycle_state = 'trashed' WHERE title = 'Gone'")
    writeNotesTree(ctx, dir)
    expect(listNotesDir()).toEqual(['Keep.md'])
  })
})
