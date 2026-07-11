import { describe, expect, it } from 'vitest'
import {
  buildOutlineRows,
  outlineBadges,
  outlineDisplayName,
  type OutlineCanvas,
  type OutlineLibraryNode,
} from './outline-model'

const bare = (overrides: Partial<OutlineLibraryNode> = {}): OutlineLibraryNode => ({
  id: 'node-id-that-must-never-render',
  noteId: null,
  noteTitle: null,
  appearanceKind: 'dot',
  appearanceColor: null,
  appearanceIcon: null,
  placementCount: 0,
  tags: [],
  ...overrides,
})

describe('outline naming grammar', () => {
  it('uses semantic facts and never falls through to identity', () => {
    expect(outlineDisplayName({ noteTitle: 'Northern reach' })).toEqual({
      text: 'Northern reach',
      fallback: 'none',
    })
    expect(outlineDisplayName({ assetFilename: 'ridge-study.png' })).toEqual({
      text: 'ridge-study.png',
      fallback: 'image',
    })
    expect(outlineDisplayName({ childCanvasId: 'canvas-id', boardChildCount: 3 })).toEqual({
      text: 'unnamed · 3 items',
      fallback: 'board',
    })
    expect(
      outlineDisplayName({
        childCanvasId: 'canvas-id',
        boardChildCount: 1,
        assetFilename: 'board-cover.png',
      }),
    ).toEqual({ text: 'unnamed · 1 items', fallback: 'board' })
    expect(outlineDisplayName({})).toEqual({ text: 'untitled node', fallback: 'node' })
  })
})

describe('outline row grammar', () => {
  const canvases: OutlineCanvas[] = [
    {
      canvasId: 'home-canvas',
      nodeId: 'home-node',
      label: 'Home',
      isRoot: true,
      isRootLevel: true,
      children: [
        {
          placementId: 'placement-a',
          nodeId: 'node-a',
          renderOrder: 1,
          appearanceKind: 'dot',
          appearanceColor: null,
          appearanceIcon: null,
          noteId: null,
          noteTitle: null,
          childCanvasId: null,
          placementCount: 1,
          tags: [],
        },
      ],
    },
  ]

  it('flattens cleanup facets with paths while tree fold state remains external', () => {
    const flat = buildOutlineRows({
      canvases,
      unplacedNodes: [bare()],
      looseNotes: [],
      facet: 'disconnected',
      query: '',
      expanded: { 'home-canvas': false },
    })
    expect(flat.map((row) => [row.title, row.path])).toEqual([
      ['untitled node', 'Home'],
      ['untitled node', 'loose'],
    ])
    const tree = buildOutlineRows({
      canvases,
      unplacedNodes: [bare()],
      looseNotes: [],
      facet: 'all',
      query: '',
      expanded: { 'home-canvas': false },
    })
    expect(tree.map((row) => row.kind)).toEqual(['root', 'bin', 'pin'])
  })

  it('keeps untagged independent from disconnected and marks only pins/images', () => {
    const rows = buildOutlineRows({
      canvases,
      unplacedNodes: [bare({ childCanvasId: 'board', boardChildCount: 2 })],
      looseNotes: [{ id: 'note-id', title: 'Adrift' }],
      facet: 'untagged',
      query: '',
      expanded: {},
    })
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ kind: 'pin', untagged: true, path: 'Home' })
    expect(outlineBadges(rows[0]!, false)).toEqual(['·orphan'])
    expect(outlineBadges(rows[0]!, true)).toEqual(['·orphan', '·untagged'])
  })

  it('treats a root-level non-root canvas as an unplaced board', () => {
    const board: OutlineCanvas = {
      canvasId: 'loose-board-canvas',
      nodeId: 'loose-board-node',
      label: 'unnamed · 2 items',
      isRoot: false,
      isRootLevel: true,
      childCount: 2,
      children: [],
    }
    const rows = buildOutlineRows({
      canvases: [...canvases, board],
      unplacedNodes: [
        bare({
          id: board.nodeId,
          childCanvasId: board.canvasId,
          boardChildCount: 2,
          tags: ['region'],
        }),
      ],
      looseNotes: [],
      facet: 'unplaced',
      query: '',
      expanded: {},
    })
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      kind: 'board',
      title: 'unnamed · 2 items',
      loose: true,
      placementCount: 0,
      tags: ['region'],
    })
  })
})
