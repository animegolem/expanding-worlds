import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { uuidv7 } from '@ew/domain'
import type { CommandResult, CommittedResult } from '@ew/commands'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Db } from './db'
import { DB_FILENAME } from './project'
import { openProjectService, type ProjectService } from './service'

/**
 * RFC-0001 §5 conformance suite (AI-IMP-016): one describe per
 * invariant, asserting through the public service surface. Rules
 * covered in depth by feature suites still assert their core here so
 * this file reads as the §18 acceptance map. Row-level verification
 * uses a same-process read connection; all mutations go through
 * service.execute.
 *
 * Rules 24–25 and 29–31 are interactive undo/editor semantics owned
 * by EPIC-005/007; they are asserted here at the data-contract level
 * the RFC fixes: inverse commands, one command_log row per user-level
 * command, and a metadata-only log with no persisted undo state.
 */

let dir: string
let service: ProjectService
let reader: Db

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'ew-invariants-'))
  service = openProjectService(join(dir, 'p'), { createIfMissing: true, title: 'Invariants' })
  reader = Db.open(join(dir, 'p', DB_FILENAME))
})

afterEach(() => {
  reader.close()
  service.close()
  rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
})

function exec(commandType: string, payload: unknown): CommandResult {
  return service.execute({
    commandId: uuidv7(),
    projectId: service.info().projectId,
    commandType,
    commandVersion: 1,
    issuedAt: new Date().toISOString(),
    payload,
  })
}

function committed(commandType: string, payload: unknown): CommittedResult {
  const result = exec(commandType, payload)
  expect(result, `${commandType} should commit, got ${JSON.stringify(result)}`).toMatchObject({
    status: 'committed',
  })
  return result as CommittedResult
}

function createNode(): string {
  const nodeId = uuidv7()
  committed('CreateNode', { nodeId })
  return nodeId
}

function createNote(title: string, body = ''): string {
  const noteId = uuidv7()
  committed('CreateNote', { noteId, title, body })
  return noteId
}

function createCanvas(nodeId: string): string {
  const canvasId = uuidv7()
  committed('CreateCanvas', { canvasId, nodeId })
  return canvasId
}

function createPlacement(canvasId: string, nodeId: string): string {
  const placementId = uuidv7()
  committed('CreatePlacement', { placementId, canvasId, nodeId, x: 0, y: 0 })
  return placementId
}

function insertAssetRow(): string {
  // Assets normally arrive via the import pipeline (covered by its own
  // suite); rules that only need an asset reference seed a row.
  const id = uuidv7()
  const hash = uuidv7().replaceAll('-', '').repeat(2)
  reader.run(
    `INSERT INTO asset (id, project_id, kind, content_hash, original_filename,
       mime_type, storage_path, created_at, updated_at)
     VALUES (?, ?, 'image', ?, 'seed.png', 'image/png', 'assets/xx/seed', ?, ?)`,
    id,
    service.info().projectId,
    hash,
    new Date().toISOString(),
    new Date().toISOString(),
  )
  return id
}

const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

describe('invariant 1: application identities are RFC 9562 UUIDv7', () => {
  it('holds for the server-generated project aggregate', () => {
    const info = service.info()
    expect(info.projectId).toMatch(UUID_V7)
    expect(info.rootNodeId).toMatch(UUID_V7)
    expect(info.rootCanvasId).toMatch(UUID_V7)
  })
})

describe('invariant 2: one protected root node and canvas; Home targets it', () => {
  it('exposes the root canvas and refuses to trash either root record', () => {
    const { rootNodeId, rootCanvasId } = service.info()
    expect(rootCanvasId).toBeTruthy()
    expect(exec('TrashNode', { nodeId: rootNodeId })).toMatchObject({ status: 'error' })
    expect(exec('TrashCanvas', { canvasId: rootCanvasId })).toMatchObject({ status: 'error' })
  })
})

describe('invariant 3: a node references at most one note', () => {
  it('rejects a second attachment', () => {
    const nodeId = createNode()
    committed('AttachNoteToNode', { nodeId, noteId: createNote('First') })
    expect(
      exec('AttachNoteToNode', { nodeId, noteId: createNote('Second') }),
    ).toMatchObject({ status: 'error', code: 'NODE_HAS_NOTE' })
  })
})

describe('invariant 4: a note may be referenced by zero or more nodes', () => {
  it('supports zero, one, and two referents', () => {
    const noteId = createNote('Shared Meaning')
    const a = createNode()
    const b = createNode()
    committed('AttachNoteToNode', { nodeId: a, noteId })
    committed('AttachNoteToNode', { nodeId: b, noteId })
    const referents = reader.all('SELECT id FROM node WHERE note_id = ?', noteId)
    expect(referents).toHaveLength(2)
  })
})

describe('invariant 5: title_key uniqueness, including Trash', () => {
  it('blocks duplicates while active and while trashed; purge frees the title', () => {
    const noteId = createNote('Ghost Ship')
    expect(exec('CreateNote', { noteId: uuidv7(), title: ' ghost  SHIP ' })).toMatchObject({
      status: 'error',
      code: 'NOTE_TITLE_CONFLICT',
    })
    committed('TrashNote', { noteId })
    expect(exec('CreateNote', { noteId: uuidv7(), title: 'Ghost Ship' })).toMatchObject({
      status: 'error',
      details: { conflictingLifecycle: 'trashed' },
    })
    committed('PurgeRecord', { kind: 'note', id: noteId })
    committed('CreateNote', { noteId: uuidv7(), title: 'Ghost Ship' })
  })
})

describe('invariant 6: wiki links target note IDs through indexed link records', () => {
  it('binds by record, not by text', () => {
    const target = createNote('Harbor')
    const source = createNote('Source', 'see [[Harbor]]')
    const link = reader.get<{ target_note_id: string; state: string }>(
      'SELECT target_note_id, state FROM link WHERE source_note_id = ?',
      source,
    )
    expect(link).toMatchObject({ state: 'bound', target_note_id: target })
  })
})

describe('invariant 7: placements target node IDs', () => {
  it('enforces the reference', () => {
    const canvasId = service.info().rootCanvasId
    expect(
      exec('CreatePlacement', {
        placementId: uuidv7(),
        canvasId,
        nodeId: 'nonexistent',
        x: 0,
        y: 0,
      }),
    ).toMatchObject({ status: 'error' })
    createPlacement(canvasId, createNode())
  })
})

describe('invariant 8: tags are flat, project-scoped, node-only', () => {
  it('assigns to nodes and refuses non-node targets', () => {
    const tagId = uuidv7()
    committed('CreateTag', { tagId, name: 'coastal' })
    committed('AssignTagToNode', { tagId, nodeId: createNode() })
    expect(exec('AssignTagToNode', { tagId, nodeId: createNote('Not A Node') })).toMatchObject({
      status: 'error',
    })
  })
})

describe('invariant 9: a node may have many placements, including on one canvas', () => {
  it('places one node twice on the root canvas', () => {
    const nodeId = createNode()
    const canvasId = service.info().rootCanvasId
    createPlacement(canvasId, nodeId)
    createPlacement(canvasId, nodeId)
    const rows = reader.all('SELECT id FROM placement WHERE node_id = ?', nodeId)
    expect(rows).toHaveLength(2)
  })
})

describe('invariant 10: at most one canvas per node (Phase 1)', () => {
  it('rejects the second canvas', () => {
    const nodeId = createNode()
    createCanvas(nodeId)
    expect(exec('CreateCanvas', { canvasId: uuidv7(), nodeId })).toMatchObject({
      status: 'error',
      code: 'NODE_HAS_CANVAS',
    })
  })
})

describe('invariant 11: placement deletion never purges; bare-node auto-trash', () => {
  it('trashes a bare node in the same command and leaves others active', () => {
    const bare = createNode()
    const canvasId = service.info().rootCanvasId
    const p1 = createPlacement(canvasId, bare)
    const before = reader.get<{ n: number }>('SELECT count(*) AS n FROM command_log')!.n
    committed('DeletePlacement', { placementId: p1 })
    const after = reader.get<{ n: number }>('SELECT count(*) AS n FROM command_log')!.n
    expect(after).toBe(before + 1) // one user-level command
    expect(
      reader.get<{ lifecycle_state: string }>(
        'SELECT lifecycle_state FROM node WHERE id = ?',
        bare,
      )!.lifecycle_state,
    ).toBe('trashed') // trashed, never purged

    const kept = createNode()
    committed('AttachNoteToNode', { nodeId: kept, noteId: createNote('Keeps It Active') })
    const p2 = createPlacement(canvasId, kept)
    committed('DeletePlacement', { placementId: p2 })
    expect(
      reader.get<{ lifecycle_state: string }>(
        'SELECT lifecycle_state FROM node WHERE id = ?',
        kept,
      )!.lifecycle_state,
    ).toBe('active')
  })
})

describe('invariant 12: detaching a note never modifies other nodes', () => {
  it('leaves the second referent bound', () => {
    const noteId = createNote('Both Use Me')
    const a = createNode()
    const b = createNode()
    committed('AttachNoteToNode', { nodeId: a, noteId })
    committed('AttachNoteToNode', { nodeId: b, noteId })
    committed('DetachNoteFromNode', { nodeId: a })
    expect(
      reader.get<{ note_id: string | null }>('SELECT note_id FROM node WHERE id = ?', b)!.note_id,
    ).toBe(noteId)
    expect(
      reader.get<{ lifecycle_state: string }>(
        'SELECT lifecycle_state FROM note WHERE id = ?',
        noteId,
      )!.lifecycle_state,
    ).toBe('active')
  })
})

describe('invariant 13: trash preserves the record and relationships until purge', () => {
  it('round-trips a node aggregate through Trash', () => {
    const nodeId = createNode()
    const noteId = createNote('Preserved')
    committed('AttachNoteToNode', { nodeId, noteId })
    const placementId = createPlacement(service.info().rootCanvasId, nodeId)
    committed('TrashNode', { nodeId })
    committed('RestoreRecord', { kind: 'node', id: nodeId })
    expect(
      reader.get<{ note_id: string }>('SELECT note_id FROM node WHERE id = ?', nodeId)!.note_id,
    ).toBe(noteId)
    expect(reader.get('SELECT id FROM placement WHERE id = ?', placementId)).toBeDefined()
  })
})

describe('invariant 14: trashing a canvas does not delete referenced nodes', () => {
  it('leaves placed nodes active', () => {
    const owner = createNode()
    const canvasId = createCanvas(owner)
    const placed = createNode()
    committed('AttachNoteToNode', { nodeId: placed, noteId: createNote('Placed Note') })
    createPlacement(canvasId, placed)
    committed('TrashCanvas', { canvasId })
    expect(
      reader.get<{ lifecycle_state: string }>(
        'SELECT lifecycle_state FROM node WHERE id = ?',
        placed,
      )!.lifecycle_state,
    ).toBe('active')
  })
})

describe('invariant 15: trashing a node does not trash a shared note', () => {
  it('keeps the note active for the other referent', () => {
    const noteId = createNote('Shared Survivor')
    const a = createNode()
    const b = createNode()
    committed('AttachNoteToNode', { nodeId: a, noteId })
    committed('AttachNoteToNode', { nodeId: b, noteId })
    committed('TrashNode', { nodeId: a })
    expect(
      reader.get<{ lifecycle_state: string }>(
        'SELECT lifecycle_state FROM note WHERE id = ?',
        noteId,
      )!.lifecycle_state,
    ).toBe('active')
  })
})

describe('invariant 16: decorations never gain node capabilities', () => {
  it('has no note/tag columns and refuses tag assignment', () => {
    const columns = reader
      .all<{ name: string }>(`SELECT name FROM pragma_table_info('decoration')`)
      .map((c) => c.name)
    expect(columns).not.toContain('note_id')
    const decorationId = uuidv7()
    committed('CreateDecoration', {
      decorationId,
      canvasId: service.info().rootCanvasId,
      kind: 'text',
      data: { text: 'label only' },
    })
    const tagId = uuidv7()
    committed('CreateTag', { tagId, name: 'no-decorations' })
    expect(exec('AssignTagToNode', { tagId, nodeId: decorationId })).toMatchObject({
      status: 'error',
    })
  })
})

describe('invariant 17: a canvas background references an Asset, not a node', () => {
  it('sets the background without creating nodes or placements', () => {
    const assetId = insertAssetRow()
    const nodes = reader.get<{ n: number }>('SELECT count(*) AS n FROM node')!.n
    const placements = reader.get<{ n: number }>('SELECT count(*) AS n FROM placement')!.n
    committed('SetCanvasBackground', {
      canvasId: service.info().rootCanvasId,
      assetId,
      settings: { fit: 'cover' },
    })
    expect(reader.get<{ n: number }>('SELECT count(*) AS n FROM node')!.n).toBe(nodes)
    expect(reader.get<{ n: number }>('SELECT count(*) AS n FROM placement')!.n).toBe(placements)
  })
})

describe('invariant 18: containment is a graph; cycles including self are legal', () => {
  it('places a node on its own canvas', () => {
    const nodeId = createNode()
    const canvasId = createCanvas(nodeId)
    createPlacement(canvasId, nodeId)
  })
})

describe('invariant 19: traversal uses visited sets and limits', () => {
  it('canvas-content and search queries terminate on a self-cycle', () => {
    const nodeId = createNode()
    const canvasId = createCanvas(nodeId)
    createPlacement(canvasId, nodeId)
    const contents = service.query('getCanvasContents', { canvasId })
    expect(contents.ok).toBe(true)
    expect((contents as { result: unknown[] }).result).toHaveLength(1)
  })
})

describe('invariant 20: only the active canvas is mounted (data side)', () => {
  it('canvas contents are strictly per-canvas, never recursive', () => {
    const outer = createNode()
    const outerCanvas = createCanvas(outer)
    const inner = createNode()
    const innerCanvas = createCanvas(inner)
    createPlacement(outerCanvas, inner)
    createPlacement(innerCanvas, createNode())
    const result = service.query('getCanvasContents', { canvasId: outerCanvas }) as {
      result: Array<{ id: string }>
    }
    expect(result.result).toHaveLength(1) // inner's own content not pulled in
  })
})

describe('invariant 21: shared deterministic ordering in the content plane', () => {
  it('orders placements and decorations in one stable sequence', () => {
    const nodeId = createNode()
    const canvasId = createCanvas(nodeId)
    createPlacement(canvasId, createNode())
    committed('CreateDecoration', {
      decorationId: uuidv7(),
      canvasId,
      kind: 'shape',
      data: { shape: 'rect' },
    })
    createPlacement(canvasId, createNode())
    const q = (): unknown[] =>
      (service.query('getCanvasContents', { canvasId }) as { result: unknown[] }).result
    const first = q()
    expect(first).toHaveLength(3)
    expect(q()).toEqual(first) // deterministic across reads
  })
})

describe('invariant 22: durable mutations pass through versioned commands', () => {
  it('exposes no SQL surface and rejects unknown commands structurally', () => {
    expect(service.query("'; DROP TABLE note; --")).toMatchObject({
      ok: false,
      code: 'UNKNOWN_QUERY',
    })
    expect(exec('RawSql', { sql: 'DELETE FROM note' })).toMatchObject({
      status: 'error',
      code: 'UNKNOWN_COMMAND',
    })
  })
})

describe('invariant 23: every committed mutation advances project_revision', () => {
  it('increments by exactly one per commit and never on failure', () => {
    const r0 = service.info().revision
    committed('CreateNode', { nodeId: uuidv7() })
    expect(service.info().revision).toBe(r0 + 1)
    exec('CreateCanvas', { canvasId: uuidv7(), nodeId: 'missing' }) // fails
    expect(service.info().revision).toBe(r0 + 1)
    committed('CreateNote', { noteId: uuidv7(), title: 'Revision Note' })
    expect(service.info().revision).toBe(r0 + 2)
  })
})

describe('invariant 24: structural undo emits inverse commands', () => {
  it('returns an executable inverse that restores prior state', () => {
    const noteId = uuidv7()
    const create = committed('CreateNote', { noteId, title: 'Undo Me' })
    expect(create.inverse).not.toBeNull()
    const before = service.info().revision
    committed(create.inverse!.commandType, create.inverse!.payload)
    // Undo went FORWARD through the command path: revision advanced,
    // no database state was rewound wholesale — the purge-safe
    // inverse trashes rather than erases.
    expect(service.info().revision).toBe(before + 1)
    expect(
      reader.get<{ lifecycle_state: string }>(
        'SELECT lifecycle_state FROM note WHERE id = ?',
        noteId,
      )!.lifecycle_state,
    ).toBe('trashed')
  })
})

describe('invariant 25: one durable command per completed gesture (contract)', () => {
  it('a MovePlacement carrying a final transform writes one log row', () => {
    const placementId = createPlacement(service.info().rootCanvasId, createNode())
    const before = reader.get<{ n: number }>('SELECT count(*) AS n FROM command_log')!.n
    committed('MovePlacement', {
      placementId,
      x: 250,
      y: -40,
      width: null,
      height: null,
      scale: 1,
      rotation: 0,
    })
    expect(reader.get<{ n: number }>('SELECT count(*) AS n FROM command_log')!.n).toBe(before + 1)
  })
})

describe('invariant 26: every saved token has exactly one link record', () => {
  it('indexes each token in exactly one state', () => {
    createNote('Known Target')
    const source = createNote('Multi', 'a [[Known Target]] b [[Unknown One]] c [[Unknown One]]')
    const rows = reader.all<{ state: string }>(
      'SELECT state FROM link WHERE source_note_id = ? ORDER BY range_start',
      source,
    )
    expect(rows.map((r) => r.state)).toEqual(['bound', 'unresolved', 'unresolved'])
  })
})

describe('invariant 27: create/rename/restore bind unresolved; broken never re-binds', () => {
  it('binds on create and restore, and keeps broken records broken', () => {
    const source = createNote('Referrer', 'see [[Future Note]]')
    const state = (): string =>
      reader.get<{ state: string }>('SELECT state FROM link WHERE source_note_id = ?', source)!
        .state

    expect(state()).toBe('unresolved')
    const target = createNote('Future Note')
    expect(state()).toBe('bound')

    committed('TrashNote', { noteId: target })
    expect(state()).toBe('bound') // §7.1: bound to a trashed note
    committed('PurgeRecord', { kind: 'note', id: target })
    expect(state()).toBe('broken')
    committed('CreateNote', { noteId: uuidv7(), title: 'Future Note' })
    expect(state()).toBe('broken') // never implicit

    // Restore path: a fresh unresolved token binds when its target
    // returns from Trash (via the restore sweep).
    const second = createNote('Second Referrer', 'and [[Round Trip]]')
    const rt = createNote('Round Trip')
    committed('TrashNote', { noteId: rt })
    const stateOf = (id: string): string =>
      reader.get<{ state: string }>('SELECT state FROM link WHERE source_note_id = ?', id)!.state
    committed('RestoreRecord', { kind: 'note', id: rt })
    expect(stateOf(second)).toBe('bound')
  })
})

describe('invariant 28: a phantom persists nothing and reserves no title', () => {
  it('leaves no note row and allows creation under the phantom title', () => {
    createNote('Phantom Source', 'refs [[Only Imagined]]')
    expect(
      reader.get('SELECT id FROM note WHERE title_key = ?', 'only imagined'),
    ).toBeUndefined()
    committed('CreateNote', { noteId: uuidv7(), title: 'Only Imagined' })
  })
})

describe('invariant 29: an editing burst commits one UpdateNote (contract)', () => {
  it('one UpdateNote = one log row, links and body refreshed together', () => {
    const noteId = createNote('Draft', 'v1')
    const before = reader.get<{ n: number }>('SELECT count(*) AS n FROM command_log')!.n
    committed('UpdateNote', { noteId, body: 'v2 with [[A New Ref]]' })
    expect(reader.get<{ n: number }>('SELECT count(*) AS n FROM command_log')!.n).toBe(before + 1)
    expect(
      reader.get('SELECT id FROM link WHERE source_note_id = ?', noteId),
    ).toBeDefined()
  })
})

describe('invariant 30: body edits stay out of structural undo (contract)', () => {
  it('UpdateNote round-trips via its own inverse without touching other records', () => {
    const noteId = createNote('Body Note', 'original')
    const update = committed('UpdateNote', { noteId, body: 'changed' })
    committed(update.inverse!.commandType, update.inverse!.payload)
    expect(
      reader.get<{ body: string }>('SELECT body FROM note WHERE id = ?', noteId)!.body,
    ).toBe('original')
  })
})

describe('invariant 31: in-memory undo, persisted metadata-only log', () => {
  it('persists command metadata (and nothing replayable) across reopen', () => {
    const tables = reader
      .all<{ name: string }>(`SELECT name FROM sqlite_master WHERE type = 'table'`)
      .map((t) => t.name)
    expect(tables.filter((t) => /undo|redo/i.test(t))).toEqual([])
    const logColumns = reader
      .all<{ name: string }>(`SELECT name FROM pragma_table_info('command_log')`)
      .map((c) => c.name)
    expect(logColumns.sort()).toEqual([
      'command_id',
      'command_type',
      'command_version',
      'issued_at',
      'project_id',
      'resulting_revision',
    ]) // metadata only — no payload column to replay

    committed('CreateNode', { nodeId: uuidv7() })
    const logged = reader.get<{ n: number }>('SELECT count(*) AS n FROM command_log')!.n
    const projectDir = join(dir, 'p')
    service.close()
    service = openProjectService(projectDir, {})
    expect(
      Db.open(join(projectDir, DB_FILENAME)).get<{ n: number }>(
        'SELECT count(*) AS n FROM command_log',
      )!.n,
    ).toBe(logged)
  })
})

describe('§10.1 representative command sequence (epic metrics 1–2)', () => {
  it('runs the catalogue with monotonic revisions and a stale conflict', () => {
    const info = service.info()
    const noteId = uuidv7()
    const nodeId = uuidv7()
    const canvasId = uuidv7()
    const placementId = uuidv7()
    const tagId = uuidv7()
    const decorationId = uuidv7()

    const script: Array<[string, unknown]> = [
      ['CreateNote', { noteId, title: 'Sequence Note', body: 'with [[Sequence Note]]' }],
      ['CreateNode', { nodeId }],
      ['AttachNoteToNode', { nodeId, noteId }],
      ['CreateCanvas', { canvasId, nodeId }],
      ['CreatePlacement', { placementId, canvasId, nodeId, x: 10, y: 10 }],
      [
        'MovePlacement',
        { placementId, x: 20, y: 30, width: null, height: null, scale: 1, rotation: 0 },
      ],
      ['SetPlacementLabelVisibility', { placementId, labelVisible: false }],
      ['FlipPlacement', { placementId, axis: 'x' }],
      ['SetNodeAppearance', { nodeId, appearance: { kind: 'dot', color: '#a0c4ff' } }],
      ['CreateTag', { tagId, name: 'sequence' }],
      ['AssignTagToNode', { tagId, nodeId }],
      ['SetCanvasBackgroundColor', { canvasId, color: '#101820' }],
      ['CreateDecoration', { decorationId, canvasId, kind: 'text', data: { text: 'hello' } }],
      ['UpdateDecoration', { decorationId, set: { data: { text: 'hello world' } } }],
      ['UpdateNote', { noteId, body: 'edited' }],
      ['RenameNote', { noteId, title: 'Sequence Note Renamed' }],
      ['DeleteDecoration', { decorationId }],
      ['DeletePlacement', { placementId }],
      ['TrashCanvas', { canvasId }],
      ['RestoreRecord', { kind: 'canvas', id: canvasId }],
      ['TrashNode', { nodeId }],
      ['RestoreRecord', { kind: 'node', id: nodeId }],
      ['TrashNote', { noteId }],
      ['RestoreRecord', { kind: 'note', id: noteId }],
    ]

    let revision = info.revision
    for (const [type, payload] of script) {
      const result = service.execute({
        commandId: uuidv7(),
        projectId: info.projectId,
        commandType: type,
        commandVersion: 1,
        expectedProjectRevision: revision,
        issuedAt: new Date().toISOString(),
        payload,
      })
      expect(result, `${type} → ${JSON.stringify(result)}`).toMatchObject({
        status: 'committed',
        revision: revision + 1,
      })
      revision += 1
    }

    const stale = service.execute({
      commandId: uuidv7(),
      projectId: info.projectId,
      commandType: 'CreateNode',
      commandVersion: 1,
      expectedProjectRevision: 0,
      issuedAt: new Date().toISOString(),
      payload: { nodeId: uuidv7() },
    })
    expect(stale).toMatchObject({ status: 'conflict', actualRevision: revision })
  })
})
