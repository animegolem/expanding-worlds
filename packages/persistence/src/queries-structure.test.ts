import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { titleKey, uuidv7 } from '@ew/domain'
import { CommandRegistry, type CommittedResult } from '@ew/commands'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Dispatcher, type CommandContext } from './dispatcher'
import { registerBookmarkHandlers } from './handlers/bookmarks'
import { registerCanvasHandlers } from './handlers/canvases'
import { registerDecorationHandlers } from './handlers/decorations'
import { registerLifecycleHandlers } from './handlers/lifecycle'
import { registerNodeHandlers } from './handlers/nodes'
import { registerPlacementHandlers } from './handlers/placements'
import { registerTagHandlers } from './handlers/tags'
import { createProject, type ProjectHandle } from './project'
import { QueryRegistry } from './queries'
import type { CanvasDisplayLabel } from './display-labels'
import {
  registerStructureQueries,
  type BoardFilmstrip,
  type BookmarkListRow,
  type CanvasContentItem,
  type CanvasScene,
  type NodeLocations,
  type OutlineCanvasRow,
  type TagViewNode,
} from './queries-structure'

let dir: string
let handle: ProjectHandle
let dispatcher: Dispatcher
let queries: QueryRegistry
let queryCtx: Omit<CommandContext, 'now'>

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'ew-queries-'))
  handle = createProject(dir, 'Query Test')
  const registry = new CommandRegistry<CommandContext>()
  registerNodeHandlers(registry)
  registerCanvasHandlers(registry)
  registerPlacementHandlers(registry)
  registerTagHandlers(registry)
  registerDecorationHandlers(registry)
  registerLifecycleHandlers(registry)
  registerBookmarkHandlers(registry)
  dispatcher = new Dispatcher(handle, registry)
  queries = new QueryRegistry()
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
  expect(result.ok).toBe(true)
  return (result as { result: T }).result
}

function createNode(): string {
  const nodeId = uuidv7()
  committed('CreateNode', { nodeId })
  return nodeId
}

function createPlacement(nodeId: string, canvasId = handle.rootCanvasId): string {
  const placementId = uuidv7()
  committed('CreatePlacement', { placementId, canvasId, nodeId })
  return placementId
}

function createDecoration(canvasId = handle.rootCanvasId): string {
  const decorationId = uuidv7()
  committed('CreateDecoration', { decorationId, canvasId, kind: 'shape', data: {} })
  return decorationId
}

function insertNote(title: string, body = ''): string {
  const noteId = uuidv7()
  const now = new Date().toISOString()
  handle.db.run(
    `INSERT INTO note (id, project_id, title, title_key, body, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    noteId,
    handle.projectId,
    title,
    titleKey(title),
    body,
    now,
    now,
  )
  return noteId
}

function insertImageAsset(contentHash: string, filename = 'reference.png'): string {
  const assetId = uuidv7()
  const now = new Date().toISOString()
  handle.db.run(
    `INSERT INTO asset (id, project_id, kind, content_hash, original_filename,
                        mime_type, width, height, storage_path, created_at, updated_at)
     VALUES (?, ?, 'image', ?, ?, 'image/png', 640, 480, ?, ?, ?)`,
    assetId,
    handle.projectId,
    contentHash,
    filename,
    `assets/${contentHash}`,
    now,
    now,
  )
  return assetId
}

describe('getCanvasDisplayLabels (AI-IMP-259)', () => {
  it('uses Home, live note titles, and live unnamed-board counts without exposing ids', () => {
    const titledOwner = createNode()
    const titledCanvas = uuidv7()
    committed('CreateCanvas', { canvasId: titledCanvas, nodeId: titledOwner })
    const titleId = insertNote('Robeau')
    committed('AttachNoteToNode', { nodeId: titledOwner, noteId: titleId })

    const unnamedOwner = createNode()
    const unnamedCanvas = uuidv7()
    committed('CreateCanvas', { canvasId: unnamedCanvas, nodeId: unnamedOwner })
    createPlacement(createNode(), unnamedCanvas)

    const labels = query<CanvasDisplayLabel[]>('getCanvasDisplayLabels', {
      canvasIds: [handle.rootCanvasId, titledCanvas, unnamedCanvas],
    })
    expect(new Map(labels.map((row) => [row.canvasId, row.label]))).toEqual(
      new Map([
        [handle.rootCanvasId, 'Home'],
        [titledCanvas, 'Robeau'],
        [unnamedCanvas, 'unnamed · 1 items'],
      ]),
    )
    expect(JSON.stringify(labels)).not.toContain(unnamedOwner)
  })

  it('omits unusable canvases so callers cannot mistake stale labels for live names', () => {
    const owner = createNode()
    const canvasId = uuidv7()
    committed('CreateCanvas', { canvasId, nodeId: owner })
    committed('TrashNode', { nodeId: owner })

    expect(query<CanvasDisplayLabel[]>('getCanvasDisplayLabels', { canvasIds: [canvasId] })).toEqual(
      [],
    )
  })
})

describe('getCanvasContents', () => {
  it('returns one render_order-sorted list across both kinds, active only', () => {
    const node = createNode()
    const p1 = createPlacement(node)
    const d1 = createDecoration()
    const p2 = createPlacement(node)
    // Trash one row directly; it must disappear from the view but keep
    // its slot in the underlying order space.
    handle.db.run("UPDATE placement SET lifecycle_state = 'trashed' WHERE id = ?", p1)

    const items = query<CanvasContentItem[]>('getCanvasContents', {
      canvasId: handle.rootCanvasId,
    })
    expect(items.map((item) => [item.itemKind, item.id])).toEqual([
      ['decoration', d1],
      ['placement', p2],
    ])
    const orders = items.map((item) => item.renderOrder)
    expect([...orders].sort((a, b) => a - b)).toEqual(orders)
  })
})

describe('listNodeLibrary (§14.1)', () => {
  it('lists active nodes with note title, tags, and placement count', () => {
    const placed = createNode()
    const unplaced = createNode()
    createPlacement(placed)
    createPlacement(placed)
    const noteId = insertNote('Person')
    committed('AttachNoteToNode', { nodeId: placed, noteId })
    const tagId = uuidv7()
    committed('CreateTag', { tagId, name: 'scout' })
    committed('AssignTagToNode', { tagId, nodeId: placed })

    const all = query<Array<Record<string, unknown>>>('listNodeLibrary')
    const byId = new Map(all.map((row) => [row.id as string, row]))
    expect(byId.get(placed)).toMatchObject({
      noteTitle: 'Person',
      displayLabel: 'Person',
      placementCount: 2,
      tags: ['scout'],
    })
    expect(byId.get(unplaced)).toMatchObject({
      noteTitle: null,
      displayLabel: 'untitled node',
      placementCount: 0,
      tags: [],
    })
    expect(byId.get(handle.rootNodeId)).toMatchObject({ displayLabel: 'Home' })

    // Unplaced is a legitimate durable state, filterable.
    const filtered = query<Array<Record<string, unknown>>>('listNodeLibrary', {
      filter: 'unplaced',
    })
    const ids = filtered.map((row) => row.id)
    expect(ids).toContain(unplaced)
    expect(ids).not.toContain(placed)
  })

  it('hides trashed note titles like every sibling projection (AI-IMP-085)', () => {
    const node = createNode()
    const noteId = insertNote('Ephemeral')
    committed('AttachNoteToNode', { nodeId: node, noteId })
    handle.db.run("UPDATE note SET lifecycle_state = 'trashed' WHERE id = ?", noteId)

    const all = query<Array<Record<string, unknown>>>('listNodeLibrary')
    const row = all.find((r) => r.id === node)
    expect(row).toMatchObject({ noteTitle: null })
  })
})

describe('getTagView (§4.8)', () => {
  it('returns nodes with appearance, note title, other tags, and placement count', () => {
    const nodeId = createNode()
    committed('SetNodeAppearance', { nodeId, appearance: { kind: 'dot', color: '#0f0' } })
    committed('AttachNoteToNode', { nodeId, noteId: insertNote('Scout Anna') })
    createPlacement(nodeId)
    const injured = uuidv7()
    const scout = uuidv7()
    committed('CreateTag', { tagId: injured, name: 'injured' })
    committed('CreateTag', { tagId: scout, name: 'scout' })
    committed('AssignTagToNode', { tagId: injured, nodeId })
    committed('AssignTagToNode', { tagId: scout, nodeId })

    const view = query<{
      tag: { name: string }
      nodes: Array<Record<string, unknown>>
    } | null>('getTagView', { tagId: injured })
    expect(view!.tag).toMatchObject({ name: 'injured' })
    expect(view!.nodes).toHaveLength(1)
    expect(view!.nodes[0]).toMatchObject({
      id: nodeId,
      appearanceKind: 'dot',
      appearanceColor: '#0f0',
      noteTitle: 'Scout Anna',
      placementCount: 1,
      otherTags: ['scout'],
    })

    expect(query('getTagView', { tagId: uuidv7() })).toBeNull()
  })

  it('carries active placement locations with canvas labels (AI-IMP-071)', () => {
    // Board B: a titled canvas-owning node, so its canvas has a label.
    const ownerNode = createNode()
    committed('AttachNoteToNode', { nodeId: ownerNode, noteId: insertNote('Ruins Board') })
    const boardB = uuidv7()
    committed('CreateCanvas', { canvasId: boardB, nodeId: ownerNode })

    // Carriers: multi-placed (root twice + board B), placed once, unplaced.
    const multi = createNode()
    const single = createNode()
    const unplaced = createNode()
    const multiRoot1 = createPlacement(multi)
    const multiRoot2 = createPlacement(multi)
    const multiB = createPlacement(multi, boardB)
    const singleB = createPlacement(single, boardB)
    const tagId = uuidv7()
    committed('CreateTag', { tagId, name: 'ruins' })
    for (const nodeId of [multi, single, unplaced])
      committed('AssignTagToNode', { tagId, nodeId })

    const view = query<{ nodes: TagViewNode[] } | null>('getTagView', { tagId })
    const byId = new Map(view!.nodes.map((node) => [node.id, node]))

    // Root canvas prints "Home" (the navigation stack's root label);
    // board B prints its owning node's note title.
    expect(byId.get(multi)!.placements).toEqual([
      { placementId: multiRoot1, canvasId: handle.rootCanvasId, canvasLabel: 'Home' },
      { placementId: multiRoot2, canvasId: handle.rootCanvasId, canvasLabel: 'Home' },
      { placementId: multiB, canvasId: boardB, canvasLabel: 'Ruins Board' },
    ])
    expect(byId.get(single)!.placements).toEqual([
      { placementId: singleB, canvasId: boardB, canvasLabel: 'Ruins Board' },
    ])
    // Unplaced carrier: a row with zero locations, not an omission.
    expect(byId.get(unplaced)!.placements).toEqual([])
    expect(byId.get(unplaced)!.placementCount).toBe(0)

    // A trashed placement is not a location (§9.6 visibility rules).
    handle.db.run("UPDATE placement SET lifecycle_state = 'trashed' WHERE id = ?", multiRoot2)
    const after = query<{ nodes: TagViewNode[] } | null>('getTagView', { tagId })
    const multiAfter = after!.nodes.find((node) => node.id === multi)!
    expect(multiAfter.placements.map((p) => p.placementId)).toEqual([multiRoot1, multiB])
    expect(multiAfter.placementCount).toBe(2)
  })

  it('exposes noteId and childCanvasId for row actions (AI-IMP-071)', () => {
    const nodeId = createNode()
    const noteId = insertNote('Watcher')
    committed('AttachNoteToNode', { nodeId, noteId })
    const childCanvasId = uuidv7()
    committed('CreateCanvas', { canvasId: childCanvasId, nodeId })
    const tagId = uuidv7()
    committed('CreateTag', { tagId, name: 'ruins' })
    committed('AssignTagToNode', { tagId, nodeId })

    const view = query<{ nodes: TagViewNode[] } | null>('getTagView', { tagId })
    expect(view!.nodes[0]).toMatchObject({ id: nodeId, noteId, childCanvasId })
  })
})

describe('listNodeTags (§8.4 charm bar)', () => {
  it('lists a node\'s active tags in name order', () => {
    const nodeId = createNode()
    const inkId = uuidv7()
    const azureId = uuidv7()
    committed('CreateTag', { tagId: inkId, name: 'ink' })
    committed('CreateTag', { tagId: azureId, name: 'azure' })
    committed('AssignTagToNode', { tagId: inkId, nodeId })
    committed('AssignTagToNode', { tagId: azureId, nodeId })
    const tags = query<Array<{ id: string; name: string }>>('listNodeTags', { nodeId })
    expect(tags.map((t) => t.name)).toEqual(['azure', 'ink'])
    expect(query<unknown[]>('listNodeTags', { nodeId: uuidv7() })).toEqual([])
  })
})

describe('getCanvasByNode', () => {
  it('returns the node canvas or null', () => {
    expect(query('getCanvasByNode', { nodeId: handle.rootNodeId })).toMatchObject({
      id: handle.rootCanvasId,
      nodeId: handle.rootNodeId,
    })
    expect(query('getCanvasByNode', { nodeId: createNode() })).toBeNull()
  })
})

describe('canvas cycles (invariants 18–19)', () => {
  it('commits a node placed on its own canvas and walks containment with a visited set', () => {
    const nodeId = createNode()
    const canvasId = uuidv7()
    committed('CreateCanvas', { canvasId, nodeId })
    // Direct self-reference: the node placed on its own canvas.
    createPlacement(nodeId, canvasId)
    // Indirect cycle through the root: root node placed on the node's
    // canvas, node placed on the root canvas.
    createPlacement(handle.rootNodeId, canvasId)
    createPlacement(nodeId, handle.rootCanvasId)

    // getCanvasContents terminates and sees the self-placement.
    const items = query<CanvasContentItem[]>('getCanvasContents', { canvasId })
    expect(items.filter((item) => item.itemKind === 'placement')).toHaveLength(2)

    // Containment walk (invariant 19): visited set, must terminate.
    const visited = new Set<string>()
    const walk = (fromCanvasId: string): void => {
      if (visited.has(fromCanvasId)) return
      visited.add(fromCanvasId)
      const contents = query<CanvasContentItem[]>('getCanvasContents', {
        canvasId: fromCanvasId,
      })
      for (const item of contents) {
        if (item.itemKind !== 'placement') continue
        const child = query<{ id: string } | null>('getCanvasByNode', {
          nodeId: item.nodeId as string,
        })
        if (child) walk(child.id)
      }
    }
    walk(handle.rootCanvasId)
    expect(visited).toEqual(new Set([handle.rootCanvasId, canvasId]))
  })
})

describe('getOutlineTree / listLooseNotes (§14.1, AI-IMP-069)', () => {
  it('projects every active canvas flat with children, labels, and root-level flags', () => {
    // Root holds an image node and a titled canvas node; the nested
    // canvas holds one child. A second canvas rides an UNPLACED node
    // and must surface as root-level.
    const image = createNode()
    const imagePlacement = createPlacement(image)
    committed('SetPlacementCaption', {
      placementId: imagePlacement,
      caption: 'placement display observation',
    })
    const boardNode = createNode()
    const boardNoteId = insertNote('Ruins Board')
    committed('AttachNoteToNode', { nodeId: boardNode, noteId: boardNoteId })
    const boardCanvasId = uuidv7()
    committed('CreateCanvas', { canvasId: boardCanvasId, nodeId: boardNode })
    createPlacement(boardNode)
    const nested = createNode()
    createPlacement(nested, boardCanvasId)
    const strayNode = createNode()
    const strayCanvasId = uuidv7()
    committed('CreateCanvas', { canvasId: strayCanvasId, nodeId: strayNode })
    const tagId = uuidv7()
    committed('CreateTag', { tagId, name: 'ruins' })
    committed('AssignTagToNode', { tagId, nodeId: image })

    const rows = query<Array<Record<string, unknown>>>('getOutlineTree')
    for (const row of rows) {
      // Caption meta is confined to the existing PLACEMENT child row;
      // it never becomes a canvas/root identity field.
      expect(row).not.toHaveProperty('caption')
    }
    const captioned = rows
      .flatMap((row) => row.children as Array<Record<string, unknown>>)
      .find((child) => child.placementId === imagePlacement)
    expect(captioned).toMatchObject({ caption: 'placement display observation' })
    const byCanvas = new Map(rows.map((row) => [row.canvasId as string, row]))
    expect(rows[0]).toMatchObject({ canvasId: handle.rootCanvasId, isRoot: true, isRootLevel: true })

    const root = byCanvas.get(handle.rootCanvasId)!
    const children = root.children as Array<Record<string, unknown>>
    expect(children).toHaveLength(2)
    const imageRow = children.find((c) => c.nodeId === image)!
    expect(imageRow).toMatchObject({
      noteId: null,
      childCanvasId: null,
      placementCount: 1,
      tags: ['ruins'],
    })
    const boardRow = children.find((c) => c.nodeId === boardNode)!
    expect(boardRow).toMatchObject({ noteTitle: 'Ruins Board', childCanvasId: boardCanvasId })

    const board = byCanvas.get(boardCanvasId)!
    expect(board).toMatchObject({ label: 'Ruins Board', isRoot: false, isRootLevel: false })
    expect(board.children as unknown[]).toHaveLength(1)

    // The unplaced-node canvas is root-level with a short-code label.
    const stray = byCanvas.get(strayCanvasId)!
    expect(stray).toMatchObject({ isRoot: false, isRootLevel: true })
    expect(typeof stray.label).toBe('string')
    expect((stray.label as string).length).toBeGreaterThan(0)
  })

  it('a cyclic containment pair projects each canvas exactly once (cycles are view work)', () => {
    const nodeId = createNode()
    const canvasId = uuidv7()
    committed('CreateCanvas', { canvasId, nodeId })
    createPlacement(nodeId, handle.rootCanvasId)
    createPlacement(handle.rootNodeId, canvasId) // cycle back to root

    const rows = query<Array<Record<string, unknown>>>('getOutlineTree')
    expect(rows.map((row) => row.canvasId).sort()).toEqual(
      [handle.rootCanvasId, canvasId].sort(),
    )
    const child = (rows.find((row) => row.canvasId === canvasId)!.children as Array<
      Record<string, unknown>
    >)[0]!
    expect(child.childCanvasId).toBe(handle.rootCanvasId)
  })

  it('excludes trashed placements, nodes, and canvases from the projection', () => {
    const nodeId = createNode()
    const placementId = createPlacement(nodeId)
    const trashedCanvasNode = createNode()
    const trashedCanvasId = uuidv7()
    committed('CreateCanvas', { canvasId: trashedCanvasId, nodeId: trashedCanvasNode })
    handle.db.run("UPDATE placement SET lifecycle_state = 'trashed' WHERE id = ?", placementId)
    handle.db.run("UPDATE canvas SET lifecycle_state = 'trashed' WHERE id = ?", trashedCanvasId)

    const rows = query<Array<Record<string, unknown>>>('getOutlineTree')
    expect(rows.map((row) => row.canvasId)).toEqual([handle.rootCanvasId])
    expect(rows[0]!.children as unknown[]).toEqual([])
  })

  it('listLooseNotes: unattached active notes only, once each', () => {
    const looseId = insertNote('Adrift')
    const attachedId = insertNote('Attached')
    const unplacedNode = createNode()
    committed('AttachNoteToNode', { nodeId: unplacedNode, noteId: attachedId })
    const trashedId = insertNote('Gone')
    handle.db.run("UPDATE note SET lifecycle_state = 'trashed' WHERE id = ?", trashedId)

    // 'Attached' rides an (unplaced) node: it belongs to the node
    // library's unplaced rows, not here — never listed twice.
    const rows = query<Array<{ id: string; title: string }>>('listLooseNotes')
    expect(rows).toEqual([{ id: looseId, title: 'Adrift' }])
  })
})

describe('outliner control-panel read models (AI-IMP-273)', () => {
  it('previews node and loose-note targets without a renderer waterfall', () => {
    const assetId = insertImageAsset('a'.repeat(64), 'north-cliffs.png')
    const noteId = insertNote('North cliffs', 'x'.repeat(300))
    const nodeId = createNode()
    committed('AttachNoteToNode', { nodeId, noteId })
    committed('SetNodeAppearance', {
      nodeId,
      appearance: { kind: 'image', assetId, crop: null },
    })
    const placementId = createPlacement(nodeId)
    const tagId = uuidv7()
    committed('CreateTag', { tagId, name: 'region' })
    committed('AssignTagToNode', { tagId, nodeId })

    expect(query('getOutlinePreview', { kind: 'node', nodeId })).toMatchObject({
      targetKind: 'node',
      nodeId,
      noteId,
      noteTitle: 'North cliffs',
      noteExcerpt: 'x'.repeat(240),
      appearanceKind: 'image',
      assetContentHash: 'a'.repeat(64),
      assetFilename: 'north-cliffs.png',
      childCanvasId: null,
      childCount: 0,
      placementCount: 1,
      tags: ['region'],
      places: [{ placementId, canvasId: handle.rootCanvasId, canvasLabel: 'Home' }],
    })

    const looseNoteId = insertNote('Loose prose', 'still useful')
    expect(query('getOutlinePreview', { kind: 'note', noteId: looseNoteId })).toEqual({
      targetKind: 'note',
      nodeId: null,
      noteId: looseNoteId,
      noteTitle: 'Loose prose',
      noteExcerpt: 'still useful',
      appearanceKind: null,
      appearanceColor: null,
      appearanceIcon: null,
      assetContentHash: null,
      assetFilename: null,
      childCanvasId: null,
      childCount: 0,
      placementCount: 0,
      tags: [],
      places: [],
    })
    expect(query('getOutlinePreview', { kind: 'note', noteId: uuidv7() })).toBeNull()
  })

  it('carries placement-local captions only as existing tree-row display meta', () => {
    const nodeId = createNode()
    const first = createPlacement(nodeId)
    const second = createPlacement(nodeId)
    committed('SetPlacementCaption', { placementId: first, caption: 'left study' })
    committed('SetPlacementCaption', { placementId: second, caption: 'right study' })

    const tree = query<OutlineCanvasRow[]>('getOutlineTree')
    const rows = tree.flatMap((canvas) => canvas.children).filter((row) => row.nodeId === nodeId)
    expect(rows.map((row) => ({ placementId: row.placementId, caption: row.caption }))).toEqual([
      { placementId: first, caption: 'left study' },
      { placementId: second, caption: 'right study' },
    ])
    // Two placements remain two ordinary placement rows: caption text
    // creates no entry and changes no identity/count projection.
    expect(rows).toHaveLength(2)
  })

  it('extends tree and unplaced-library rows with honest naming facts', () => {
    const imageId = createNode()
    const assetId = insertImageAsset('b'.repeat(64), 'harbor.png')
    committed('SetNodeAppearance', {
      nodeId: imageId,
      appearance: { kind: 'image', assetId, crop: null },
    })
    createPlacement(imageId)

    const boardNodeId = createNode()
    const boardCanvasId = uuidv7()
    committed('CreateCanvas', { canvasId: boardCanvasId, nodeId: boardNodeId })
    createPlacement(boardNodeId)
    createPlacement(createNode(), boardCanvasId)

    const root = query<OutlineCanvasRow[]>('getOutlineTree').find((row) => row.isRoot)!
    expect(root.label).toBe('Home')
    expect(root.childCount).toBe(2)
    expect(root.children.find((row) => row.nodeId === imageId)).toMatchObject({
      assetContentHash: 'b'.repeat(64),
      assetFilename: 'harbor.png',
      boardChildCount: 0,
    })
    expect(root.children.find((row) => row.nodeId === boardNodeId)).toMatchObject({
      childCanvasId: boardCanvasId,
      boardChildCount: 1,
    })
    expect(query<OutlineCanvasRow[]>('getOutlineTree').find((row) => row.canvasId === boardCanvasId))
      .toMatchObject({ label: 'unnamed · 1 items', childCount: 1 })

    const looseImageId = createNode()
    const looseAssetId = insertImageAsset('c'.repeat(64), 'loose.png')
    committed('SetNodeAppearance', {
      nodeId: looseImageId,
      appearance: { kind: 'image', assetId: looseAssetId, crop: null },
    })
    const loose = query<Array<Record<string, unknown>>>('listNodeLibrary', {
      filter: 'unplaced',
    }).find((row) => row.id === looseImageId)
    expect(loose).toMatchObject({
      assetContentHash: 'c'.repeat(64),
      assetFilename: 'loose.png',
      childCanvasId: null,
      boardChildCount: 0,
    })
  })

  it('counts the independent cleanup axes without counting the protected root', () => {
    const orphanDot = createNode()
    committed('SetNodeAppearance', {
      nodeId: orphanDot,
      appearance: { kind: 'dot', color: 'accent' },
    })
    createPlacement(orphanDot)

    const taggedImage = createNode()
    const imageNote = insertNote('Mapped image')
    committed('AttachNoteToNode', { nodeId: taggedImage, noteId: imageNote })
    const taggedAsset = insertImageAsset('d'.repeat(64))
    committed('SetNodeAppearance', {
      nodeId: taggedImage,
      appearance: { kind: 'image', assetId: taggedAsset, crop: null },
    })
    createPlacement(taggedImage)
    const tagId = uuidv7()
    committed('CreateTag', { tagId, name: 'mapped' })
    committed('AssignTagToNode', { tagId, nodeId: taggedImage })

    const unplacedIcon = createNode()
    const iconNote = insertNote('Unplaced icon')
    committed('AttachNoteToNode', { nodeId: unplacedIcon, noteId: iconNote })
    committed('SetNodeAppearance', {
      nodeId: unplacedIcon,
      appearance: { kind: 'icon', icon: 'star' },
    })
    insertNote('Loose note')

    expect(query('getOutlineFacetCounts')).toEqual({
      all: 4,
      unplaced: 2,
      orphans: 1,
      disconnected: 3,
      untagged: 2,
    })
  })

  it('treats a trashed attached note as orphaned and every non-board node as taggable', () => {
    const nodeId = createNode() // The default/null appearance is still a pin.
    const noteId = insertNote('Temporarily gone')
    committed('AttachNoteToNode', { nodeId, noteId })
    createPlacement(nodeId)
    handle.db.run("UPDATE note SET lifecycle_state = 'trashed' WHERE id = ?", noteId)

    expect(query('getOutlineFacetCounts')).toEqual({
      all: 1,
      unplaced: 0,
      orphans: 1,
      disconnected: 1,
      untagged: 1,
    })
  })

  it('returns a render-order filmstrip with honest glyphs and a remainder', () => {
    const boardNodeId = createNode()
    const boardCanvasId = uuidv7()
    committed('CreateCanvas', { canvasId: boardCanvasId, nodeId: boardNodeId })

    const imageNodeId = createNode()
    const assetId = insertImageAsset('e'.repeat(64), 'first.png')
    committed('SetNodeAppearance', {
      nodeId: imageNodeId,
      appearance: { kind: 'image', assetId, crop: null },
    })
    const imagePlacementId = createPlacement(imageNodeId, boardCanvasId)
    const jobId = uuidv7()
    const now = new Date().toISOString()
    handle.db.run(
      `INSERT INTO derivative_jobs (id, asset_id, kind, state, created_at, updated_at)
       VALUES (?, ?, 'thumbnail', 'done', ?, ?)`,
      jobId,
      assetId,
      now,
      now,
    )

    const dotNodeId = createNode()
    committed('SetNodeAppearance', {
      nodeId: dotNodeId,
      appearance: { kind: 'dot', color: 'accent' },
    })
    const dotPlacementId = createPlacement(dotNodeId, boardCanvasId)
    for (let i = 0; i < 4; i += 1) createPlacement(createNode(), boardCanvasId)
    createDecoration(boardCanvasId) // Decorations are not node children.

    expect(query('getBoardFilmstrip', { canvasId: boardCanvasId, limit: 2 })).toEqual({
      canvasId: boardCanvasId,
      items: [
        {
          kind: 'image',
          placementId: imagePlacementId,
          nodeId: imageNodeId,
          renderOrder: 1024,
          label: 'first.png',
          contentHash: 'e'.repeat(64),
          filename: 'first.png',
          thumbnailReady: true,
        },
        {
          kind: 'glyph',
          placementId: dotPlacementId,
          nodeId: dotNodeId,
          renderOrder: 2048,
          label: 'untitled node',
          appearanceKind: 'dot',
          appearanceColor: 'accent',
          appearanceIcon: null,
        },
      ],
      totalCount: 6,
      remainderCount: 4,
    })
    expect(query('getBoardFilmstrip', { canvasId: uuidv7() })).toBeNull()
  })

  it('distinguishes nested-board glyphs, empty boards, and pending thumbnails', () => {
    const boardNodeId = createNode()
    const boardCanvasId = uuidv7()
    committed('CreateCanvas', { canvasId: boardCanvasId, nodeId: boardNodeId })
    expect(query('getBoardFilmstrip', { canvasId: boardCanvasId })).toEqual({
      canvasId: boardCanvasId,
      items: [],
      totalCount: 0,
      remainderCount: 0,
    })

    const nestedNodeId = createNode()
    const nestedCanvasId = uuidv7()
    committed('CreateCanvas', { canvasId: nestedCanvasId, nodeId: nestedNodeId })
    createPlacement(createNode(), nestedCanvasId)
    const nestedPlacementId = createPlacement(nestedNodeId, boardCanvasId)

    const imageNodeId = createNode()
    const assetId = insertImageAsset('f'.repeat(64), 'waiting.png')
    committed('SetNodeAppearance', {
      nodeId: imageNodeId,
      appearance: { kind: 'image', assetId, crop: null },
    })
    createPlacement(imageNodeId, boardCanvasId)
    const now = new Date().toISOString()
    for (const [state, suffix] of [
      ['done', 'done'],
      ['queued', 'queued'],
    ] as const) {
      handle.db.run(
        `INSERT INTO derivative_jobs (id, asset_id, kind, state, created_at, updated_at)
         VALUES (?, ?, 'thumbnail', ?, ?, ?)`,
        `${uuidv7()}-${suffix}`,
        assetId,
        state,
        now,
        now,
      )
    }

    const strip = query<BoardFilmstrip>('getBoardFilmstrip', { canvasId: boardCanvasId })
    expect(strip.items[0]).toEqual({
      kind: 'glyph',
      placementId: nestedPlacementId,
      nodeId: nestedNodeId,
      renderOrder: expect.any(Number),
      label: 'unnamed · 1 items',
      appearanceKind: 'board',
      appearanceColor: null,
      appearanceIcon: null,
    })
    expect(strip.items[1]).toMatchObject({
      kind: 'image',
      label: 'waiting.png',
      thumbnailReady: false,
    })
  })
})

describe('acceptance: shared note, tags, interleaved reorder (RFC slice 5-9)', () => {
  it('runs the full AI-IMP-012 scenario at service level', () => {
    // GIVEN a note attached to node X placed twice on the root canvas.
    const noteId = insertNote('Person', 'generic lore')
    const nodeX = createNode()
    committed('AttachNoteToNode', { nodeId: nodeX, noteId })
    createPlacement(nodeX)
    createPlacement(nodeX)

    // WHEN node Y attaches the same note and is placed once.
    const nodeY = createNode()
    committed('AttachNoteToNode', { nodeId: nodeY, noteId })
    createPlacement(nodeY)

    // THEN the note lists two referencing nodes.
    const referents = () =>
      handle.db.all<{ id: string }>('SELECT id FROM node WHERE note_id = ?', noteId)
    expect(referents().map((r) => r.id).sort()).toEqual([nodeX, nodeY].sort())

    // Detaching from X leaves Y bound and the note active.
    committed('DetachNoteFromNode', { nodeId: nodeX })
    expect(referents().map((r) => r.id)).toEqual([nodeY])
    expect(handle.db.get('SELECT lifecycle_state FROM note WHERE id = ?', noteId)).toMatchObject({
      lifecycle_state: 'active',
    })

    // WHEN tags "injured" and "scout" are assigned to X only.
    const injured = uuidv7()
    const scout = uuidv7()
    committed('CreateTag', { tagId: injured, name: 'injured' })
    committed('CreateTag', { tagId: scout, name: 'scout' })
    committed('AssignTagToNode', { tagId: injured, nodeId: nodeX })
    committed('AssignTagToNode', { tagId: scout, nodeId: nodeX })

    // THEN Y's tag list is empty and the injured view returns X with
    // placement count 2.
    const library = query<Array<{ id: string; tags: string[] }>>('listNodeLibrary')
    expect(library.find((row) => row.id === nodeY)!.tags).toEqual([])
    expect(library.find((row) => row.id === nodeX)!.tags).toEqual(['injured', 'scout'])
    const view = query<{ nodes: Array<Record<string, unknown>> }>('getTagView', {
      tagId: injured,
    })
    expect(view.nodes).toHaveLength(1)
    expect(view.nodes[0]).toMatchObject({ id: nodeX, placementCount: 2 })

    // WHEN a decoration and a placement are interleaved by reorder
    // commands until keys rebalance.
    const anchor = createPlacement(nodeX)
    const ceiling = createDecoration()
    let previous = ceiling
    const wedged: string[] = []
    for (let i = 0; i < 60; i += 1) {
      const id = i % 2 === 0 ? createDecoration() : createPlacement(nodeY)
      committed('ReorderContent', {
        canvasId: handle.rootCanvasId,
        itemId: id,
        afterId: anchor,
        beforeId: previous,
      })
      wedged.push(id)
      previous = id
    }

    // THEN visible order is unchanged and total order stays
    // deterministic (strictly increasing keys, no ties).
    const contents = query<CanvasContentItem[]>('getCanvasContents', {
      canvasId: handle.rootCanvasId,
    })
    const ids = contents.map((item) => item.id)
    const anchorIndex = ids.indexOf(anchor)
    expect(ids.slice(anchorIndex)).toEqual([anchor, ...[...wedged].reverse(), ceiling])
    const keys = contents.map((item) => item.renderOrder)
    for (let i = 1; i < keys.length; i += 1) {
      expect(keys[i]!).toBeGreaterThan(keys[i - 1]!)
    }
  })
})

describe('getCanvasScene', () => {
  function insertAsset(contentHash: string, width = 640, height = 480): string {
    const assetId = uuidv7()
    const now = new Date().toISOString()
    handle.db.run(
      `INSERT INTO asset (id, project_id, kind, content_hash, original_filename,
                          mime_type, width, height, storage_path, created_at, updated_at)
       VALUES (?, ?, 'image', ?, 'pic.png', 'image/png', ?, ?, ?, ?, ?)`,
      assetId,
      handle.projectId,
      contentHash,
      width,
      height,
      `assets/${contentHash}`,
      now,
      now,
    )
    return assetId
  }

  it('projects placements with appearance, note title, and image-asset addressing', () => {
    const nodeId = createNode()
    const assetId = insertAsset('a'.repeat(64), 800, 600)
    committed('SetNodeAppearance', {
      nodeId,
      appearance: { kind: 'image', assetId, crop: null },
    })
    const noteId = insertNote('Harbor Study')
    handle.db.run('UPDATE node SET note_id = ? WHERE id = ?', noteId, nodeId)
    const placementId = createPlacement(nodeId)
    committed('SetPlacementCaption', { placementId, caption: 'Local observation' })

    const scene = query<CanvasScene>('getCanvasScene', { canvasId: handle.rootCanvasId })
    expect(scene.canvasId).toBe(handle.rootCanvasId)
    expect(scene.camera).toEqual({ x: 0, y: 0, zoom: 1 })
    const item = scene.items.find((i) => i.id === placementId)!
    expect(item).toMatchObject({
      itemKind: 'placement',
      nodeId,
      appearanceKind: 'image',
      appearanceAssetId: assetId,
      noteTitle: 'Harbor Study',
      caption: 'Local observation',
      assetContentHash: 'a'.repeat(64),
      assetMimeType: 'image/png',
      assetWidth: 800,
      assetHeight: 600,
      labelVisible: 1,
    })
  })

  it('carries noteId and childCanvasId for the §8.4 hint charms', () => {
    const nodeId = createNode()
    const noteId = insertNote('Keep Interior')
    handle.db.run('UPDATE node SET note_id = ? WHERE id = ?', noteId, nodeId)
    const placementId = createPlacement(nodeId)

    let scene = query<CanvasScene>('getCanvasScene', { canvasId: handle.rootCanvasId })
    let item = scene.items.find((i) => i.id === placementId)!
    expect(item).toMatchObject({ noteId, childCanvasId: null })

    const childCanvasId = uuidv7()
    committed('CreateCanvas', { canvasId: childCanvasId, nodeId })
    scene = query<CanvasScene>('getCanvasScene', { canvasId: handle.rootCanvasId })
    item = scene.items.find((i) => i.id === placementId)!
    expect(item).toMatchObject({ noteId, childCanvasId })
  })

  it('projects card placements with title, clamped excerpt, and default size (§4.6 rev 0.31)', () => {
    const nodeId = createNode()
    const noteId = insertNote('Harbor Study', 'x'.repeat(200))
    handle.db.run('UPDATE node SET note_id = ? WHERE id = ?', noteId, nodeId)
    committed('SetNodeAppearance', { nodeId, appearance: { kind: 'card' } })
    const placementId = createPlacement(nodeId)

    const scene = query<CanvasScene>('getCanvasScene', { canvasId: handle.rootCanvasId })
    const item = scene.items.find((i) => i.id === placementId)!
    expect(item).toMatchObject({
      appearanceKind: 'card',
      noteTitle: 'Harbor Study',
      // The gallery's 140-char clamp idiom (queries-gallery).
      noteExcerpt: 'x'.repeat(140),
      // Unsized card placements read the fixed chrome's default so
      // the hit box IS the card rect (mirrors the engine constants).
      width: 260,
      height: 160,
    })
  })

  it('keeps explicit card sizes and sends no excerpt for non-card nodes', () => {
    const cardNode = createNode()
    const cardNote = insertNote('Sized Card', 'body text')
    handle.db.run('UPDATE node SET note_id = ? WHERE id = ?', cardNote, cardNode)
    committed('SetNodeAppearance', { nodeId: cardNode, appearance: { kind: 'card' } })
    const sizedId = uuidv7()
    committed('CreatePlacement', {
      placementId: sizedId,
      canvasId: handle.rootCanvasId,
      nodeId: cardNode,
      width: 400,
      height: 250,
    })

    const dotNode = createNode()
    const dotNote = insertNote('Plain Dot', 'never excerpted')
    handle.db.run('UPDATE node SET note_id = ? WHERE id = ?', dotNote, dotNode)
    committed('SetNodeAppearance', { nodeId: dotNode, appearance: { kind: 'dot', color: '#abc' } })
    const dotId = createPlacement(dotNode)

    const scene = query<CanvasScene>('getCanvasScene', { canvasId: handle.rootCanvasId })
    expect(scene.items.find((i) => i.id === sizedId)).toMatchObject({
      appearanceKind: 'card',
      width: 400,
      height: 250,
    })
    expect(scene.items.find((i) => i.id === dotId)).toMatchObject({
      appearanceKind: 'dot',
      noteExcerpt: null,
      width: null,
      height: null,
    })
  })

  it('projects the phantom card: card appearance, no note (§7.2)', () => {
    const nodeId = createNode()
    committed('SetNodeAppearance', { nodeId, appearance: { kind: 'card' } })
    const placementId = createPlacement(nodeId)
    const scene = query<CanvasScene>('getCanvasScene', { canvasId: handle.rootCanvasId })
    expect(scene.items.find((i) => i.id === placementId)).toMatchObject({
      appearanceKind: 'card',
      noteId: null,
      noteTitle: null,
      noteExcerpt: null,
      width: 260,
      height: 160,
    })
  })

  it('keeps the shared render order across placements and decorations', () => {
    const nodeId = createNode()
    const p1 = createPlacement(nodeId)
    const d1 = createDecoration()
    const p2 = createPlacement(nodeId)
    const scene = query<CanvasScene>('getCanvasScene', { canvasId: handle.rootCanvasId })
    expect(scene.items.map((i) => i.id)).toEqual([p1, d1, p2])
    const keys = scene.items.map((i) => i.renderOrder)
    for (let i = 1; i < keys.length; i += 1) expect(keys[i]!).toBeGreaterThan(keys[i - 1]!)
  })

  it('returns null for a trashed canvas and hides trashed-node placements', () => {
    const nodeId = createNode()
    createPlacement(nodeId)
    handle.db.run("UPDATE node SET lifecycle_state = 'trashed' WHERE id = ?", nodeId)
    const scene = query<CanvasScene>('getCanvasScene', { canvasId: handle.rootCanvasId })
    expect(scene.items).toEqual([])

    // Root canvases are trigger-protected; trash an ordinary one.
    const ownerNode = createNode()
    const canvasId = uuidv7()
    committed('CreateCanvas', { canvasId, nodeId: ownerNode })
    handle.db.run("UPDATE canvas SET lifecycle_state = 'trashed' WHERE id = ?", canvasId)
    expect(query<CanvasScene | null>('getCanvasScene', { canvasId })).toBe(null)
  })

  it('refuses a board whose OWNER node is trashed, restores with it (§9.6)', () => {
    const ownerNode = createNode()
    const canvasId = uuidv7()
    committed('CreateCanvas', { canvasId, nodeId: ownerNode })
    // Active owner: the board projects normally.
    expect(query<CanvasScene | null>('getCanvasScene', { canvasId })).not.toBe(null)
    // §9.6: trashing the owner node (canvas row stays active) excludes
    // the owned board from ordinary rendering, exactly like a direct
    // canvas trash.
    committed('TrashNode', { nodeId: ownerNode })
    expect(handle.db.get<{ lifecycle_state: string }>(
      'SELECT lifecycle_state FROM canvas WHERE id = ?',
      canvasId,
    )!.lifecycle_state).toBe('active')
    expect(query<CanvasScene | null>('getCanvasScene', { canvasId })).toBe(null)
    // The root canvas (owned by the trigger-protected root node) is
    // never refused by the owner-node predicate.
    expect(query<CanvasScene | null>('getCanvasScene', { canvasId: handle.rootCanvasId })).not.toBe(
      null,
    )
    // Restoring the aggregate root revives the board (§9.6).
    committed('RestoreRecord', { kind: 'node', id: ownerNode })
    expect(query<CanvasScene | null>('getCanvasScene', { canvasId })).not.toBe(null)
  })

  it('exposes the background with color beneath and drops trashed background assets', () => {
    const assetId = insertAsset('b'.repeat(64))
    committed('SetCanvasBackgroundColor', {
      canvasId: handle.rootCanvasId,
      color: '#223344',
    })
    committed('SetCanvasBackground', {
      canvasId: handle.rootCanvasId,
      assetId,
      settings: { x: 10, y: 20, fit: 'cover' },
    })
    let scene = query<CanvasScene>('getCanvasScene', { canvasId: handle.rootCanvasId })
    expect(scene.background).toEqual({
      color: '#223344',
      assetId,
      assetContentHash: 'b'.repeat(64),
      assetMimeType: 'image/png',
      assetWidth: 640,
      assetHeight: 480,
      settings: { x: 10, y: 20, fit: 'cover' },
    })

    // Invariant-13 analogue: a trashed background asset stops being
    // addressable but the color survives.
    handle.db.run("UPDATE asset SET lifecycle_state = 'trashed' WHERE id = ?", assetId)
    scene = query<CanvasScene>('getCanvasScene', { canvasId: handle.rootCanvasId })
    expect(scene.background).toEqual({
      color: '#223344',
      assetId: null,
      assetContentHash: null,
      assetMimeType: null,
      assetWidth: null,
      assetHeight: null,
      settings: null,
    })
  })
})

describe('listTags', () => {
  it('lists active tags with active-node usage counts, name-key ordered', () => {
    const zebra = uuidv7()
    const apple = uuidv7()
    committed('CreateTag', { tagId: zebra, name: 'Zebra' })
    committed('CreateTag', { tagId: apple, name: 'apple' })
    const nodeId = createNode()
    committed('AssignTagToNode', { tagId: zebra, nodeId })

    let tags = query<Array<{ id: string; name: string; nodeCount: number }>>('listTags')
    expect(tags.map((t) => t.name)).toEqual(['apple', 'Zebra'])
    expect(tags.find((t) => t.id === zebra)!.nodeCount).toBe(1)
    expect(tags.find((t) => t.id === apple)!.nodeCount).toBe(0)

    // Trashed nodes stop counting; trashed tags stop listing.
    handle.db.run("UPDATE node SET lifecycle_state = 'trashed' WHERE id = ?", nodeId)
    handle.db.run("UPDATE tag SET lifecycle_state = 'trashed' WHERE id = ?", apple)
    tags = query<Array<{ id: string; nodeCount: number }>>('listTags')
    expect(tags).toHaveLength(1)
    expect(tags[0]!.nodeCount).toBe(0)
  })
})

describe('listBookmarks (§8.1)', () => {
  function seedCanvas(): string {
    const nodeId = createNode()
    const canvasId = uuidv7()
    committed('CreateCanvas', { canvasId, nodeId })
    return canvasId
  }

  it('returns rows in menu order with parsed viewports and joined target state', () => {
    const alive = seedCanvas()
    const doomedTrash = seedCanvas()
    const doomedPurge = seedCanvas()
    const first = uuidv7()
    const second = uuidv7()
    const third = uuidv7()
    committed('CreateBookmark', {
      bookmarkId: first,
      canvasId: alive,
      label: 'Harbor',
      viewport: { x: 5, y: 6, zoom: 1.5 },
    })
    committed('CreateBookmark', {
      bookmarkId: second,
      canvasId: doomedTrash,
      label: 'Keep',
      viewport: null,
    })
    committed('CreateBookmark', {
      bookmarkId: third,
      canvasId: doomedPurge,
      label: 'Ruin',
      viewport: null,
    })

    committed('TrashCanvas', { canvasId: doomedTrash })
    committed('TrashCanvas', { canvasId: doomedPurge })
    committed('PurgeRecord', { kind: 'canvas', id: doomedPurge })

    // Degradation is explicit, never a silent vanish: all three rows
    // list, each with its target state, in one query (no N+1).
    const rows = query<BookmarkListRow[]>('listBookmarks')
    expect(rows.map((r) => [r.id, r.targetState])).toEqual([
      [first, 'active'],
      [second, 'trashed'],
      [third, 'purged'],
    ])
    expect(rows[0]!.viewport).toEqual({ x: 5, y: 6, zoom: 1.5 })
    expect(rows[0]!).toMatchObject({
      targetKind: 'canvas',
      canvasId: alive,
      label: 'unnamed · 0 items',
    })
    expect(rows[1]!).toMatchObject({ label: 'Keep', viewport: null })
    expect(rows[2]!).toMatchObject({ label: 'Ruin' })

    // Restore revalidates the bookmark with no user action (§8.1:
    // stable ids — no bookmark write happened at all).
    committed('RestoreRecord', { kind: 'canvas', id: doomedTrash })
    const after = query<BookmarkListRow[]>('listBookmarks')
    expect(after.find((r) => r.id === second)).toMatchObject({
      targetState: 'active',
      label: 'unnamed · 0 items',
    })
  })

  it('degrades a bookmark whose OWNER node is trashed, restoring the node (§9.6)', () => {
    const nodeId = createNode()
    const canvasId = uuidv7()
    committed('CreateCanvas', { canvasId, nodeId })
    const bookmarkId = uuidv7()
    committed('CreateBookmark', { bookmarkId, canvasId, label: 'Owned', viewport: null })

    // Active owner: ordinary active row, nothing to restore.
    let row = query<BookmarkListRow[]>('listBookmarks').find((r) => r.id === bookmarkId)!
    expect(row).toMatchObject({ targetState: 'active', trashedKind: null, ownerNodeId: nodeId })

    // §9.6: trashing the owner node degrades the bookmark to In Trash
    // (canvas row still active) and names the NODE as the restore
    // target — a canvas restore could not revive a trashed owner.
    committed('TrashNode', { nodeId })
    row = query<BookmarkListRow[]>('listBookmarks').find((r) => r.id === bookmarkId)!
    expect(row).toMatchObject({ targetState: 'trashed', trashedKind: 'node', ownerNodeId: nodeId })

    // Restoring the aggregate root revalidates the bookmark (§8.1
    // stable ids — no bookmark write).
    committed('RestoreRecord', { kind: 'node', id: nodeId })
    row = query<BookmarkListRow[]>('listBookmarks').find((r) => r.id === bookmarkId)!
    expect(row).toMatchObject({ targetState: 'active', trashedKind: null })
  })

  it('names the canvas as the restore target for a directly-trashed board', () => {
    const nodeId = createNode()
    const canvasId = uuidv7()
    committed('CreateCanvas', { canvasId, nodeId })
    const bookmarkId = uuidv7()
    committed('CreateBookmark', { bookmarkId, canvasId, label: 'Direct', viewport: null })
    committed('TrashCanvas', { canvasId })
    const row = query<BookmarkListRow[]>('listBookmarks').find((r) => r.id === bookmarkId)!
    expect(row).toMatchObject({ targetState: 'trashed', trashedKind: 'canvas' })
  })

  it('reflects reorder: row order (the Mod+1-n binding) follows sort keys', () => {
    const canvasId = seedCanvas()
    const a = uuidv7()
    const b = uuidv7()
    committed('CreateBookmark', { bookmarkId: a, canvasId, label: 'A', viewport: null })
    committed('CreateBookmark', { bookmarkId: b, canvasId, label: 'B', viewport: null })
    expect(query<BookmarkListRow[]>('listBookmarks').map((r) => r.id)).toEqual([a, b])
    committed('ReorderBookmark', { bookmarkId: b, afterId: null, beforeId: a })
    expect(query<BookmarkListRow[]>('listBookmarks').map((r) => r.id)).toEqual([b, a])
  })
})

describe('getNodeLocations (§8.3 asset-row expansion, AI-IMP-073)', () => {
  it('returns label, appearance, and placement locations with tag-view label conventions', () => {
    // Board B owned by a titled node; the subject node is placed on
    // the root board AND on board B.
    const ownerNode = createNode()
    const ownerNote = insertNote('Ruins Board')
    committed('AttachNoteToNode', { nodeId: ownerNode, noteId: ownerNote })
    const boardB = uuidv7()
    committed('CreateCanvas', { canvasId: boardB, nodeId: ownerNode })

    const nodeId = createNode()
    const noteId = insertNote('Watcher')
    committed('AttachNoteToNode', { nodeId, noteId })
    const pRoot = createPlacement(nodeId)
    const pB = createPlacement(nodeId, boardB)

    const locations = query<NodeLocations | null>('getNodeLocations', { nodeId })
    expect(locations).not.toBeNull()
    expect(locations!.label).toBe('Watcher')
    expect(locations!.noteId).toBe(noteId)
    expect(locations!.appearanceKind).toBeNull() // bare CreateNode: no appearance
    const byId = new Map(locations!.placements.map((p) => [p.placementId, p]))
    expect(byId.get(pRoot)!.canvasLabel).toBe('Home')
    expect(byId.get(pB)!.canvasLabel).toBe('Ruins Board')
    expect(byId.get(pB)!.canvasId).toBe(boardB)
  })

  it('an unplaced node is a row with empty placements and the canonical untitled fallback', () => {
    const nodeId = createNode()
    const locations = query<NodeLocations | null>('getNodeLocations', { nodeId })
    expect(locations).not.toBeNull()
    expect(locations!.placements).toEqual([])
    expect(locations!.label).toBe('untitled node')
    expect(locations!.noteId).toBeNull()
  })

  it('excludes trashed placements and returns null for a trashed or unknown node', () => {
    const nodeId = createNode()
    const placementId = createPlacement(nodeId)
    handle.db.run("UPDATE placement SET lifecycle_state = 'trashed' WHERE id = ?", placementId)
    expect(query<NodeLocations | null>('getNodeLocations', { nodeId })!.placements).toEqual([])

    handle.db.run("UPDATE node SET lifecycle_state = 'trashed' WHERE id = ?", nodeId)
    expect(query<NodeLocations | null>('getNodeLocations', { nodeId })).toBeNull()
    expect(query<NodeLocations | null>('getNodeLocations', { nodeId: uuidv7() })).toBeNull()
  })
})

// §9.6 (AI-IMP-163): trashing a node flips the NODE ROW ALONE — its
// owned canvas row stays 'active'. Every structural read model that
// surfaces a board's content must re-check the owner (the load-bearing
// join getCanvasScene already carries), so an owner-trashed board hides
// exactly like a directly-trashed one, and RestoreRecord brings it back.
// Seeded through real commands (CreateCanvas / CreatePlacement /
// TrashNode / RestoreRecord) — never a direct lifecycle UPDATE.
describe('owner-trashed boards hide their content (§9.6, AI-IMP-163)', () => {
  function board(ownerNodeId: string): string {
    const canvasId = uuidv7()
    committed('CreateCanvas', { canvasId, nodeId: ownerNodeId })
    return canvasId
  }
  function trashNode(nodeId: string): void {
    committed('TrashNode', { nodeId })
  }
  function restoreNode(nodeId: string): void {
    committed('RestoreRecord', { kind: 'node', id: nodeId })
  }

  it('getCanvasContents renders nothing for an owner-trashed board, restore revives it', () => {
    const owner = createNode()
    const boardCanvas = board(owner)
    const content = createNode()
    const placementId = createPlacement(content, boardCanvas)

    const shown = () =>
      query<CanvasContentItem[]>('getCanvasContents', { canvasId: boardCanvas }).map((i) => i.id)
    expect(shown()).toEqual([placementId])
    trashNode(owner)
    expect(shown()).toEqual([])
    restoreNode(owner)
    expect(shown()).toEqual([placementId])
  })

  it('listNodeLibrary placement counts drop the owner-trashed board; unplaced filter picks it up', () => {
    const owner = createNode()
    const boardCanvas = board(owner)
    const content = createNode()
    createPlacement(content, boardCanvas)

    const countOf = (nodeId: string) =>
      (
        query<Array<Record<string, unknown>>>('listNodeLibrary').find((r) => r.id === nodeId) as
          | { placementCount: number }
          | undefined
      )?.placementCount
    const unplacedIds = () =>
      query<Array<Record<string, unknown>>>('listNodeLibrary', { filter: 'unplaced' }).map(
        (r) => r.id,
      )

    expect(countOf(content)).toBe(1)
    expect(unplacedIds()).not.toContain(content)
    trashNode(owner)
    expect(countOf(content)).toBe(0)
    expect(unplacedIds()).toContain(content)
    restoreNode(owner)
    expect(countOf(content)).toBe(1)
    expect(unplacedIds()).not.toContain(content)
  })

  it('getTagView drops placement locations and counts on an owner-trashed board', () => {
    const owner = createNode()
    const boardCanvas = board(owner)
    const content = createNode()
    createPlacement(content, boardCanvas)
    const tagId = uuidv7()
    committed('CreateTag', { tagId, name: 'scout' })
    committed('AssignTagToNode', { tagId, nodeId: content })

    const viewNode = () =>
      (query<{ nodes: TagViewNode[] }>('getTagView', { tagId }).nodes.find(
        (n) => n.id === content,
      ) as TagViewNode)
    expect(viewNode().placements.map((p) => p.canvasId)).toEqual([boardCanvas])
    expect(viewNode().placementCount).toBe(1)
    trashNode(owner)
    expect(viewNode().placements).toEqual([])
    expect(viewNode().placementCount).toBe(0)
    restoreNode(owner)
    expect(viewNode().placements.map((p) => p.canvasId)).toEqual([boardCanvas])
    expect(viewNode().placementCount).toBe(1)
  })

  it('getNodeLocations omits the owner-trashed board location', () => {
    const owner = createNode()
    const boardCanvas = board(owner)
    const content = createNode()
    createPlacement(content, boardCanvas)

    const canvasIds = () =>
      query<NodeLocations | null>('getNodeLocations', { nodeId: content })!.placements.map(
        (p) => p.canvasId,
      )
    expect(canvasIds()).toEqual([boardCanvas])
    trashNode(owner)
    expect(canvasIds()).toEqual([])
    restoreNode(owner)
    expect(canvasIds()).toEqual([boardCanvas])
  })

  it('getOutlineTree placement counts exclude placements on owner-trashed boards', () => {
    const owner = createNode()
    const boardCanvas = board(owner)
    const content = createNode()
    // content is a child of Home (visible outline row) AND placed on the
    // board owned by `owner`; the outline count must follow the owner.
    createPlacement(content, handle.rootCanvasId)
    createPlacement(content, boardCanvas)

    const homeCount = () => {
      const home = query<OutlineCanvasRow[]>('getOutlineTree').find((c) => c.isRoot)!
      return home.children.find((ch) => ch.nodeId === content)!.placementCount
    }
    expect(homeCount()).toBe(2)
    trashNode(owner)
    expect(homeCount()).toBe(1)
    restoreNode(owner)
    expect(homeCount()).toBe(2)
  })
})
