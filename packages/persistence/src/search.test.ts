import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { uuidv7 } from '@ew/domain'
import { CommandRegistry, type CommittedResult } from '@ew/commands'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Db } from './db'
import { Dispatcher, type CommandContext } from './dispatcher'
import { registerAssetHandlers } from './handlers/assets'
import { registerCanvasHandlers } from './handlers/canvases'
import { registerDecorationHandlers } from './handlers/decorations'
import { registerNodeHandlers } from './handlers/nodes'
import { registerNoteHandlers } from './handlers/notes'
import { registerTagHandlers } from './handlers/tags'
import { createProject, type ProjectHandle } from './project'
import { ftsMatchExpression, rebuildSearchIndex } from './search'

let dir: string
let handle: ProjectHandle
let dispatcher: Dispatcher

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'ew-search-'))
  handle = createProject(dir, 'Search Test')
  const registry = new CommandRegistry<CommandContext>()
  registerNodeHandlers(registry)
  registerNoteHandlers(registry)
  registerAssetHandlers(registry)
  registerCanvasHandlers(registry)
  registerTagHandlers(registry)
  registerDecorationHandlers(registry)
  dispatcher = new Dispatcher(handle, registry)
})

afterEach(() => {
  handle.close()
  rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
})

function committed(commandType: string, payload: unknown): CommittedResult {
  const result = dispatcher.execute({
    commandId: uuidv7(),
    projectId: handle.projectId,
    commandType,
    commandVersion: 1,
    issuedAt: new Date().toISOString(),
    payload,
  })
  expect(result).toMatchObject({ status: 'committed' })
  return result as CommittedResult
}

function createNote(title: string, body = ''): string {
  const noteId = uuidv7()
  committed('CreateNote', { noteId, title, body })
  return noteId
}

function createTag(name: string): string {
  const tagId = uuidv7()
  committed('CreateTag', { tagId, name })
  return tagId
}

function commitAsset(originalFilename: string): string {
  const assetId = uuidv7()
  committed('CommitAssetImport', {
    assetId,
    kind: 'image',
    contentHash: 'c0ffee'.repeat(10).slice(0, 64),
    originalFilename,
    mimeType: 'image/png',
    width: null,
    height: null,
    storagePath: `assets/c0/${assetId}`,
  })
  return assetId
}

function createTextDecoration(text: string, canvasId = handle.rootCanvasId): string {
  const decorationId = uuidv7()
  committed('CreateDecoration', { decorationId, canvasId, kind: 'text', data: { text } })
  return decorationId
}

/** Raw fts hits joined back to base-table UUIDs. */
function ftsIds(fts: string, base: string, term: string): string[] {
  return handle.db
    .all<{ id: string }>(
      `SELECT b.id FROM ${fts} JOIN ${base} b ON b.rowid = ${fts}.rowid
       WHERE ${fts} MATCH ?`,
      term,
    )
    .map((r) => r.id)
}

describe('fts5 availability probe', () => {
  it('supports CREATE VIRTUAL TABLE ... USING fts5 in the AI-IMP-009 binding', () => {
    const probeDir = mkdtempSync(join(tmpdir(), 'ew-fts-probe-'))
    const db = Db.open(join(probeDir, 'probe.sqlite'))
    try {
      db.exec(`CREATE VIRTUAL TABLE probe USING fts5(content)`)
      db.run(`INSERT INTO probe(content) VALUES ('the old lighthouse keeper')`)
      const hits = db.all(`SELECT rowid FROM probe WHERE probe MATCH 'lighthouse'`)
      expect(hits).toHaveLength(1)
    } finally {
      db.close()
      rmSync(probeDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
    }
  })
})

describe('index maintenance: note_fts', () => {
  it('indexes title and body on create, within the committing transaction', () => {
    const noteId = createNote('Harbor Wall', 'granite against the lighthouse swell')
    expect(ftsIds('note_fts', 'note', 'lighthouse')).toEqual([noteId])
    expect(ftsIds('note_fts', 'note', 'harbor')).toEqual([noteId])
  })

  it('tracks body updates and title renames, dropping stale terms', () => {
    const noteId = createNote('Harbor Wall', 'old beacon text')
    committed('UpdateNote', { noteId, body: 'replaced with breakwater notes' })
    expect(ftsIds('note_fts', 'note', 'beacon')).toEqual([])
    expect(ftsIds('note_fts', 'note', 'breakwater')).toEqual([noteId])

    committed('RenameNote', { noteId, title: 'Seawall' })
    expect(ftsIds('note_fts', 'note', 'harbor')).toEqual([])
    expect(ftsIds('note_fts', 'note', 'seawall')).toEqual([noteId])
  })

  it('drops index rows on purge (raw DELETE, no handler cooperation)', () => {
    const noteId = createNote('Doomed', 'ephemeral flotsam')
    handle.db.run('DELETE FROM link WHERE source_note_id = ?', noteId)
    handle.db.run('DELETE FROM note WHERE id = ?', noteId)
    expect(ftsIds('note_fts', 'note', 'flotsam')).toEqual([])
    // The external-content index stays internally consistent.
    expect(() => handle.db.exec(`INSERT INTO note_fts(note_fts) VALUES ('integrity-check')`)).not.toThrow()
  })
})

describe('index maintenance: tag_fts', () => {
  it('indexes create and rename, dropping the old name', () => {
    const tagId = createTag('coastal')
    expect(ftsIds('tag_fts', 'tag', 'coastal')).toEqual([tagId])

    committed('RenameTag', { tagId, name: 'maritime' })
    expect(ftsIds('tag_fts', 'tag', 'coastal')).toEqual([])
    expect(ftsIds('tag_fts', 'tag', 'maritime')).toEqual([tagId])
  })

  it('drops index rows on purge', () => {
    const tagId = createTag('fleeting')
    handle.db.run('DELETE FROM tag WHERE id = ?', tagId)
    expect(ftsIds('tag_fts', 'tag', 'fleeting')).toEqual([])
  })
})

describe('index maintenance: asset_fts', () => {
  it('indexes original filename on commit', () => {
    const assetId = commitAsset('cliffs_ref.png')
    // unicode61 splits on '_' and '.', so each fragment matches.
    expect(ftsIds('asset_fts', 'asset', 'cliffs')).toEqual([assetId])
    expect(ftsIds('asset_fts', 'asset', 'png')).toEqual([assetId])
  })

  it('drops index rows on purge', () => {
    const assetId = commitAsset('gone.png')
    handle.db.run('DELETE FROM derivative_jobs WHERE asset_id = ?', assetId)
    handle.db.run('DELETE FROM asset WHERE id = ?', assetId)
    expect(ftsIds('asset_fts', 'asset', 'gone')).toEqual([])
  })
})

describe('index maintenance: canvas_text_fts', () => {
  it('indexes only text-kind decorations, over $.text', () => {
    const textId = createTextDecoration('old beacon')
    const shapeId = uuidv7()
    committed('CreateDecoration', {
      decorationId: shapeId,
      canvasId: handle.rootCanvasId,
      kind: 'shape',
      data: { text: 'smuggled shape prose' },
    })
    expect(ftsIds('canvas_text_fts', 'decoration', 'beacon')).toEqual([textId])
    expect(ftsIds('canvas_text_fts', 'decoration', 'smuggled')).toEqual([])
  })

  it('tracks UpdateDecoration data edits and DeleteDecoration', () => {
    const decorationId = createTextDecoration('old beacon')
    committed('UpdateDecoration', { decorationId, set: { data: { text: 'new lantern' } } })
    expect(ftsIds('canvas_text_fts', 'decoration', 'beacon')).toEqual([])
    expect(ftsIds('canvas_text_fts', 'decoration', 'lantern')).toEqual([decorationId])

    committed('DeleteDecoration', { decorationId })
    expect(ftsIds('canvas_text_fts', 'decoration', 'lantern')).toEqual([])
  })

  it('drops index rows on raw purge DELETE', () => {
    const decorationId = createTextDecoration('vanishing ink')
    handle.db.run('DELETE FROM decoration WHERE id = ?', decorationId)
    expect(ftsIds('canvas_text_fts', 'decoration', 'vanishing')).toEqual([])
  })
})

describe('rebuildSearchIndex', () => {
  it('repopulates all four corpora after index corruption', () => {
    const noteId = createNote('Harbor Wall', 'lighthouse swell')
    const tagId = createTag('coastal')
    const assetId = commitAsset('cliffs_ref.png')
    const decorationId = createTextDecoration('old beacon')

    // Corrupt: remove every row from each index while base rows stay.
    handle.db.exec(`INSERT INTO note_fts(note_fts) VALUES ('delete-all')`)
    handle.db.exec(`INSERT INTO tag_fts(tag_fts) VALUES ('delete-all')`)
    handle.db.exec(`INSERT INTO asset_fts(asset_fts) VALUES ('delete-all')`)
    handle.db.exec(`DELETE FROM canvas_text_fts`)
    expect(ftsIds('note_fts', 'note', 'lighthouse')).toEqual([])
    expect(ftsIds('tag_fts', 'tag', 'coastal')).toEqual([])
    expect(ftsIds('asset_fts', 'asset', 'cliffs')).toEqual([])
    expect(ftsIds('canvas_text_fts', 'decoration', 'beacon')).toEqual([])

    rebuildSearchIndex({ db: handle.db })

    expect(ftsIds('note_fts', 'note', 'lighthouse')).toEqual([noteId])
    expect(ftsIds('tag_fts', 'tag', 'coastal')).toEqual([tagId])
    expect(ftsIds('asset_fts', 'asset', 'cliffs')).toEqual([assetId])
    expect(ftsIds('canvas_text_fts', 'decoration', 'beacon')).toEqual([decorationId])
  })
})

describe('ftsMatchExpression', () => {
  it('returns null for empty or whitespace-only input', () => {
    expect(ftsMatchExpression('')).toBeNull()
    expect(ftsMatchExpression('   ')).toBeNull()
  })

  it('quotes each token so MATCH syntax is inert', () => {
    expect(ftsMatchExpression('old beacon')).toBe('"old" "beacon"')
    expect(ftsMatchExpression('"weird" AND syntax')).toBe('"""weird""" "AND" "syntax"')
  })

  it('produces expressions fts5 accepts for hostile input', () => {
    createNote('Syntax Note', 'weird and syntax')
    for (const hostile of ['"weird" AND syntax', 'NOT (a OR b)', 'col:evil', 'wild*', '"', '-"']) {
      const match = ftsMatchExpression(hostile)
      expect(match).not.toBeNull()
      expect(() => ftsIds('note_fts', 'note', match!)).not.toThrow()
    }
    // Operators are matched as literal tokens, not parsed.
    expect(ftsIds('note_fts', 'note', ftsMatchExpression('weird AND syntax')!)).toHaveLength(1)
    expect(ftsIds('note_fts', 'note', ftsMatchExpression('weird AND absent')!)).toHaveLength(0)
  })
})
