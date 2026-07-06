import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { shortCode, titleKey, uuidv7 } from '@ew/domain'
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
import {
  registerStructureQueries,
  type BookmarkListRow,
  type CanvasContentItem,
  type CanvasScene,
  type NodeLocations,
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
  rmSync(dir, { recursive: true, force: true })
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
      placementCount: 2,
      tags: ['scout'],
    })
    expect(byId.get(unplaced)).toMatchObject({ noteTitle: null, placementCount: 0, tags: [] })
    expect(byId.has(handle.rootNodeId)).toBe(true)

    // Unplaced is a legitimate durable state, filterable.
    const filtered = query<Array<Record<string, unknown>>>('listNodeLibrary', {
      filter: 'unplaced',
    })
    const ids = filtered.map((row) => row.id)
    expect(ids).toContain(unplaced)
    expect(ids).not.toContain(placed)
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
    createPlacement(image)
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
    expect(rows[0]!).toMatchObject({ targetKind: 'canvas', canvasId: alive, label: 'Harbor' })
    expect(rows[1]!.viewport).toBeNull()

    // Restore revalidates the bookmark with no user action (§8.1:
    // stable ids — no bookmark write happened at all).
    committed('RestoreRecord', { kind: 'canvas', id: doomedTrash })
    const after = query<BookmarkListRow[]>('listBookmarks')
    expect(after.find((r) => r.id === second)!.targetState).toBe('active')
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

  it('an unplaced node is a row with empty placements; a noteless node labels by short code', () => {
    const nodeId = createNode()
    const locations = query<NodeLocations | null>('getNodeLocations', { nodeId })
    expect(locations).not.toBeNull()
    expect(locations!.placements).toEqual([])
    expect(locations!.label).toBe(shortCode(nodeId))
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
