import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { uuidv7 } from '@ew/domain'
import { CommandRegistry, type CommandResult, type CommittedResult } from '@ew/commands'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Dispatcher, type CommandContext } from './dispatcher'
import { registerCanvasHandlers } from './handlers/canvases'
import { registerDecorationHandlers } from './handlers/decorations'
import { registerLifecycleHandlers } from './handlers/lifecycle'
import { registerNodeHandlers } from './handlers/nodes'
import { registerNoteHandlers } from './handlers/notes'
import { registerPlacementHandlers } from './handlers/placements'
import { registerTagHandlers } from './handlers/tags'
import { createProject, type ProjectHandle } from './project'
import { QueryRegistry } from './queries'
import { registerCoreQueries } from './queries'
import {
  registerLifecycleQueries,
  type CanvasImpact,
  type EmptyTrashEntry,
  type NodeImpact,
  type NoteImpact,
  type TrashView,
} from './queries-lifecycle'
import { registerNoteQueries, type TitleSuggestion } from './queries-notes'
import { registerStructureQueries, type CanvasContentItem } from './queries-structure'

let dir: string
let handle: ProjectHandle
let dispatcher: Dispatcher
let queries: QueryRegistry
let queryCtx: Omit<CommandContext, 'now'>

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'ew-lifecycle-q-'))
  handle = createProject(dir, 'Lifecycle Query Test')
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
  registerCoreQueries(queries)
  registerNoteQueries(queries)
  registerStructureQueries(queries)
  registerLifecycleQueries(queries)
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

function place(canvasId: string, nodeId: string): string {
  const placementId = uuidv7()
  committed('CreatePlacement', { placementId, canvasId, nodeId })
  return placementId
}

describe('getTrashView and getEmptyTrashEligibility (§9.1, §9.7)', () => {
  it('lists trashed records grouped by kind with trash stamps', () => {
    const noteId = createNote('Buried')
    const nodeId = createNode()
    const nodeNote = createNote('Node Note')
    committed('AttachNoteToNode', { nodeId, noteId: nodeNote })
    const owner = createNode()
    const canvasId = uuidv7()
    committed('CreateCanvas', { canvasId, nodeId: owner })

    const noteCmd = uuidv7()
    committed('TrashNote', { noteId }, noteCmd)
    committed('TrashNode', { nodeId })
    committed('TrashCanvas', { canvasId })

    const view = query<TrashView>('getTrashView')
    expect(view.notes).toHaveLength(1)
    expect(view.notes[0]).toMatchObject({
      id: noteId,
      title: 'Buried',
      trashedByCommandId: noteCmd,
    })
    expect(view.notes[0].trashedAt).toBeTruthy()
    expect(view.nodes).toEqual([
      expect.objectContaining({ id: nodeId, noteId: nodeNote, noteTitle: 'Node Note' }),
    ])
    expect(view.canvases).toEqual([expect.objectContaining({ id: canvasId, nodeId: owner })])

    const eligibility = query<EmptyTrashEntry[]>('getEmptyTrashEligibility')
    expect(eligibility).toHaveLength(3)
    expect(eligibility.map((e) => e.kind).sort()).toEqual(['canvas', 'node', 'note'])
    expect(eligibility.find((e) => e.kind === 'note')).toMatchObject({
      id: noteId,
      label: 'Buried',
    })
    // Everything listed is purgeable as-is.
    for (const entry of eligibility) {
      committed('PurgeRecord', { kind: entry.kind, id: entry.id })
    }
    expect(query<EmptyTrashEntry[]>('getEmptyTrashEligibility')).toEqual([])
  })
})

describe('impact summaries (§9.4–§9.6)', () => {
  it('getNoteImpact reports nodes, link counts, and the text-only flag', () => {
    const noteId = createNote('Target', 'refs [[Other]] and [[Another]]')
    createNote('Fan One', 'about [[Target]]')
    createNote('Fan Two', 'also [[Target]] and [[Target|again]]')
    expect(query<NoteImpact>('getNoteImpact', { noteId })).toMatchObject({
      noteId,
      title: 'Target',
      referencingNodeIds: [],
      inboundLinkCount: 3,
      outboundLinkCount: 2,
      textOnly: true,
    })

    const nodeId = createNode()
    committed('AttachNoteToNode', { nodeId, noteId })
    expect(query<NoteImpact>('getNoteImpact', { noteId })).toMatchObject({
      referencingNodeIds: [nodeId],
      textOnly: false,
    })
    expect(query<NoteImpact | null>('getNoteImpact', { noteId: uuidv7() })).toBeNull()
  })

  it('getCanvasImpact counts contents, referenced nodes, newly unplaced, and bare', () => {
    const owner = createNode()
    const canvasId = uuidv7()
    committed('CreateCanvas', { canvasId, nodeId: owner })

    // Placed twice here, nowhere else: newly unplaced + bare.
    const bare = createNode()
    place(canvasId, bare)
    place(canvasId, bare)
    // Newly unplaced but NOT bare (has a note).
    const noted = createNode()
    committed('AttachNoteToNode', { nodeId: noted, noteId: createNote('Kept Note') })
    place(canvasId, noted)
    // Also placed elsewhere: not newly unplaced.
    const elsewhere = createNode()
    place(canvasId, elsewhere)
    place(handle.rootCanvasId, elsewhere)
    committed('CreateDecoration', {
      decorationId: uuidv7(),
      canvasId,
      kind: 'text',
      data: { text: 'x' },
    })

    expect(query<CanvasImpact>('getCanvasImpact', { canvasId })).toEqual({
      canvasId,
      placementCount: 4,
      decorationCount: 1,
      referencedNodeCount: 3,
      newlyUnplacedCount: 2,
      newlyUnplacedBareCount: 1,
    })
    expect(query<CanvasImpact | null>('getCanvasImpact', { canvasId: uuidv7() })).toBeNull()
  })

  it('getNodeImpact reports placements, tags, note, and owned-canvas contents', () => {
    const nodeId = createNode()
    const noteId = createNote('Impacted')
    committed('AttachNoteToNode', { nodeId, noteId })
    const tagId = uuidv7()
    committed('CreateTag', { tagId, name: 'big' })
    committed('AssignTagToNode', { tagId, nodeId })
    const canvasId = uuidv7()
    committed('CreateCanvas', { canvasId, nodeId })
    place(canvasId, createNode())
    place(handle.rootCanvasId, nodeId)

    expect(query<NodeImpact>('getNodeImpact', { nodeId })).toEqual({
      nodeId,
      noteId,
      placementCount: 1,
      tagCount: 1,
      ownedCanvasId: canvasId,
      ownedCanvasPlacementCount: 1,
      ownedCanvasDecorationCount: 0,
    })
    expect(query<NodeImpact | null>('getNodeImpact', { nodeId: uuidv7() })).toBeNull()
  })
})

describe('getTrashRetention (§9.1)', () => {
  it('defaults to never and follows SetTrashRetention', () => {
    expect(query<string>('getTrashRetention')).toBe('never')
    committed('SetTrashRetention', { retention: '90d' })
    expect(query<string>('getTrashRetention')).toBe('90d')
  })
})

/**
 * Invariant 13 + §9.1 sweep: ordinary read models exclude trashed
 * records by default; only the Trash view (and In-Trash-flagged
 * suggestions per §7.2) surface them.
 */
describe('trashed records are excluded from ordinary queries', () => {
  it('sweeps node library, canvas contents, lists, suggestions, and tag views', () => {
    // A canvas with one surviving node and one to be trashed.
    const owner = createNode()
    const canvasId = uuidv7()
    committed('CreateCanvas', { canvasId, nodeId: owner })
    const stays = createNode()
    const goes = createNode()
    const staysPlacement = place(canvasId, stays)
    const goesPlacement = place(canvasId, goes)
    const tagId = uuidv7()
    committed('CreateTag', { tagId, name: 'both' })
    committed('AssignTagToNode', { tagId, nodeId: stays })
    committed('AssignTagToNode', { tagId, nodeId: goes })
    const goesNote = createNote('Doomed Note')
    committed('AttachNoteToNode', { nodeId: goes, noteId: goesNote })
    const staysNote = createNote('Safe Note')
    // A second canvas that will be trashed wholesale.
    const otherOwner = createNode()
    const doomedCanvasId = uuidv7()
    committed('CreateCanvas', { canvasId: doomedCanvasId, nodeId: otherOwner })
    place(doomedCanvasId, stays)

    committed('TrashNote', { noteId: goesNote })
    committed('TrashNode', { nodeId: goes })
    committed('TrashCanvas', { canvasId: doomedCanvasId })

    // listNodes / listNotes exclude trashed records.
    const nodeIds = query<Array<{ id: string }>>('listNodes').map((n) => n.id)
    expect(nodeIds).toContain(stays)
    expect(nodeIds).not.toContain(goes)
    const noteIds = query<Array<{ id: string }>>('listNotes').map((n) => n.id)
    expect(noteIds).toContain(staysNote)
    expect(noteIds).not.toContain(goesNote)

    // suggestTitles keeps the trashed title, flagged In Trash (§7.2).
    const suggestions = query<TitleSuggestion[]>('suggestTitles', { query: 'note' })
    expect(suggestions.find((s) => s.noteId === goesNote)).toMatchObject({ inTrash: true })
    expect(suggestions.find((s) => s.noteId === staysNote)).toMatchObject({ inTrash: false })

    // Canvas contents exclude the trashed node's placement, and a
    // trashed canvas renders nothing at all.
    const contents = query<CanvasContentItem[]>('getCanvasContents', { canvasId })
    expect(contents.map((i) => i.id)).toContain(staysPlacement)
    expect(contents.map((i) => i.id)).not.toContain(goesPlacement)
    expect(query<CanvasContentItem[]>('getCanvasContents', { canvasId: doomedCanvasId })).toEqual(
      [],
    )

    // Node library excludes the trashed node; placements on the
    // trashed canvas no longer count toward placement counts.
    const library = query<Array<{ id: string; placementCount: number }>>('listNodeLibrary')
    expect(library.map((n) => n.id)).not.toContain(goes)
    expect(library.find((n) => n.id === stays)).toMatchObject({ placementCount: 1 })

    // Tag view lists only active nodes.
    const tagView = query<{ nodes: Array<{ id: string }> }>('getTagView', { tagId })
    expect(tagView.nodes.map((n) => n.id)).toEqual([stays])

    // The Trash view is where all three surface.
    const trash = query<TrashView>('getTrashView')
    expect(trash.notes.map((n) => n.id)).toEqual([goesNote])
    expect(trash.nodes.map((n) => n.id)).toEqual([goes])
    expect(trash.canvases.map((c) => c.id)).toEqual([doomedCanvasId])
  })
})
