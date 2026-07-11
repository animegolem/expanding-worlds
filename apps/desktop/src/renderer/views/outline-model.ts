/**
 * Pure view model for the outliner grammar (AI-IMP-274). The
 * persistence projections deliberately stay transport-shaped; this
 * module owns path expansion, facet flattening, calm badges, and the
 * identity-free naming fallbacks used by the renderer.
 */

export type OutlineFacet = 'all' | 'unplaced' | 'orphans' | 'disconnected' | 'untagged'

export interface OutlineChild {
  placementId: string
  nodeId: string
  renderOrder: number
  appearanceKind: string | null
  appearanceColor: string | null
  appearanceIcon: string | null
  noteId: string | null
  noteTitle: string | null
  childCanvasId: string | null
  placementCount: number
  tags: string[]
  assetContentHash?: string | null
  assetFilename?: string | null
  boardChildCount?: number
}

export interface OutlineCanvas {
  canvasId: string
  nodeId: string
  label: string
  isRoot: boolean
  isRootLevel: boolean
  children: OutlineChild[]
  childCount?: number
}

export interface OutlineLibraryNode {
  id: string
  noteId: string | null
  noteTitle: string | null
  appearanceKind: string | null
  appearanceColor: string | null
  appearanceIcon: string | null
  placementCount: number
  tags: string[]
  childCanvasId?: string | null
  assetContentHash?: string | null
  assetFilename?: string | null
  boardChildCount?: number
}

export interface OutlineLooseNote {
  id: string
  title: string
}

export type { OutlineSelection } from './outline-types'
import type { OutlineSelection } from './outline-types'

export interface OutlineDisplayName {
  text: string
  fallback: 'none' | 'image' | 'board' | 'node' | 'note'
}

interface NamingFacts {
  noteTitle?: string | null
  assetFilename?: string | null
  childCanvasId?: string | null
  boardChildCount?: number
  looseNoteTitle?: string | null
}

/** Grammar §4: a raw identity is never a display-name fallback. */
export function outlineDisplayName(facts: NamingFacts): OutlineDisplayName {
  const noteTitle = facts.noteTitle?.trim()
  if (noteTitle) return { text: noteTitle, fallback: 'none' }
  const looseTitle = facts.looseNoteTitle?.trim()
  if (looseTitle) return { text: looseTitle, fallback: 'none' }
  if (facts.childCanvasId) {
    const count = facts.boardChildCount ?? 0
    return { text: `unnamed · ${count} items`, fallback: 'board' }
  }
  const filename = facts.assetFilename?.trim()
  if (filename) return { text: filename, fallback: 'image' }
  if (facts.looseNoteTitle !== undefined) return { text: 'untitled note', fallback: 'note' }
  return { text: 'untitled node', fallback: 'node' }
}

export type OutlineRowKind = 'root' | 'board' | 'pin' | 'image' | 'alias' | 'bin' | 'note'

export interface OutlineViewRow {
  key: string
  kind: OutlineRowKind
  glyph: string
  title: string
  titleFallback: OutlineDisplayName['fallback']
  depth: number
  path: string
  tags: string[]
  loose: boolean
  orphan: boolean
  untagged: boolean
  placementCount: number
  selection: OutlineSelection
  node?: OutlineChild | OutlineLibraryNode
  note?: OutlineLooseNote
  canvas?: OutlineCanvas
  aliasCanvasId?: string
  branchKey?: string
  canFold: boolean
  expanded: boolean
}

/** Grammar §3: looseness and orphanhood always read; the third
 * axis only itches while a cleanup worklist is active. */
export function outlineBadges(
  row: Pick<OutlineViewRow, 'loose' | 'orphan' | 'untagged'>,
  cleanupActive: boolean,
): string[] {
  return [
    row.loose ? '·loose' : '',
    row.orphan ? '·orphan' : '',
    cleanupActive && row.untagged ? '·untagged' : '',
  ].filter(Boolean)
}

export interface BuildOutlineRowsOptions {
  canvases: OutlineCanvas[]
  unplacedNodes: OutlineLibraryNode[]
  looseNotes: OutlineLooseNote[]
  facet: OutlineFacet
  query: string
  expanded: Readonly<Record<string, boolean>>
}

function nodeKind(node: Pick<OutlineChild, 'assetContentHash' | 'appearanceKind'>): 'image' | 'pin' {
  return node.assetContentHash || node.appearanceKind === 'image' ? 'image' : 'pin'
}

function matchesFacet(row: OutlineViewRow, facet: OutlineFacet): boolean {
  if (facet === 'all') return true
  if (facet === 'unplaced') return row.loose
  if (facet === 'orphans') return row.orphan
  if (facet === 'disconnected') return row.loose || row.orphan
  return row.untagged
}

function matchesQuery(row: OutlineViewRow, query: string): boolean {
  const needle = query.trim().toLocaleLowerCase()
  return needle.length === 0 || row.title.toLocaleLowerCase().includes(needle)
}

/** Build either the structural tree or the flat cleanup/search worklist. */
export function buildOutlineRows(options: BuildOutlineRowsOptions): OutlineViewRow[] {
  const { canvases, unplacedNodes, looseNotes, facet, expanded } = options
  const flat = facet !== 'all' || options.query.trim().length > 0
  const byCanvas = new Map(canvases.map((canvas) => [canvas.canvasId, canvas]))
  const roots = canvases.filter((canvas) => canvas.isRootLevel)
  const rootNodeId = canvases.find((canvas) => canvas.isRoot)?.nodeId ?? null
  const structural: OutlineViewRow[] = []

  const childRow = (
    child: OutlineChild,
    depth: number,
    path: string[],
    branchKey: string,
    ancestry: string[],
  ): void => {
    const cyclic = child.childCanvasId !== null && ancestry.includes(child.childCanvasId)
    const nested = child.childCanvasId && !cyclic ? byCanvas.get(child.childCanvasId) : undefined
    const name = outlineDisplayName(child)
    const kind: OutlineRowKind = cyclic ? 'alias' : nested ? 'board' : nodeKind(child)
    const row: OutlineViewRow = {
      key: branchKey,
      kind,
      glyph: cyclic ? '↗' : nested ? '⬚' : nodeKind(child) === 'image' ? '▣' : '◯',
      title: name.text,
      titleFallback: name.fallback,
      depth,
      path: path.join(' / '),
      tags: child.tags,
      loose: false,
      orphan: child.noteId === null,
      untagged: !nested && child.tags.length === 0,
      placementCount: child.placementCount,
      selection: {
        key: branchKey,
        kind: child.childCanvasId ? 'board' : 'node',
        nodeId: child.nodeId,
        noteId: child.noteId,
        canvasId: nested?.canvasId ?? null,
        label: name.text,
        tags: child.tags,
        placementCount: child.placementCount,
        sourcePlacement: {
          placementId: child.placementId,
          canvasId: ancestry.at(-1)!,
          canvasLabel: path.at(-1) ?? 'Home',
        },
        hasNote: child.noteId !== null,
        isLoose: false,
        isOrphan: child.noteId === null,
        appearanceKind: child.appearanceKind,
      },
      node: child,
      ...(nested ? { canvas: nested } : {}),
      ...(cyclic ? { aliasCanvasId: child.childCanvasId! } : {}),
      branchKey,
      canFold: !!nested && nested.children.length > 0 && !flat,
      expanded: expanded[branchKey] ?? false,
    }
    structural.push(row)
    if (nested && (flat || row.expanded)) {
      for (const nestedChild of [...nested.children].sort((a, b) => a.renderOrder - b.renderOrder)) {
        childRow(
          nestedChild,
          depth + 1,
          [...path, name.text],
          `${branchKey}/${nestedChild.placementId}`,
          [...ancestry, nested.canvasId],
        )
      }
    }
  }

  for (const canvas of roots) {
    // A root-level non-root canvas is an unplaced board. Merge its
    // owner facts from the node-library projection so the tree row
    // does not lose badges/tags merely because it is represented by
    // its canvas in the structural projection.
    const owner = unplacedNodes.find((node) => node.id === canvas.nodeId)
    const looseOwner = canvas.isRoot ? undefined : owner
    const rootName = canvas.isRoot
      ? { text: canvas.label || 'home', fallback: 'none' as const }
      : canvas.label.startsWith('unnamed · ')
        ? { text: canvas.label, fallback: 'board' as const }
        : outlineDisplayName({
            noteTitle: canvas.label,
            childCanvasId: canvas.canvasId,
            boardChildCount: canvas.childCount ?? canvas.children.length,
          })
    const branchKey = canvas.canvasId
    const row: OutlineViewRow = {
      key: `canvas:${canvas.canvasId}`,
      kind: canvas.isRoot ? 'root' : 'board',
      glyph: canvas.isRoot ? '⌂' : '⬚',
      title: rootName.text,
      titleFallback: rootName.fallback,
      depth: 0,
      path: '',
      tags: owner?.tags ?? [],
      loose: !canvas.isRoot,
      orphan: looseOwner?.noteId === null,
      untagged: false,
      placementCount: 0,
      selection: {
        key: `canvas:${canvas.canvasId}`,
        kind: canvas.isRoot ? 'root' : 'board',
        nodeId: canvas.nodeId,
        noteId: owner?.noteId ?? null,
        canvasId: canvas.canvasId,
        label: rootName.text,
        tags: owner?.tags ?? [],
        placementCount: 0,
        sourcePlacement: null,
        hasNote: owner?.noteId != null,
        isLoose: !canvas.isRoot,
        isOrphan: !canvas.isRoot && looseOwner?.noteId === null,
        appearanceKind: owner?.appearanceKind ?? null,
      },
      canvas,
      branchKey,
      canFold: canvas.children.length > 0 && !flat,
      expanded: expanded[branchKey] ?? true,
    }
    structural.push(row)
    if (flat || row.expanded) {
      for (const child of [...canvas.children].sort((a, b) => a.renderOrder - b.renderOrder)) {
        childRow(child, 1, [rootName.text], `${branchKey}/${child.placementId}`, [canvas.canvasId])
      }
    }
  }

  const binRow: OutlineViewRow = {
    key: 'bin',
    kind: 'bin',
    glyph: '⊘',
    title: 'loose',
    titleFallback: 'none',
    depth: 0,
    path: '',
    tags: [],
    loose: false,
    orphan: false,
    untagged: false,
    placementCount: 0,
    selection: {
      key: 'bin',
      kind: 'bin',
      nodeId: null,
      noteId: null,
      canvasId: null,
      label: 'loose',
      tags: [],
      placementCount: 0,
      sourcePlacement: null,
      hasNote: false,
      isLoose: false,
      isOrphan: false,
      appearanceKind: null,
    },
    branchKey: 'bin',
    canFold: unplacedNodes.length + looseNotes.length > 0 && !flat,
    expanded: expanded['bin'] ?? true,
  }
  structural.push(binRow)
  if (flat || binRow.expanded) {
    for (const node of unplacedNodes) {
      if (node.id === rootNodeId || canvases.some((canvas) => canvas.nodeId === node.id)) continue
      const name = outlineDisplayName(node)
      const kind = node.childCanvasId ? 'board' : nodeKind(node)
      structural.push({
        key: `loose-node:${node.id}`,
        kind,
        glyph: kind === 'board' ? '⬚' : kind === 'image' ? '▣' : '◯',
        title: name.text,
        titleFallback: name.fallback,
        depth: 1,
        path: 'loose',
        tags: node.tags,
        loose: true,
        orphan: node.noteId === null,
        untagged: kind !== 'board' && node.tags.length === 0,
        placementCount: 0,
        selection: {
          key: `loose-node:${node.id}`,
          kind: node.childCanvasId ? 'board' : 'node',
          nodeId: node.id,
          noteId: node.noteId,
          canvasId: node.childCanvasId ?? null,
          label: name.text,
          tags: node.tags,
          placementCount: 0,
          sourcePlacement: null,
          hasNote: node.noteId !== null,
          isLoose: true,
          isOrphan: node.noteId === null,
          appearanceKind: node.appearanceKind,
        },
        node,
        canFold: false,
        expanded: false,
      })
    }
    for (const note of looseNotes) {
      const name = outlineDisplayName({ looseNoteTitle: note.title })
      structural.push({
        key: `loose-note:${note.id}`,
        kind: 'note',
        glyph: '¶',
        title: name.text,
        titleFallback: name.fallback,
        depth: 1,
        path: 'loose',
        tags: [],
        loose: true,
        orphan: false,
        untagged: false,
        placementCount: 0,
        selection: {
          key: `loose-note:${note.id}`,
          kind: 'note',
          nodeId: null,
          noteId: note.id,
          canvasId: null,
          label: name.text,
          tags: [],
          placementCount: 0,
          sourcePlacement: null,
          hasNote: true,
          isLoose: true,
          isOrphan: false,
          appearanceKind: null,
        },
        note,
        canFold: false,
        expanded: false,
      })
    }
  }

  if (!flat) return structural
  return structural.filter(
    (row) => row.kind !== 'root' && row.kind !== 'bin' && row.kind !== 'alias' && matchesFacet(row, facet) && matchesQuery(row, options.query),
  )
}
