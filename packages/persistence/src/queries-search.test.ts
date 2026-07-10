import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { shortCode, uuidv7 } from '@ew/domain'
import { CommandRegistry, type CommittedResult } from '@ew/commands'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Dispatcher, type CommandContext } from './dispatcher'
import { registerAssetHandlers } from './handlers/assets'
import { registerCanvasHandlers } from './handlers/canvases'
import { registerDecorationHandlers } from './handlers/decorations'
import { registerLifecycleHandlers } from './handlers/lifecycle'
import { registerNodeHandlers } from './handlers/nodes'
import { registerNoteHandlers } from './handlers/notes'
import { registerPlacementHandlers } from './handlers/placements'
import { registerTagHandlers } from './handlers/tags'
import { createProject, type ProjectHandle } from './project'
import { QueryRegistry } from './queries'
import {
  registerSearchQueries,
  type QuickOpenEntry,
  type SearchResults,
} from './queries-search'

let dir: string
let handle: ProjectHandle
let dispatcher: Dispatcher
let queries: QueryRegistry
let queryCtx: Omit<CommandContext, 'now'>

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'ew-qsearch-'))
  handle = createProject(dir, 'Search Query Test')
  const registry = new CommandRegistry<CommandContext>()
  registerNodeHandlers(registry)
  registerNoteHandlers(registry)
  registerAssetHandlers(registry)
  registerCanvasHandlers(registry)
  registerTagHandlers(registry)
  registerDecorationHandlers(registry)
  registerPlacementHandlers(registry)
  registerLifecycleHandlers(registry)
  dispatcher = new Dispatcher(handle, registry)
  queries = new QueryRegistry()
  registerSearchQueries(queries)
  queryCtx = {
    db: handle.db,
    projectId: handle.projectId,
    rootNodeId: handle.rootNodeId,
    rootCanvasId: handle.rootCanvasId,
  }
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

function query<T>(name: string, args?: unknown): T {
  const result = queries.run(queryCtx, name, args)
  expect(result).toMatchObject({ ok: true })
  return (result as { result: T }).result
}

function search(q: string): SearchResults {
  return query<SearchResults>('searchProject', { query: q })
}

function quickOpen(q: string): QuickOpenEntry[] {
  return query<QuickOpenEntry[]>('quickOpen', { query: q })
}

function createNote(title: string, body = ''): string {
  const noteId = uuidv7()
  committed('CreateNote', { noteId, title, body })
  return noteId
}

function createNode(): string {
  const nodeId = uuidv7()
  committed('CreateNode', { nodeId })
  return nodeId
}

function createCanvas(nodeId: string): string {
  const canvasId = uuidv7()
  committed('CreateCanvas', { canvasId, nodeId })
  return canvasId
}

function commitAsset(originalFilename: string): string {
  const assetId = uuidv7()
  committed('CommitAssetImport', {
    assetId,
    kind: 'image',
    contentHash: 'ab'.repeat(32),
    originalFilename,
    mimeType: 'image/png',
    width: null,
    height: null,
    storagePath: `assets/ab/${assetId}`,
  })
  return assetId
}

function trash(table: 'note' | 'tag' | 'asset' | 'decoration' | 'node' | 'canvas', id: string): void {
  handle.db.run(`UPDATE ${table} SET lifecycle_state = 'trashed' WHERE id = ?`, id)
}

function restore(table: 'note' | 'tag' | 'asset' | 'decoration', id: string): void {
  handle.db.run(`UPDATE ${table} SET lifecycle_state = 'active' WHERE id = ?`, id)
}

describe('searchProject', () => {
  it('keeps placement captions out of search and quick-open (§4.5 deferred scope)', () => {
    const nodeId = createNode()
    const placementId = uuidv7()
    committed('CreatePlacement', {
      placementId,
      canvasId: handle.rootCanvasId,
      nodeId,
    })
    committed('SetPlacementCaption', {
      placementId,
      caption: 'ultravioletcaptiontoken',
    })

    expect(search('ultravioletcaptiontoken')).toEqual({
      notes: [],
      tags: [],
      assets: [],
      canvasText: [],
    })
    expect(quickOpen('ultravioletcaptiontoken')).toEqual([])
  })

  it('meets the AI-IMP-015 acceptance scenario (RFC slice item 12, search half)', () => {
    // GIVEN
    const noteId = createNote('Harbor Wall', 'granite base under the lighthouse beam')
    const tagId = uuidv7()
    committed('CreateTag', { tagId, name: 'coastal' })
    const assetId = commitAsset('cliffs_ref.png')
    const nodeA = createNode()
    const nodeB = createNode()
    for (const nodeId of [nodeA, nodeB]) {
      committed('SetNodeAppearance', {
        nodeId,
        appearance: { kind: 'image', assetId, crop: null },
      })
    }
    const decorationId = uuidv7()
    committed('CreateDecoration', {
      decorationId,
      canvasId: handle.rootCanvasId,
      kind: 'text',
      data: { text: 'old beacon' },
    })

    // WHEN/THEN: each term returns exactly its record, in its group.
    const byNote = search('lighthouse')
    expect(byNote.notes).toEqual([
      { noteId, title: 'Harbor Wall', snippet: expect.stringContaining('[lighthouse]') },
    ])
    expect(byNote.tags).toEqual([])
    expect(byNote.assets).toEqual([])
    expect(byNote.canvasText).toEqual([])

    const byTag = search('coastal')
    expect(byTag.tags).toEqual([{ tagId, name: 'coastal' }])
    expect(byTag.notes).toEqual([])
    expect(byTag.assets).toEqual([])
    expect(byTag.canvasText).toEqual([])

    const byAsset = search('cliffs')
    expect(byAsset.assets).toEqual([
      {
        assetId,
        filename: 'cliffs_ref.png',
        usingNodeIds: [nodeA, nodeB].sort(),
        usingCanvases: [],
      },
    ])
    expect(byAsset.notes).toEqual([])
    expect(byAsset.tags).toEqual([])
    expect(byAsset.canvasText).toEqual([])

    const byDecoration = search('beacon')
    expect(byDecoration.canvasText).toEqual([
      {
        decorationId,
        canvasId: handle.rootCanvasId,
        snippet: expect.stringContaining('[beacon]'),
      },
    ])
    expect(byDecoration.notes).toEqual([])
    expect(byDecoration.tags).toEqual([])
    expect(byDecoration.assets).toEqual([])

    // WHEN the note is trashed THEN it is absent, and returns after
    // restore with no rebuild.
    trash('note', noteId)
    expect(search('lighthouse').notes).toEqual([])
    restore('note', noteId)
    expect(search('lighthouse').notes).toHaveLength(1)

    // WHEN quick-open queries "har" THEN the note appears; phantom and
    // trashed titles do not.
    createNote('Ledger', 'mentions [[Harpoon Racks]] twice: [[Harpoon Racks]]')
    const trashedId = createNote('Harbormaster')
    trash('note', trashedId)
    // (Root node filtered: its random short code could contain "har".)
    const entries = quickOpen('har').filter((e) => e.id !== handle.rootNodeId)
    expect(entries).toEqual([{ kind: 'note', id: noteId, label: 'Harbor Wall' }])
  })

  it('reports canvas background usage of a matched asset as labeled, active canvases', () => {
    const assetId = commitAsset('vista.png')
    committed('SetCanvasBackground', {
      canvasId: handle.rootCanvasId,
      assetId,
      settings: null,
    })
    // A second background canvas whose owning node has no note: the
    // location grammar labels it by short code ('Home' is the root's).
    const nodeId = createNode()
    const canvasId = createCanvas(nodeId)
    committed('SetCanvasBackground', { canvasId, assetId, settings: null })
    expect(search('vista').assets).toEqual([
      {
        assetId,
        filename: 'vista.png',
        usingNodeIds: [],
        usingCanvases: [
          { canvasId: handle.rootCanvasId, canvasLabel: 'Home' },
          { canvasId, canvasLabel: shortCode(nodeId) },
        ].sort((a, b) => (a.canvasId < b.canvasId ? -1 : 1)),
      },
    ])
    // Trashing a background canvas removes it from the hit (§9.5: the
    // canvas row alone flips; the query must not surface it).
    trash('canvas', canvasId)
    expect(search('vista').assets[0]?.usingCanvases).toEqual([
      { canvasId: handle.rootCanvasId, canvasLabel: 'Home' },
    ])
  })

  it('excludes canvas-text hits on trashed canvases (§9.5 preserved aggregate)', () => {
    const nodeId = createNode()
    const canvasId = createCanvas(nodeId)
    const decorationId = uuidv7()
    committed('CreateDecoration', {
      decorationId,
      canvasId,
      kind: 'text',
      data: { text: 'driftwood sigil' },
    })
    expect(search('driftwood').canvasText).toHaveLength(1)
    // §9.5 trash flips the canvas row alone — the decoration stays
    // active, but the hit would navigate to a null scene.
    trash('canvas', canvasId)
    expect(search('driftwood').canvasText).toEqual([])
    handle.db.run(`UPDATE canvas SET lifecycle_state = 'active' WHERE id = ?`, canvasId)
    expect(search('driftwood').canvasText).toHaveLength(1)
  })

  it('excludes trashed records across all four corpora and needs no rebuild on restore', () => {
    const noteId = createNote('Salt Cellar', 'brine ledger')
    const tagId = uuidv7()
    committed('CreateTag', { tagId, name: 'brackish' })
    const assetId = commitAsset('brine_map.png')
    const decorationId = uuidv7()
    committed('CreateDecoration', {
      decorationId,
      canvasId: handle.rootCanvasId,
      kind: 'text',
      data: { text: 'brine soaked sign' },
    })

    trash('note', noteId)
    trash('tag', tagId)
    trash('asset', assetId)
    trash('decoration', decorationId)
    expect(search('brine')).toEqual({ notes: [], tags: [], assets: [], canvasText: [] })
    expect(search('brackish').tags).toEqual([])

    restore('note', noteId)
    restore('tag', tagId)
    restore('asset', assetId)
    restore('decoration', decorationId)
    const back = search('brine')
    expect(back.notes).toHaveLength(1)
    expect(back.assets).toHaveLength(1)
    expect(back.canvasText).toHaveLength(1)
    expect(search('brackish').tags).toHaveLength(1)
  })

  it('never throws on hostile or empty MATCH syntax input', () => {
    createNote('Weird Syntax', 'weird and syntax')
    for (const hostile of ['"weird" AND syntax', 'NOT (a OR b)', 'title:evil', '"', '*', '   ']) {
      const result = queries.run(queryCtx, 'searchProject', { query: hostile })
      expect(result.ok).toBe(true)
    }
    expect(search('')).toEqual({ notes: [], tags: [], assets: [], canvasText: [] })
    // Quoted operators match literally.
    expect(search('weird AND syntax').notes).toHaveLength(1)
    expect(search('weird AND absent').notes).toHaveLength(0)
  })
})

describe('quickOpen', () => {
  it('matches canvas-owning nodes by attached note title with a kind discriminator', () => {
    const noteId = createNote('Harbor District')
    const nodeId = createNode()
    const canvasId = createCanvas(nodeId)
    committed('AttachNoteToNode', { nodeId, noteId })

    const entries = quickOpen('harbor')
    expect(entries).toEqual([
      { kind: 'note', id: noteId, label: 'Harbor District' },
      { kind: 'canvas', id: nodeId, canvasId, label: 'Harbor District' },
    ])
  })

  it('addresses a canvas-owning node without a note by its short code', () => {
    const nodeId = createNode()
    const canvasId = createCanvas(nodeId)
    const code = shortCode(nodeId)

    const entries = quickOpen(code)
    expect(entries).toContainEqual({ kind: 'canvas', id: nodeId, canvasId, label: code })
    // The root node owns the root canvas noteless too; only short-code
    // matches surface, never every noteless canvas.
    for (const entry of entries) {
      expect(entry.label.includes(code)).toBe(true)
    }
  })

  it('excludes phantoms, trashed notes, and trashed canvas owners', () => {
    const keptId = createNote('Harbor Wall')
    // Phantom: unresolved wiki-link title only (no note row).
    createNote('Ledger', 'see [[Harbinger]]')
    // Trashed note.
    const trashedId = createNote('Harbormaster')
    trash('note', trashedId)
    // Canvas whose owning node is trashed.
    const noteId = createNote('Harpoon Deck')
    const nodeId = createNode()
    createCanvas(nodeId)
    committed('AttachNoteToNode', { nodeId, noteId })
    trash('node', nodeId)

    const entries = quickOpen('har').filter((e) => e.id !== handle.rootNodeId)
    expect(entries).toEqual([
      { kind: 'note', id: keptId, label: 'Harbor Wall' },
      { kind: 'note', id: noteId, label: 'Harpoon Deck' },
    ])
  })

  it('excludes trashed canvases and matches title_key-normalized input', () => {
    const noteId = createNote('Störm Deck')
    const nodeId = createNode()
    const canvasId = createCanvas(nodeId)
    committed('AttachNoteToNode', { nodeId, noteId })

    expect(quickOpen('STÖRM')).toEqual([
      { kind: 'note', id: noteId, label: 'Störm Deck' },
      { kind: 'canvas', id: nodeId, canvasId, label: 'Störm Deck' },
    ])

    trash('canvas', canvasId)
    expect(quickOpen('störm')).toEqual([{ kind: 'note', id: noteId, label: 'Störm Deck' }])
  })

  it('returns nothing for empty input and matches LIKE wildcards literally', () => {
    createNote('Percent 100% Done')
    expect(quickOpen('')).toEqual([])
    expect(quickOpen('   ')).toEqual([])
    expect(quickOpen('0% d')).toHaveLength(1)
    expect(quickOpen('%')).toHaveLength(1)
    expect(quickOpen('x%x')).toHaveLength(0)
  })
})

// §9.6 (AI-IMP-163): a background-asset hit points at the board that
// uses it. When the board's OWNER node is trashed the node row flips
// alone (the canvas row stays 'active'), so the scene renderer refuses
// the board — the search hit must stop offering it as a navigable row,
// and RestoreRecord brings it back. Trash/restore via real commands.
describe('background-asset hits follow owner-trashed boards (§9.6, AI-IMP-163)', () => {
  it('omits an owner-trashed board from usingCanvases; restore revives it', () => {
    const assetId = commitAsset('vista.png')
    const owner = createNode()
    const boardCanvas = createCanvas(owner)
    committed('SetCanvasBackground', { canvasId: boardCanvas, assetId, settings: null })

    const canvasIds = () =>
      (search('vista').assets[0]?.usingCanvases ?? []).map((c) => c.canvasId)
    expect(canvasIds()).toEqual([boardCanvas])
    committed('TrashNode', { nodeId: owner })
    expect(canvasIds()).toEqual([])
    committed('RestoreRecord', { kind: 'node', id: owner })
    expect(canvasIds()).toEqual([boardCanvas])
  })

  it('omits canvas-text hits on an owner-trashed board; restore revives them', () => {
    // The adjacent leak the AI-IMP-163 sweep flagged: canvasText
    // joined canvas.active but never the owner (same §9.6 class).
    const owner = createNode()
    const boardCanvas = createCanvas(owner)
    committed('CreateDecoration', {
      decorationId: uuidv7(),
      canvasId: boardCanvas,
      kind: 'text',
      data: { text: 'signal lantern' },
    })
    const hits = () => search('lantern').canvasText.map((h) => h.canvasId)
    expect(hits()).toEqual([boardCanvas])
    committed('TrashNode', { nodeId: owner })
    expect(hits()).toEqual([])
    committed('RestoreRecord', { kind: 'node', id: owner })
    expect(hits()).toEqual([boardCanvas])
  })
})
