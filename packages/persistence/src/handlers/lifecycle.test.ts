import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { uuidv7 } from '@ew/domain'
import { CommandRegistry, type CommandResult, type CommittedResult, type InverseCommand } from '@ew/commands'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Dispatcher, type CommandContext } from '../dispatcher'
import { computeGcEligibleBlobs } from '../gc'
import { createProject, type ProjectHandle } from '../project'
import { QueryRegistry } from '../queries'
import { registerNoteQueries } from '../queries-notes'
import { registerStructureQueries, type CanvasContentItem } from '../queries-structure'
import { registerCanvasHandlers } from './canvases'
import { registerDecorationHandlers } from './decorations'
import { registerLifecycleHandlers } from './lifecycle'
import { registerNodeHandlers } from './nodes'
import { registerNoteHandlers } from './notes'
import { registerPlacementHandlers } from './placements'
import { registerTagHandlers } from './tags'

let dir: string
let handle: ProjectHandle
let dispatcher: Dispatcher
let queries: QueryRegistry
let queryCtx: Omit<CommandContext, 'now'>

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'ew-lifecycle-'))
  handle = createProject(dir, 'Lifecycle Test')
  const registry = new CommandRegistry<CommandContext>()
  registerNodeHandlers(registry)
  registerNoteHandlers(registry)
  registerCanvasHandlers(registry)
  registerPlacementHandlers(registry)
  registerTagHandlers(registry)
  registerDecorationHandlers(registry)
  registerLifecycleHandlers(registry)
  dispatcher = new Dispatcher(handle, registry)
  queries = new QueryRegistry()
  registerNoteQueries(queries)
  registerStructureQueries(queries)
  queryCtx = {
    db: handle.db,
    projectId: handle.projectId,
    rootNodeId: handle.rootNodeId,
    rootCanvasId: handle.rootCanvasId,
  }
})

afterEach(() => {
  handle.close()
  rmSync(dir, { recursive: true, force: true })
})

function exec(commandType: string, payload: unknown, commandId = uuidv7()): CommandResult {
  return dispatcher.execute({
    commandId,
    projectId: handle.projectId,
    commandType,
    commandVersion: 1,
    issuedAt: new Date().toISOString(),
    payload,
  })
}

function committed(commandType: string, payload: unknown, commandId = uuidv7()): CommittedResult {
  const result = exec(commandType, payload, commandId)
  expect(result).toMatchObject({ status: 'committed' })
  return result as CommittedResult
}

function undo(inverse: InverseCommand | null): CommittedResult {
  expect(inverse).not.toBeNull()
  return committed(inverse!.commandType, inverse!.payload)
}

function query<T>(name: string, args?: unknown): T {
  const result = queries.run(queryCtx, name, args)
  expect(result.ok).toBe(true)
  return (result as { result: T }).result
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

function place(canvasId: string, nodeId: string, at: { x?: number; y?: number } = {}): string {
  const placementId = uuidv7()
  committed('CreatePlacement', { placementId, canvasId, nodeId, ...at })
  return placementId
}

function insertAsset(hash = 'hash-a'): string {
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

function row(table: string, id: string): Record<string, unknown> | undefined {
  return handle.db.get<Record<string, unknown>>(`SELECT * FROM ${table} WHERE id = ?`, id)
}

function canvasContents(canvasId: string): CanvasContentItem[] {
  return query<CanvasContentItem[]>('getCanvasContents', { canvasId })
}

function unplacedIds(): string[] {
  return query<Array<{ id: string }>>('listNodeLibrary', { filter: 'unplaced' }).map((n) => n.id)
}

function commandLogCount(): number {
  return handle.db.get<{ n: number }>('SELECT count(*) AS n FROM command_log')!.n
}

describe('DeletePlacement (§9.2, invariant 11)', () => {
  it('keeps a node with a note active and findable in Unplaced', () => {
    const nodeId = createNode()
    const noteId = createNote('Kept')
    committed('AttachNoteToNode', { nodeId, noteId })
    const placementId = place(handle.rootCanvasId, nodeId)

    const del = committed('DeletePlacement', { placementId })
    expect(row('placement', placementId)).toBeUndefined()
    expect(row('node', nodeId)).toMatchObject({ lifecycle_state: 'active' })
    // No node in `affected` = no bare-node trash happened.
    expect(del.affected.some((a) => a.kind === 'node')).toBe(false)
    expect(unplacedIds()).toContain(nodeId)
  })

  it('keeps a node with a second placement active', () => {
    const nodeId = createNode()
    const first = place(handle.rootCanvasId, nodeId)
    place(handle.rootCanvasId, nodeId)

    committed('DeletePlacement', { placementId: first })
    expect(row('node', nodeId)).toMatchObject({ lifecycle_state: 'active' })
    expect(unplacedIds()).not.toContain(nodeId)
  })

  it('trashes a bare node in the same command, flagged via affected, never purged', () => {
    const nodeId = createNode()
    const placementId = place(handle.rootCanvasId, nodeId)
    const logBefore = commandLogCount()

    const commandId = uuidv7()
    const del = committed('DeletePlacement', { placementId }, commandId)
    // One user-level command: one command_log row (§9.2).
    expect(commandLogCount()).toBe(logBefore + 1)
    // Invariant 11: trashed, not purged — the row survives.
    expect(row('node', nodeId)).toMatchObject({
      lifecycle_state: 'trashed',
      trashed_by_command_id: commandId,
    })
    expect(del.affected).toContainEqual({ kind: 'node', id: nodeId })
    expect(unplacedIds()).not.toContain(nodeId)

    // Keep in Project: RestoreRecord returns it active and unplaced.
    committed('RestoreRecord', { kind: 'node', id: nodeId })
    expect(row('node', nodeId)).toMatchObject({
      lifecycle_state: 'active',
      trashed_at: null,
      trashed_by_command_id: null,
    })
    expect(unplacedIds()).toContain(nodeId)
  })

  it('undo restores the placement into its render_order slot and revives the bare node', () => {
    const a = createNode()
    const b = createNode()
    const c = createNode()
    place(handle.rootCanvasId, a)
    const middle = place(handle.rootCanvasId, b)
    place(handle.rootCanvasId, c)
    const orderBefore = canvasContents(handle.rootCanvasId).map((i) => i.id)

    const del = committed('DeletePlacement', { placementId: middle })
    expect(del.inverse).toMatchObject({
      commandType: 'RestorePlacement',
      payload: { placementId: middle, restoreNodeId: b },
    })
    expect(row('node', b)).toMatchObject({ lifecycle_state: 'trashed' })

    const restore = undo(del.inverse)
    expect(canvasContents(handle.rootCanvasId).map((i) => i.id)).toEqual(orderBefore)
    expect(row('node', b)).toMatchObject({ lifecycle_state: 'active' })
    // Redo is DeletePlacement again.
    expect(restore.inverse).toMatchObject({
      commandType: 'DeletePlacement',
      payload: { placementId: middle },
    })
  })

  it('does not bare-trash a node with tags or an owned canvas, and never the root node', () => {
    const tagged = createNode()
    const tagId = uuidv7()
    committed('CreateTag', { tagId, name: 'keep' })
    committed('AssignTagToNode', { tagId, nodeId: tagged })
    committed('DeletePlacement', { placementId: place(handle.rootCanvasId, tagged) })
    expect(row('node', tagged)).toMatchObject({ lifecycle_state: 'active' })

    const owner = createNode()
    committed('CreateCanvas', { canvasId: uuidv7(), nodeId: owner })
    committed('DeletePlacement', { placementId: place(handle.rootCanvasId, owner) })
    expect(row('node', owner)).toMatchObject({ lifecycle_state: 'active' })

    // The root node is otherwise bare in a fresh project except for its
    // canvas — but the guard is explicit, so exercise it directly.
    committed('DeletePlacement', { placementId: place(handle.rootCanvasId, handle.rootNodeId) })
    expect(row('node', handle.rootNodeId)).toMatchObject({ lifecycle_state: 'active' })
  })

  it('releases connector anchors at the last position (§4.9)', () => {
    const nodeId = createNode()
    const noteId = createNote('Anchored')
    committed('AttachNoteToNode', { nodeId, noteId })
    const placementId = place(handle.rootCanvasId, nodeId, { x: 7, y: 9 })
    const decorationId = uuidv7()
    committed('CreateDecoration', {
      decorationId,
      canvasId: handle.rootCanvasId,
      kind: 'connector',
      data: { end: { x: 0, y: 0 } },
      anchorStartPlacementId: placementId,
    })

    const del = committed('DeletePlacement', { placementId })
    const decoration = row('decoration', decorationId)!
    expect(decoration.anchor_start_placement_id).toBeNull()
    expect(JSON.parse(decoration.data as string).start).toEqual({ x: 7, y: 9 })
    expect(del.affected).toContainEqual({ kind: 'decoration', id: decorationId })
  })

  it('refuses unknown placements', () => {
    expect(exec('DeletePlacement', { placementId: uuidv7() })).toMatchObject({
      status: 'error',
      code: 'PLACEMENT_NOT_FOUND',
    })
  })
})

describe('TrashNote (§9.4, invariant 5)', () => {
  it('preserves node attachments, bound link targets, and the title reservation', () => {
    const noteId = createNote('Ghost Ship', 'hull lore')
    const nodeId = createNode()
    committed('AttachNoteToNode', { nodeId, noteId })
    const sourceId = createNote('Log', 'saw [[Ghost Ship]]')
    const linksBefore = handle.db.all('SELECT * FROM link ORDER BY id')

    const commandId = uuidv7()
    const trash = committed('TrashNote', { noteId }, commandId)
    expect(row('note', noteId)).toMatchObject({
      lifecycle_state: 'trashed',
      trashed_by_command_id: commandId,
    })
    // §9.4: attachments and bound target ids untouched.
    expect(row('node', nodeId)).toMatchObject({ note_id: noteId, lifecycle_state: 'active' })
    expect(handle.db.all('SELECT * FROM link ORDER BY id')).toEqual(linksBefore)
    // §7.1: surfaces see a bound link to a trashed note = In Trash state.
    expect(
      handle.db.get(
        `SELECT l.id FROM link l JOIN note t ON t.id = l.target_note_id
         WHERE l.source_note_id = ? AND l.state = 'bound' AND t.lifecycle_state = 'trashed'`,
        sourceId,
      ),
    ).toBeDefined()
    // Invariant 5: the title stays reserved while trashed.
    expect(exec('CreateNote', { noteId: uuidv7(), title: 'ghost SHIP' })).toMatchObject({
      status: 'error',
      code: 'NOTE_TITLE_CONFLICT',
      details: { conflictingLifecycle: 'trashed' },
    })

    // Restore rebinds nothing, because bindings never broke.
    undo(trash.inverse)
    expect(row('note', noteId)).toMatchObject({ lifecycle_state: 'active', trashed_at: null })
    expect(handle.db.all('SELECT * FROM link ORDER BY id')).toEqual(linksBefore)
  })

  it('refuses missing and already-trashed notes', () => {
    expect(exec('TrashNote', { noteId: uuidv7() })).toMatchObject({
      status: 'error',
      code: 'RECORD_NOT_FOUND',
    })
    const noteId = createNote('Once')
    committed('TrashNote', { noteId })
    expect(exec('TrashNote', { noteId })).toMatchObject({
      status: 'error',
      code: 'NOTE_NOT_ACTIVE',
    })
  })

  it('is the inverse of CreateNote (AI-IMP-011 handoff)', () => {
    const create = committed('CreateNote', { noteId: uuidv7(), title: 'Drafted' })
    const trashed = undo(create.inverse)
    const noteId = (create.inverse!.payload as { noteId: string }).noteId
    expect(row('note', noteId)).toMatchObject({ lifecycle_state: 'trashed' })
    // Redo of CreateNote is RestoreRecord.
    undo(trashed.inverse)
    expect(row('note', noteId)).toMatchObject({ lifecycle_state: 'active' })
  })
})

describe('TrashNode (§9.6, invariant 15)', () => {
  function nodeWithAggregate() {
    const nodeId = createNode()
    const noteId = createNote('Shared Person')
    const otherNode = createNode()
    committed('AttachNoteToNode', { nodeId, noteId })
    committed('AttachNoteToNode', { nodeId: otherNode, noteId })
    const tagId = uuidv7()
    committed('CreateTag', { tagId, name: 'hero' })
    committed('AssignTagToNode', { tagId, nodeId })
    const assetId = insertAsset()
    committed('SetNodeAppearance', { nodeId, appearance: { kind: 'image', assetId, crop: null } })
    const canvasId = uuidv7()
    committed('CreateCanvas', { canvasId, nodeId })
    const p1 = place(handle.rootCanvasId, nodeId)
    const p2 = place(handle.rootCanvasId, nodeId)
    return { nodeId, noteId, otherNode, tagId, assetId, canvasId, p1, p2 }
  }

  it('preserves the whole aggregate as rows and hides placements from canvas contents', () => {
    const { nodeId, noteId, otherNode, canvasId, p1, p2 } = nodeWithAggregate()
    expect(canvasContents(handle.rootCanvasId).map((i) => i.id)).toEqual(
      expect.arrayContaining([p1, p2]),
    )

    const trash = committed('TrashNode', { nodeId })
    // Aggregate rows survive untouched (§9.6).
    expect(row('placement', p1)).toMatchObject({ lifecycle_state: 'active' })
    expect(row('placement', p2)).toMatchObject({ lifecycle_state: 'active' })
    expect(row('canvas', canvasId)).toMatchObject({ lifecycle_state: 'active', node_id: nodeId })
    expect(row('node', nodeId)).toMatchObject({ note_id: noteId, appearance_kind: 'image' })
    expect(
      handle.db.get('SELECT * FROM tag_assignment WHERE node_id = ?', nodeId),
    ).toBeDefined()
    // …but ordinary rendering excludes the trashed node's placements.
    const ids = canvasContents(handle.rootCanvasId).map((i) => i.id)
    expect(ids).not.toContain(p1)
    expect(ids).not.toContain(p2)
    // Invariant 15: the shared note stays active.
    expect(row('note', noteId)).toMatchObject({ lifecycle_state: 'active' })
    expect(row('node', otherNode)).toMatchObject({ note_id: noteId, lifecycle_state: 'active' })

    // Restore revives the placements together with the node.
    undo(trash.inverse)
    expect(canvasContents(handle.rootCanvasId).map((i) => i.id)).toEqual(
      expect.arrayContaining([p1, p2]),
    )
  })

  it('stays active for a note referenced only by the trashed node (invariant 15)', () => {
    const nodeId = createNode()
    const noteId = createNote('Solo Note')
    committed('AttachNoteToNode', { nodeId, noteId })
    committed('TrashNode', { nodeId })
    expect(row('note', noteId)).toMatchObject({ lifecycle_state: 'active' })
  })

  it('refuses the root node (invariant 2) and the schema trigger backs it', () => {
    expect(exec('TrashNode', { nodeId: handle.rootNodeId })).toMatchObject({
      status: 'error',
      code: 'ROOT_NODE_PROTECTED',
    })
    expect(() =>
      handle.db.run(
        "UPDATE node SET lifecycle_state = 'trashed' WHERE id = ?",
        handle.rootNodeId,
      ),
    ).toThrow(/EW_ROOT_NODE_PROTECTED/)
    expect(() => handle.db.run('DELETE FROM node WHERE id = ?', handle.rootNodeId)).toThrow(
      /EW_ROOT_NODE_PROTECTED/,
    )
  })
})

describe('TrashCanvas (§9.5, invariants 2 and 14)', () => {
  function canvasWithContents() {
    const owner = createNode()
    const canvasId = uuidv7()
    committed('CreateCanvas', { canvasId, nodeId: owner })
    const placed = createNode()
    const noteId = createNote('Placed Note')
    const placedBare = createNode()
    committed('AttachNoteToNode', { nodeId: placed, noteId })
    const p1 = place(canvasId, placed)
    const pBare = place(canvasId, placedBare)
    const decorationId = uuidv7()
    committed('CreateDecoration', {
      decorationId,
      canvasId,
      kind: 'text',
      data: { text: 'label' },
    })
    return { owner, canvasId, placed, placedBare, noteId, p1, pBare, decorationId }
  }

  it('preserves the aggregate, keeps referenced nodes/notes active, no bare-node auto-trash', () => {
    const { canvasId, placed, placedBare, noteId, p1, pBare, decorationId } = canvasWithContents()

    const commandId = uuidv7()
    const trash = committed('TrashCanvas', { canvasId }, commandId)
    expect(row('canvas', canvasId)).toMatchObject({
      lifecycle_state: 'trashed',
      trashed_by_command_id: commandId,
    })
    // §9.5: canvas-local rows preserved recoverably.
    expect(row('placement', p1)).toBeDefined()
    expect(row('placement', pBare)).toBeDefined()
    expect(row('decoration', decorationId)).toBeDefined()
    // Trashed canvas renders nothing.
    expect(canvasContents(canvasId)).toEqual([])
    // Invariant 14: referenced nodes and notes stay active.
    expect(row('node', placed)).toMatchObject({ lifecycle_state: 'active' })
    expect(row('note', noteId)).toMatchObject({ lifecycle_state: 'active' })
    // §9.5: NOT last-placement deletion — the bare node stays active…
    expect(row('node', placedBare)).toMatchObject({ lifecycle_state: 'active' })
    // …and both nodes now read as unplaced in the library.
    expect(unplacedIds()).toEqual(expect.arrayContaining([placed, placedBare]))

    // Restore brings the contents back.
    undo(trash.inverse)
    expect(canvasContents(canvasId).map((i) => i.id)).toEqual(
      expect.arrayContaining([p1, pBare, decorationId]),
    )
    expect(unplacedIds()).not.toContain(placed)
  })

  it('refuses the root canvas (invariant 2) and the schema trigger backs it', () => {
    expect(exec('TrashCanvas', { canvasId: handle.rootCanvasId })).toMatchObject({
      status: 'error',
      code: 'ROOT_CANVAS_PROTECTED',
    })
    expect(() =>
      handle.db.run(
        "UPDATE canvas SET lifecycle_state = 'trashed' WHERE id = ?",
        handle.rootCanvasId,
      ),
    ).toThrow(/EW_ROOT_CANVAS_PROTECTED/)
    expect(() =>
      handle.db.run('DELETE FROM canvas WHERE id = ?', handle.rootCanvasId),
    ).toThrow(/EW_ROOT_CANVAS_PROTECTED/)
  })
})

describe('RestoreRecord (§9.7, invariant 27)', () => {
  it('binds unresolved link records matching a restored note title', () => {
    const noteId = createNote('Phoenix')
    committed('TrashNote', { noteId })
    // An unresolved record with this title_key cannot arise through
    // commands while the reservation holds (tokens bind to trashed
    // notes, §7.1), so seed one directly: invariant 27 requires the
    // restore sweep to bind it.
    const sourceId = createNote('Watcher')
    const linkId = uuidv7()
    const now = new Date().toISOString()
    handle.db.run(
      `INSERT INTO link (id, project_id, source_note_id, source_revision, range_start,
         range_end, state, target_note_id, target_title_key, display_text,
         created_at, updated_at)
       VALUES (?, ?, ?, 1, 0, 11, 'unresolved', NULL, 'phoenix', 'Phoenix', ?, ?)`,
      linkId,
      handle.projectId,
      sourceId,
      now,
      now,
    )

    const restore = committed('RestoreRecord', { kind: 'note', id: noteId })
    expect(row('link', linkId)).toMatchObject({ state: 'bound', target_note_id: noteId })
    expect(restore.affected).toContainEqual({ kind: 'link', id: linkId })
    expect(restore.inverse).toMatchObject({ commandType: 'TrashNote', payload: { noteId } })
  })

  it('refuses active records and unknown kinds', () => {
    const noteId = createNote('Active')
    expect(exec('RestoreRecord', { kind: 'note', id: noteId })).toMatchObject({
      status: 'error',
      code: 'RECORD_NOT_TRASHED',
    })
    expect(exec('RestoreRecord', { kind: 'placement', id: uuidv7() })).toMatchObject({
      status: 'error',
      code: 'VALIDATION_FAILED',
    })
  })
})

describe('PurgeRecord (§9.7, §7.1)', () => {
  it('requires the record to be in Trash first', () => {
    const noteId = createNote('Still Active')
    expect(exec('PurgeRecord', { kind: 'note', id: noteId })).toMatchObject({
      status: 'error',
      code: 'RECORD_NOT_TRASHED',
    })
    expect(row('note', noteId)).toBeDefined()
  })

  it('purges a note: inbound bound links break with token display text, no implicit re-bind', () => {
    const targetId = createNote('Ghost Ship')
    const sourceId = createNote('Log', 'saw [[Ghost Ship]] and [[ghost ship|her]]')
    const nodeId = createNode()
    committed('AttachNoteToNode', { nodeId, noteId: targetId })
    committed('TrashNote', { noteId: targetId })

    const purge = committed('PurgeRecord', { kind: 'note', id: targetId })
    expect(purge.inverse).toBeNull()
    expect(row('note', targetId)).toBeUndefined()
    // §7.1: broken records store the source token's raw display text.
    const links = handle.db.all<{ state: string; target_note_id: string | null; display_text: string }>(
      'SELECT state, target_note_id, display_text FROM link WHERE source_note_id = ? ORDER BY range_start',
      sourceId,
    )
    expect(links).toEqual([
      { state: 'broken', target_note_id: null, display_text: 'Ghost Ship' },
      { state: 'broken', target_note_id: null, display_text: 'ghost ship' },
    ])
    // The referencing node survives, detached.
    expect(row('node', nodeId)).toMatchObject({ note_id: null, lifecycle_state: 'active' })
    // The affected list names every removed/converted record.
    expect(purge.affected).toContainEqual({ kind: 'note', id: targetId })
    expect(purge.affected).toContainEqual({ kind: 'node', id: nodeId })
    expect(purge.affected.filter((a) => a.kind === 'link')).toHaveLength(2)

    // The title is free again, and creating it binds nothing implicitly
    // (invariant 27: broken never re-binds).
    const successorId = uuidv7()
    committed('CreateNote', { noteId: successorId, title: 'Ghost Ship' })
    for (const link of handle.db.all<{ state: string }>(
      'SELECT state FROM link WHERE source_note_id = ?',
      sourceId,
    )) {
      expect(link.state).toBe('broken')
    }
    // Even a re-save of the source keeps the tokens broken.
    committed('UpdateNote', { noteId: sourceId, body: 'saw [[Ghost Ship]] again' })
    expect(
      handle.db.all<{ state: string }>('SELECT state FROM link WHERE source_note_id = ?', sourceId),
    ).toEqual([{ state: 'broken' }])
  })

  it('purging a note removes its outbound records with it', () => {
    const noteId = createNote('Chatty', 'refs [[Elsewhere]] and [[More]]')
    committed('TrashNote', { noteId })
    const purge = committed('PurgeRecord', { kind: 'note', id: noteId })
    expect(handle.db.all('SELECT id FROM link WHERE source_note_id = ?', noteId)).toEqual([])
    expect(purge.affected.filter((a) => a.kind === 'link')).toHaveLength(2)
  })

  it('purges a node aggregate: placements, owned canvas contents, tags; note and asset survive', () => {
    const nodeId = createNode()
    const noteId = createNote('Survivor')
    committed('AttachNoteToNode', { nodeId, noteId })
    const tagId = uuidv7()
    committed('CreateTag', { tagId, name: 'doomed' })
    committed('AssignTagToNode', { tagId, nodeId })
    const assetId = insertAsset('hash-node')
    committed('SetNodeAppearance', { nodeId, appearance: { kind: 'image', assetId, crop: null } })
    const canvasId = uuidv7()
    committed('CreateCanvas', { canvasId, nodeId })
    const other = createNode()
    const otherNote = createNote('Other Note')
    committed('AttachNoteToNode', { nodeId: other, noteId: otherNote })
    const innerPlacement = place(canvasId, other)
    const outerPlacement = place(handle.rootCanvasId, nodeId, { x: 3, y: 4 })
    const decorationId = uuidv7()
    committed('CreateDecoration', {
      decorationId,
      canvasId: handle.rootCanvasId,
      kind: 'connector',
      data: { start: { x: 0, y: 0 } },
      anchorEndPlacementId: outerPlacement,
    })
    handle.db.run(
      `INSERT INTO bookmark (id, project_id, canvas_id, name, created_at)
       VALUES (?, ?, ?, 'bm', ?)`,
      uuidv7(),
      handle.projectId,
      canvasId,
      new Date().toISOString(),
    )

    committed('TrashNode', { nodeId })
    const purge = committed('PurgeRecord', { kind: 'node', id: nodeId })
    expect(purge.inverse).toBeNull()
    expect(row('node', nodeId)).toBeUndefined()
    expect(row('placement', outerPlacement)).toBeUndefined()
    expect(row('canvas', canvasId)).toBeUndefined()
    expect(row('placement', innerPlacement)).toBeUndefined()
    expect(handle.db.all('SELECT * FROM tag_assignment WHERE node_id = ?', nodeId)).toEqual([])
    expect(handle.db.all('SELECT * FROM bookmark WHERE canvas_id = ?', canvasId)).toEqual([])
    // Connector endpoint freed at the placement's last position.
    const decoration = row('decoration', decorationId)!
    expect(decoration.anchor_end_placement_id).toBeNull()
    expect(JSON.parse(decoration.data as string).end).toEqual({ x: 3, y: 4 })
    // Nothing beyond the aggregate: note, other node, tag, asset survive.
    expect(row('note', noteId)).toMatchObject({ lifecycle_state: 'active' })
    expect(row('node', other)).toMatchObject({ lifecycle_state: 'active' })
    expect(row('tag', tagId)).toBeDefined()
    expect(row('asset', assetId)).toBeDefined()
    // …and the asset blob is now GC-eligible (§9.8).
    expect(computeGcEligibleBlobs(queryCtx)).toContain('hash-node')
    for (const removed of [
      { kind: 'node', id: nodeId },
      { kind: 'placement', id: outerPlacement },
      { kind: 'placement', id: innerPlacement },
      { kind: 'canvas', id: canvasId },
    ]) {
      expect(purge.affected).toContainEqual(removed)
    }
  })

  it('purges a canvas aggregate; referenced nodes stay', () => {
    const owner = createNode()
    const canvasId = uuidv7()
    committed('CreateCanvas', { canvasId, nodeId: owner })
    const placed = createNode()
    const noteId = createNote('Referenced')
    committed('AttachNoteToNode', { nodeId: placed, noteId })
    const placementId = place(canvasId, placed)
    const decorationId = uuidv7()
    committed('CreateDecoration', { decorationId, canvasId, kind: 'shape', data: {} })

    committed('TrashCanvas', { canvasId })
    const purge = committed('PurgeRecord', { kind: 'canvas', id: canvasId })
    expect(purge.inverse).toBeNull()
    expect(row('canvas', canvasId)).toBeUndefined()
    expect(row('placement', placementId)).toBeUndefined()
    expect(row('decoration', decorationId)).toBeUndefined()
    expect(row('node', placed)).toMatchObject({ lifecycle_state: 'active' })
    expect(row('node', owner)).toMatchObject({ lifecycle_state: 'active' })
    expect(purge.affected).toContainEqual({ kind: 'canvas', id: canvasId })
    expect(purge.affected).toContainEqual({ kind: 'placement', id: placementId })
    expect(purge.affected).toContainEqual({ kind: 'decoration', id: decorationId })
  })
})

describe('SetTrashRetention (§9.1)', () => {
  it('defaults to never, round-trips, and validates', () => {
    expect(
      handle.db.get<{ value: string }>(
        "SELECT value FROM settings WHERE key = 'trash_retention'",
      ),
    ).toMatchObject({ value: '"never"' })

    const set = committed('SetTrashRetention', { retention: '30d' })
    expect(
      handle.db.get<{ value: string }>(
        "SELECT value FROM settings WHERE key = 'trash_retention'",
      ),
    ).toMatchObject({ value: '"30d"' })
    expect(set.inverse).toMatchObject({
      commandType: 'SetTrashRetention',
      payload: { retention: 'never' },
    })
    undo(set.inverse)
    expect(
      handle.db.get<{ value: string }>(
        "SELECT value FROM settings WHERE key = 'trash_retention'",
      ),
    ).toMatchObject({ value: '"never"' })

    expect(exec('SetTrashRetention', { retention: 'weekly' })).toMatchObject({
      status: 'error',
      code: 'VALIDATION_FAILED',
    })
  })
})

/**
 * AI-IMP-013 acceptance (RFC slice items 20–22) at service level.
 * Note: the Phase 1 schema gives notes no direct asset reference, so
 * "the note's asset" is its embodying node's appearance asset; the
 * hash becomes GC-eligible when the purge chain removes that last
 * appearance reference.
 */
describe('acceptance: bare-node delete, trash, purge end to end', () => {
  it('runs the §17 slice scenario', () => {
    // GIVEN a canvas holding placements of two nodes, one bare image
    // node placed once, and a note linked from another note.
    const canvasOwner = createNode()
    const canvasId = uuidv7()
    committed('CreateCanvas', { canvasId, nodeId: canvasOwner })
    const bareAsset = insertAsset('hash-bare')
    const bareNode = createNode()
    committed('SetNodeAppearance', {
      nodeId: bareNode,
      appearance: { kind: 'image', assetId: bareAsset, crop: null },
    })
    const barePlacement = place(canvasId, bareNode)
    const noteId = createNote('Ghost Ship', 'a spectral hull')
    const notedAsset = insertAsset('hash-noted')
    const notedNode = createNode()
    committed('AttachNoteToNode', { nodeId: notedNode, noteId })
    committed('SetNodeAppearance', {
      nodeId: notedNode,
      appearance: { kind: 'image', assetId: notedAsset, crop: null },
    })
    place(canvasId, notedNode)
    const logId = createNote('Log', 'we sighted [[Ghost Ship]] at dawn')

    // WHEN the bare node's placement is deleted.
    const del = committed('DeletePlacement', { placementId: barePlacement })
    // THEN the node is trashed in the same command…
    expect(row('node', bareNode)).toMatchObject({ lifecycle_state: 'trashed' })
    expect(del.affected).toContainEqual({ kind: 'node', id: bareNode })
    // …and Keep in Project returns it active and unplaced.
    committed('RestoreRecord', { kind: 'node', id: bareNode })
    expect(row('node', bareNode)).toMatchObject({ lifecycle_state: 'active' })
    expect(unplacedIds()).toContain(bareNode)

    // WHEN the note is trashed.
    const linksBefore = handle.db.all('SELECT * FROM link ORDER BY id')
    committed('TrashNote', { noteId })
    // THEN inbound links report In Trash…
    expect(
      handle.db.get(
        `SELECT l.id FROM link l JOIN note t ON t.id = l.target_note_id
         WHERE l.source_note_id = ? AND l.state = 'bound' AND t.lifecycle_state = 'trashed'`,
        logId,
      ),
    ).toBeDefined()
    // …its title stays reserved…
    expect(exec('CreateNote', { noteId: uuidv7(), title: 'Ghost Ship' })).toMatchObject({
      status: 'error',
      code: 'NOTE_TITLE_CONFLICT',
    })
    // …and restore rebinds nothing because bindings never broke.
    committed('RestoreRecord', { kind: 'note', id: noteId })
    expect(handle.db.all('SELECT * FROM link ORDER BY id')).toEqual(linksBefore)

    // WHEN the note is purged (with the node embodying it), after its
    // Trash round trip.
    committed('TrashNote', { noteId })
    committed('PurgeRecord', { kind: 'note', id: noteId })
    // THEN inbound links become broken with display text…
    expect(
      handle.db.get('SELECT * FROM link WHERE source_note_id = ?', logId),
    ).toMatchObject({ state: 'broken', target_note_id: null, display_text: 'Ghost Ship' })
    // …creating a new same-title note binds nothing implicitly…
    committed('CreateNote', { noteId: uuidv7(), title: 'Ghost Ship' })
    expect(
      handle.db.get('SELECT state FROM link WHERE source_note_id = ?', logId),
    ).toMatchObject({ state: 'broken' })
    // …and once the note's embodying node is purged too, the asset it
    // held is unreferenced and appears in the GC-eligible set.
    expect(computeGcEligibleBlobs(queryCtx)).not.toContain('hash-noted')
    committed('TrashNode', { nodeId: notedNode })
    committed('PurgeRecord', { kind: 'node', id: notedNode })
    const eligible = computeGcEligibleBlobs(queryCtx)
    expect(eligible).toContain('hash-noted')
    // The kept bare node still guards its own asset.
    expect(eligible).not.toContain('hash-bare')
  })
})
