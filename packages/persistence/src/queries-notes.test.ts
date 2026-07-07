import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { uuidv7 } from '@ew/domain'
import { CommandRegistry, type CommandEnvelope } from '@ew/commands'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Dispatcher, type CommandContext } from './dispatcher'
import { registerCanvasHandlers } from './handlers/canvases'
import { registerLifecycleHandlers } from './handlers/lifecycle'
import { registerNodeHandlers } from './handlers/nodes'
import { registerNoteHandlers } from './handlers/notes'
import { registerPlacementHandlers } from './handlers/placements'
import { createProject, type ProjectHandle } from './project'
import { QueryRegistry } from './queries'
import {
  registerNoteQueries,
  type NoteLinkRecord,
  type NoteUses,
  type PhantomView,
  type TitleSuggestion,
} from './queries-notes'

let dir: string
let handle: ProjectHandle
let dispatcher: Dispatcher
let queries: QueryRegistry

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'ew-notequeries-'))
  handle = createProject(dir, 'Note Queries Test')
  const registry = new CommandRegistry<CommandContext>()
  registerNoteHandlers(registry)
  registerNodeHandlers(registry)
  registerCanvasHandlers(registry)
  registerPlacementHandlers(registry)
  registerLifecycleHandlers(registry)
  dispatcher = new Dispatcher(handle, registry)
  queries = new QueryRegistry()
  registerNoteQueries(queries)
})

afterEach(() => {
  handle.close()
  rmSync(dir, { recursive: true, force: true })
})

function createNote(title: string, body = ''): string {
  const noteId = uuidv7()
  const result = dispatcher.execute({
    commandId: uuidv7(),
    projectId: handle.projectId,
    commandType: 'CreateNote',
    commandVersion: 1,
    issuedAt: new Date().toISOString(),
    payload: { noteId, title, body },
  } satisfies CommandEnvelope)
  expect(result.status).toBe('committed')
  return noteId
}

function trash(noteId: string): void {
  handle.db.run("UPDATE note SET lifecycle_state = 'trashed' WHERE id = ?", noteId)
}

function run<T>(name: string, args?: unknown): T {
  const result = queries.run(
    {
      db: handle.db,
      projectId: handle.projectId,
      rootNodeId: handle.rootNodeId,
      rootCanvasId: handle.rootCanvasId,
    },
    name,
    args,
  )
  expect(result).toMatchObject({ ok: true })
  return (result as { result: T }).result
}

describe('getNote / listNotes', () => {
  it('getNote returns the camelCase record or null', () => {
    const noteId = createNote('Ghost Ship', 'a hull')
    expect(run('getNote', { noteId })).toMatchObject({
      id: noteId,
      title: 'Ghost Ship',
      titleKey: 'ghost ship',
      body: 'a hull',
      lifecycleState: 'active',
    })
    expect(run('getNote', { noteId: 'missing' })).toBeNull()
  })

  it('listNotes returns active notes ordered by title_key', () => {
    createNote('zebra')
    createNote('Anchor')
    const gone = createNote('Middle')
    trash(gone)

    const notes = run<Array<{ title: string }>>('listNotes')
    expect(notes.map((n) => n.title)).toEqual(['Anchor', 'zebra'])
  })
})

describe('suggestTitles (§7.2)', () => {
  it('returns active titles, phantom titles with counts, and trashed titles flagged', () => {
    createNote('Ghost Ship')
    const wreck = createNote('Ghostly Wreck')
    trash(wreck)
    createNote('A', 'see [[Ghost Fleet]]')
    createNote('B', 'also [[ghost fleet|them]] and [[Kraken]]')

    const suggestions = run<TitleSuggestion[]>('suggestTitles', { query: 'GHOST' })
    expect(suggestions).toHaveLength(3)

    expect(suggestions).toContainEqual({
      title: 'Ghost Ship',
      titleKey: 'ghost ship',
      noteId: expect.any(String),
      phantom: false,
      inTrash: false,
      referenceCount: null,
    })
    expect(suggestions).toContainEqual({
      title: 'Ghostly Wreck',
      titleKey: 'ghostly wreck',
      noteId: wreck,
      phantom: false,
      inTrash: true,
      referenceCount: null,
    })
    // Phantom spelling comes from the earliest unresolved record.
    expect(suggestions).toContainEqual({
      title: 'Ghost Fleet',
      titleKey: 'ghost fleet',
      noteId: null,
      phantom: true,
      inTrash: false,
      referenceCount: 2,
    })
  })

  it('ignores unresolved links whose source note is in Trash (AI-IMP-085)', () => {
    const a = createNote('A', 'see [[Ghost Fleet]]')
    const b = createNote('B', 'also [[Ghost Fleet]]')
    trash(a)

    const partial = run<TitleSuggestion[]>('suggestTitles', { query: 'ghost fleet' })
    expect(partial).toHaveLength(1)
    expect(partial[0]).toMatchObject({ phantom: true, referenceCount: 1 })

    // Every source trashed: the phantom vanishes entirely.
    trash(b)
    expect(run<TitleSuggestion[]>('suggestTitles', { query: 'ghost fleet' })).toHaveLength(0)
  })

  it('matches by title_key substring, normalizing the query', () => {
    createNote('Ghost Ship')
    expect(run<TitleSuggestion[]>('suggestTitles', { query: '  ST   SH ' })).toHaveLength(1)
    expect(run<TitleSuggestion[]>('suggestTitles', { query: 'kraken' })).toHaveLength(0)
  })

  it('treats LIKE wildcards in the query literally', () => {
    createNote('Ghost Ship')
    createNote('100% Proof')
    const percent = run<TitleSuggestion[]>('suggestTitles', { query: '%' })
    expect(percent.map((s) => s.title)).toEqual(['100% Proof'])
    expect(run<TitleSuggestion[]>('suggestTitles', { query: '_' })).toHaveLength(0)
  })
})

describe('getPhantom (§7.2, invariant 28)', () => {
  it('groups references by source note and derives the would-be title', () => {
    const a = createNote('A', 'one [[Ghost Fleet]] and two [[Ghost Fleet|them]]')
    const b = createNote('B', 'three [[ghost FLEET]]')

    const phantom = run<PhantomView>('getPhantom', { titleKey: 'ghost fleet' })
    expect(phantom).toMatchObject({
      titleKey: 'ghost fleet',
      title: 'Ghost Fleet',
      referenceCount: 3,
    })
    expect(phantom.sources).toHaveLength(2)
    const sourceA = phantom.sources.find((s) => s.noteId === a)!
    expect(sourceA.noteTitle).toBe('A')
    expect(sourceA.references).toHaveLength(2)
    const sourceB = phantom.sources.find((s) => s.noteId === b)!
    expect(sourceB.references[0].displayText).toBe('ghost FLEET')

    // Ranges point back at the tokens in the source bodies.
    const bodyA = 'one [[Ghost Fleet]] and two [[Ghost Fleet|them]]'
    const ref = sourceA.references[0]
    expect(bodyA.slice(ref.rangeStart, ref.rangeEnd)).toBe('[[Ghost Fleet]]')
  })

  it('drops sources in Trash, and returns null when only trashed sources remain (AI-IMP-085)', () => {
    const a = createNote('A', 'see [[Ghost Fleet]]')
    createNote('B', 'also [[Ghost Fleet]]')
    trash(a)

    const phantom = run<PhantomView>('getPhantom', { titleKey: 'ghost fleet' })
    expect(phantom).not.toBeNull()
    expect(phantom.sources).toHaveLength(1)
    expect(phantom.referenceCount).toBe(1)

    trash(phantom.sources[0]!.noteId)
    expect(run<PhantomView>('getPhantom', { titleKey: 'ghost fleet' })).toBeNull()
  })

  it('normalizes the requested key and returns null when no phantom exists', () => {
    createNote('A', 'see [[Ghost Fleet]]')
    expect(run<PhantomView>('getPhantom', { titleKey: ' Ghost  FLEET ' })).not.toBeNull()
    expect(run<PhantomView | null>('getPhantom', { titleKey: 'kraken' })).toBeNull()
  })

  it('is a projection only: no note row exists for a phantom (invariant 28)', () => {
    createNote('A', 'see [[Ghost Fleet]]')
    expect(run<PhantomView>('getPhantom', { titleKey: 'ghost fleet' })).not.toBeNull()
    expect(
      handle.db.get('SELECT id FROM note WHERE title_key = ?', 'ghost fleet'),
    ).toBeUndefined()
    // No reservation either: the title is still creatable.
    expect(createNote('Ghost Fleet')).toBeDefined()
    expect(run<PhantomView | null>('getPhantom', { titleKey: 'ghost fleet' })).toBeNull()
  })
})

describe('listNoteTitles (AI-IMP-045)', () => {
  it('returns active and trashed titles with lifecycle, ordered by key', () => {
    createNote('zebra')
    const gone = createNote('Anchor')
    trash(gone)

    const titles = run<Array<{ title: string; lifecycleState: string }>>('listNoteTitles')
    expect(titles).toEqual([
      expect.objectContaining({ title: 'Anchor', titleKey: 'anchor', lifecycleState: 'trashed' }),
      expect.objectContaining({ title: 'zebra', titleKey: 'zebra', lifecycleState: 'active' }),
    ])
  })
})

describe('suggestTitles latency (NFR, AI-IMP-045)', () => {
  it('answers in under 50 ms with 10k notes', () => {
    const insert = handle.db.prepare(
      `INSERT INTO note (id, project_id, title, title_key, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    const now = new Date().toISOString()
    handle.db.transaction(() => {
      for (let i = 0; i < 10_000; i++) {
        insert.run(uuidv7(), handle.projectId, `Note ${i}`, `note ${i}`, now, now)
      }
    })

    const started = performance.now()
    const suggestions = run<TitleSuggestion[]>('suggestTitles', { query: 'note 42' })
    const elapsed = performance.now() - started
    expect(suggestions.length).toBeGreaterThan(0)
    expect(elapsed).toBeLessThan(50)
  })
})

describe('getNoteLinks (§7.1, AI-IMP-044)', () => {
  it('returns outbound records in range order with target lifecycle', () => {
    const target = createNote('Harbor')
    const trashedTarget = createNote('Reef')
    trash(trashedTarget)
    const source = createNote('Log', 'see [[Missing]] then [[Harbor]] and [[Reef]]')

    const links = run<NoteLinkRecord[]>('getNoteLinks', { noteId: source })
    expect(links).toHaveLength(3)
    expect(links.map((l) => l.state)).toEqual(['unresolved', 'bound', 'bound'])
    expect(links[1]).toMatchObject({ targetNoteId: target, targetLifecycleState: 'active' })
    expect(links[2]).toMatchObject({
      targetNoteId: trashedTarget,
      targetLifecycleState: 'trashed',
    })
    expect(links[0]).toMatchObject({
      targetNoteId: null,
      targetTitleKey: 'missing',
      displayText: 'Missing',
      targetLifecycleState: null,
    })
  })

  it('surfaces broken records as stored — never re-derived from titles', () => {
    const target = createNote('Harbor')
    const source = createNote('Log', 'see [[Harbor]]')
    handle.db.run(
      `UPDATE link SET state = 'broken', target_note_id = NULL, display_text = 'Harbor'
       WHERE source_note_id = ? AND target_note_id = ?`,
      source,
      target,
    )
    const links = run<NoteLinkRecord[]>('getNoteLinks', { noteId: source })
    expect(links).toHaveLength(1)
    expect(links[0]).toMatchObject({ state: 'broken', displayText: 'Harbor', targetNoteId: null })
  })
})

describe('getNoteUses (§7.3/§7.4, AI-IMP-044)', () => {
  function insertNode(noteId: string | null): string {
    const nodeId = uuidv7()
    const now = new Date().toISOString()
    handle.db.run(
      `INSERT INTO node (id, project_id, note_id, appearance_kind, appearance_color,
                         created_at, updated_at)
       VALUES (?, ?, ?, 'dot', '#fff', ?, ?)`,
      nodeId,
      handle.projectId,
      noteId,
      now,
      now,
    )
    return nodeId
  }

  function insertPlacement(nodeId: string, canvasId: string, x: number, y: number): string {
    const placementId = uuidv7()
    const now = new Date().toISOString()
    handle.db.run(
      `INSERT INTO placement (id, project_id, canvas_id, node_id, x, y, render_order,
                              created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      placementId,
      handle.projectId,
      canvasId,
      nodeId,
      x,
      y,
      now,
      now,
    )
    return placementId
  }

  function insertCanvas(nodeId: string): string {
    const canvasId = uuidv7()
    const now = new Date().toISOString()
    handle.db.run(
      `INSERT INTO canvas (id, project_id, node_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
      canvasId,
      handle.projectId,
      nodeId,
      now,
      now,
    )
    return canvasId
  }

  it('groups placements canvas → node and lists unplaced nodes', () => {
    const noteId = createNote('Kestrel')
    const placed = insertNode(noteId)
    const unplaced = insertNode(noteId)
    insertPlacement(placed, handle.rootCanvasId, 10, 20)
    insertPlacement(placed, handle.rootCanvasId, 30, 40)

    const uses = run<NoteUses>('getNoteUses', { noteId })
    expect(uses.totalPlacements).toBe(2)
    expect(uses.canvases).toHaveLength(1)
    expect(uses.canvases[0]).toMatchObject({ canvasId: handle.rootCanvasId, isRoot: true })
    expect(uses.canvases[0].nodes).toHaveLength(1)
    expect(uses.canvases[0].nodes[0]).toMatchObject({ nodeId: placed, appearanceKind: 'dot' })
    expect(uses.canvases[0].nodes[0].placements).toHaveLength(2)
    expect(uses.unplaced.map((n) => n.nodeId)).toEqual([unplaced])
  })

  it('splits one node across canvases with local placements and titles the group', () => {
    const canvasNote = createNote('Ship Deck')
    const canvasOwner = insertNode(canvasNote)
    const nestedCanvas = insertCanvas(canvasOwner)

    const noteId = createNote('Kestrel')
    const nodeId = insertNode(noteId)
    insertPlacement(nodeId, handle.rootCanvasId, 0, 0)
    insertPlacement(nodeId, nestedCanvas, 5, 5)

    const uses = run<NoteUses>('getNoteUses', { noteId })
    expect(uses.canvases).toHaveLength(2)
    const nested = uses.canvases.find((c) => c.canvasId === nestedCanvas)!
    expect(nested).toMatchObject({ canvasTitle: 'Ship Deck', isRoot: false })
    expect(nested.nodes[0].placements).toHaveLength(1)
    const root = uses.canvases.find((c) => c.canvasId === handle.rootCanvasId)!
    expect(root.nodes[0].placements).toHaveLength(1)
    expect(uses.unplaced).toHaveLength(0)
  })

  it('excludes trashed nodes, placements, and canvases', () => {
    const noteId = createNote('Kestrel')
    const nodeId = insertNode(noteId)
    const placementId = insertPlacement(nodeId, handle.rootCanvasId, 0, 0)

    handle.db.run("UPDATE placement SET lifecycle_state = 'trashed' WHERE id = ?", placementId)
    let uses = run<NoteUses>('getNoteUses', { noteId })
    expect(uses.totalPlacements).toBe(0)
    expect(uses.unplaced.map((n) => n.nodeId)).toEqual([nodeId])

    handle.db.run("UPDATE node SET lifecycle_state = 'trashed' WHERE id = ?", nodeId)
    uses = run<NoteUses>('getNoteUses', { noteId })
    expect(uses.unplaced).toHaveLength(0)
  })
})

describe('listNotes nodeCount', () => {
  it('counts active referencing nodes so zero-node views filter server-side', () => {
    const noteId = createNote('Unplaced Study')
    let notes = run<Array<{ id: string; nodeCount: number }>>('listNotes')
    expect(notes.find((n) => n.id === noteId)!.nodeCount).toBe(0)

    const nodeId = uuidv7()
    const now = new Date().toISOString()
    handle.db.run(
      `INSERT INTO node (id, project_id, note_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
      nodeId,
      handle.projectId,
      noteId,
      now,
      now,
    )
    notes = run<Array<{ id: string; nodeCount: number }>>('listNotes')
    expect(notes.find((n) => n.id === noteId)!.nodeCount).toBe(1)

    // A trashed node no longer counts (§6.10: the note is placeable again).
    handle.db.run("UPDATE node SET lifecycle_state = 'trashed' WHERE id = ?", nodeId)
    notes = run<Array<{ id: string; nodeCount: number }>>('listNotes')
    expect(notes.find((n) => n.id === noteId)!.nodeCount).toBe(0)
  })
})

// §7.4 / §9.6 (AI-IMP-163): a placement onto a board whose OWNER node
// is trashed is ABSENT from the note's uses — activation can no longer
// reach it (the node row flips alone; the canvas row stays 'active').
// The carrier moves to Unplaced, and RestoreRecord restores the board
// group. Seeded through real commands only.
describe('getNoteUses hides owner-trashed board placements (§7.4/§9.6, AI-IMP-163)', () => {
  function commit(commandType: string, payload: unknown): void {
    const result = dispatcher.execute({
      commandId: uuidv7(),
      projectId: handle.projectId,
      commandType,
      commandVersion: 1,
      issuedAt: new Date().toISOString(),
      payload,
    } satisfies CommandEnvelope)
    expect(result.status).toBe('committed')
  }

  it('an owner-trashed board removes the placement; the carrier reads unplaced; restore reverses it', () => {
    const noteId = createNote('Kestrel')
    const content = uuidv7()
    commit('CreateNode', { nodeId: content })
    commit('AttachNoteToNode', { nodeId: content, noteId })

    const owner = uuidv7()
    commit('CreateNode', { nodeId: owner })
    const boardCanvas = uuidv7()
    commit('CreateCanvas', { canvasId: boardCanvas, nodeId: owner })
    commit('CreatePlacement', { placementId: uuidv7(), canvasId: boardCanvas, nodeId: content })

    let uses = run<NoteUses>('getNoteUses', { noteId })
    expect(uses.canvases.map((c) => c.canvasId)).toEqual([boardCanvas])
    expect(uses.totalPlacements).toBe(1)
    expect(uses.unplaced).toHaveLength(0)

    commit('TrashNode', { nodeId: owner })
    uses = run<NoteUses>('getNoteUses', { noteId })
    expect(uses.canvases).toHaveLength(0)
    expect(uses.totalPlacements).toBe(0)
    expect(uses.unplaced.map((n) => n.nodeId)).toEqual([content])

    commit('RestoreRecord', { kind: 'node', id: owner })
    uses = run<NoteUses>('getNoteUses', { noteId })
    expect(uses.canvases.map((c) => c.canvasId)).toEqual([boardCanvas])
    expect(uses.totalPlacements).toBe(1)
    expect(uses.unplaced).toHaveLength(0)
  })
})
