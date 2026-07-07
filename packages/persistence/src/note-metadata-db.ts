import {
  composeNoteBody,
  shortCode,
  stripMetadataBlock,
  type MetadataSectionsInput,
} from '@ew/domain'
import type { CommandContext } from './dispatcher'
import { usableCanvasOwnerJoin } from './queries-structure'
import { getProjectSetting } from './settings'

/**
 * Live metadata computation and lazy block refresh (RFC-0001 §7.8,
 * AI-IMP-119). The in-app card ALWAYS computes live through
 * {@link computeNoteMetadata}; the persisted block refreshes lazily —
 * only when the system already touches the note body (rename re-keying
 * today, export/backup when EPIC-008 lands) — through
 * {@link refreshNoteMetadataBlock}. Both share one read model so the
 * card and the exported block never disagree about the data, only
 * about freshness.
 */

/** Query context (a command context minus `now`) or a full command
 * context — both carry the fields the read model needs. */
type ReadCtx = Omit<CommandContext, 'now'>

export interface NoteMetadataBoard {
  canvasId: string
  label: string
  isRoot: boolean
  depth: number
  count: number
  /** Fly-to targets for the card; the block renders label + count only. */
  placements: Array<{ placementId: string; x: number; y: number }>
}

export interface NoteMetadataProvenance {
  nodeId: string
  originalFilename: string
  /** Plain YYYY-MM-DD (the asset's import instant, date only). */
  importDate: string
  sourceUrl: string | null
}

export interface NoteMetadataView {
  noteId: string
  boards: NoteMetadataBoard[]
  provenance: NoteMetadataProvenance[]
  timestamps: { created: string; modified: string }
}

/** Effective per-note gating: whether the note carries a block at all
 * (per-note toggle) and which sections are on (global per-section
 * defaults). */
export interface MetadataConfig {
  enabled: boolean
  sections: { placements: boolean; provenance: boolean; timestamps: boolean }
}

export const METADATA_DEFAULTS_KEY = 'note_metadata_defaults'
export function metadataNoteKey(noteId: string): string {
  return `note_metadata_note:${noteId}`
}

/**
 * Read the effective config for a note. Global defaults follow §7.8:
 * Placements ON, Provenance ON, Timestamps OFF. The per-note toggle
 * defaults ON — a note carries its block unless switched off.
 */
export function readMetadataConfig(
  db: ReadCtx['db'],
  projectId: string,
  noteId: string,
): MetadataConfig {
  const defaults = getProjectSetting<Partial<MetadataConfig['sections']>>(
    db,
    projectId,
    METADATA_DEFAULTS_KEY,
    {},
  )
  const per = getProjectSetting<{ enabled?: boolean }>(db, projectId, metadataNoteKey(noteId), {})
  return {
    enabled: per.enabled !== false,
    sections: {
      placements: defaults.placements !== false,
      provenance: defaults.provenance !== false,
      timestamps: defaults.timestamps === true,
    },
  }
}

/**
 * Board containment depths from the root canvas (§7.8 nesting). A
 * canvas P contains canvas C when a node owning C is placed on P; BFS
 * from the root canvas assigns each reachable board its shortest
 * distance. Containment is a graph with legal cycles (invariant 19),
 * so the walk carries a visited set and never recurses.
 */
function boardDepths(ctx: ReadCtx): Map<string, number> {
  const edges = ctx.db.all<{ parent: string; child: string }>(
    `SELECT p.canvas_id AS parent, child.id AS child
     FROM placement p
     JOIN node n ON n.id = p.node_id AND n.lifecycle_state = 'active'
     JOIN canvas pc ON pc.id = p.canvas_id AND pc.lifecycle_state = 'active'
     ${usableCanvasOwnerJoin('pc', 'pco')}
     JOIN canvas child ON child.node_id = n.id AND child.lifecycle_state = 'active'
     WHERE p.project_id = ? AND p.lifecycle_state = 'active'`,
    ctx.projectId,
  )
  const adjacency = new Map<string, string[]>()
  for (const { parent, child } of edges) {
    const list = adjacency.get(parent)
    if (list) list.push(child)
    else adjacency.set(parent, [child])
  }
  const depth = new Map<string, number>([[ctx.rootCanvasId, 0]])
  let frontier = [ctx.rootCanvasId]
  while (frontier.length > 0) {
    const next: string[] = []
    for (const canvasId of frontier) {
      const d = depth.get(canvasId)!
      for (const child of adjacency.get(canvasId) ?? []) {
        if (!depth.has(child)) {
          depth.set(child, d + 1)
          next.push(child)
        }
      }
    }
    frontier = next
  }
  return depth
}

/**
 * The live metadata read model for one note: its nodes' placements
 * grouped by board (with nesting depth and per-board counts), the
 * provenance of every image-backed node attached to it, and the note's
 * own timestamps. Returns null when the note is absent or inactive.
 */
export function computeNoteMetadata(ctx: ReadCtx, noteId: string): NoteMetadataView | null {
  const note = ctx.db.get<{ id: string; createdAt: string; updatedAt: string }>(
    `SELECT id, created_at AS createdAt, updated_at AS updatedAt
     FROM note WHERE id = ? AND project_id = ? AND lifecycle_state = 'active'`,
    noteId,
    ctx.projectId,
  )
  if (!note) return null

  const placementRows = ctx.db.all<{
    placementId: string
    x: number
    y: number
    canvasId: string
    canvasNodeId: string
    canvasTitle: string | null
  }>(
    `SELECT p.id AS placementId, p.x, p.y, p.canvas_id AS canvasId,
            c.node_id AS canvasNodeId, cnote.title AS canvasTitle
     FROM node n
     JOIN placement p ON p.node_id = n.id AND p.lifecycle_state = 'active'
     JOIN canvas c ON c.id = p.canvas_id AND c.lifecycle_state = 'active'
     ${usableCanvasOwnerJoin('c', 'owner')}
     LEFT JOIN note cnote ON cnote.id = owner.note_id AND cnote.lifecycle_state = 'active'
     WHERE n.project_id = ? AND n.note_id = ? AND n.lifecycle_state = 'active'
     ORDER BY p.canvas_id, p.id`,
    ctx.projectId,
    noteId,
  )

  const depth = boardDepths(ctx)
  const boards = new Map<string, NoteMetadataBoard>()
  for (const row of placementRows) {
    const isRoot = row.canvasId === ctx.rootCanvasId
    let board = boards.get(row.canvasId)
    if (!board) {
      board = {
        canvasId: row.canvasId,
        label: row.canvasTitle ?? (isRoot ? 'Home' : shortCode(row.canvasNodeId)),
        isRoot,
        depth: depth.get(row.canvasId) ?? 0,
        count: 0,
        placements: [],
      }
      boards.set(row.canvasId, board)
    }
    board.count += 1
    board.placements.push({ placementId: row.placementId, x: row.x, y: row.y })
  }

  const provenance = ctx.db
    .all<{
      nodeId: string
      originalFilename: string
      sourceUrl: string | null
      createdAt: string
    }>(
      `SELECT n.id AS nodeId, a.original_filename AS originalFilename,
              a.source_url AS sourceUrl, a.created_at AS createdAt
       FROM node n
       JOIN asset a ON a.id = n.appearance_asset_id AND a.lifecycle_state = 'active'
       WHERE n.project_id = ? AND n.note_id = ? AND n.lifecycle_state = 'active'
         AND a.kind = 'image'
       ORDER BY n.id`,
      ctx.projectId,
      noteId,
    )
    .map((row) => ({
      nodeId: row.nodeId,
      originalFilename: row.originalFilename,
      importDate: row.createdAt.slice(0, 10),
      sourceUrl: row.sourceUrl,
    }))

  return {
    noteId: note.id,
    // Tree order: shallow boards first, then by label, then by id —
    // stable and human-scannable.
    boards: [...boards.values()].sort(
      (a, b) =>
        a.depth - b.depth ||
        a.label.toLowerCase().localeCompare(b.label.toLowerCase()) ||
        (a.canvasId < b.canvasId ? -1 : a.canvasId > b.canvasId ? 1 : 0),
    ),
    provenance,
    timestamps: { created: note.createdAt.slice(0, 10), modified: note.updatedAt.slice(0, 10) },
  }
}

/** The gated section inputs the pure renderer consumes. */
export function sectionsFor(view: NoteMetadataView, config: MetadataConfig): MetadataSectionsInput {
  const sections: MetadataSectionsInput = {}
  if (config.sections.placements && view.boards.length > 0) {
    sections.placements = view.boards.map((b) => ({ label: b.label, count: b.count, depth: b.depth }))
  }
  if (config.sections.provenance && view.provenance.length > 0) {
    sections.provenance = view.provenance.map((p) => ({
      originalFilename: p.originalFilename,
      importDate: p.importDate,
      sourceUrl: p.sourceUrl,
    }))
  }
  if (config.sections.timestamps) sections.timestamps = view.timestamps
  return sections
}

/**
 * Regenerate (or strip) the persisted metadata block for one note.
 * This is the lazy-refresh entry point (§7.8): called only when the
 * system already rewrites the note body — never on its own, never
 * bumping updated_at (the derived block is a cache, not a user edit,
 * so it must not mark the note modified) — and folded into the calling
 * command's transaction so it earns no separate undo step. Returns
 * true when the body changed.
 */
export function refreshNoteMetadataBlock(ctx: ReadCtx, noteId: string): boolean {
  const note = ctx.db.get<{ id: string; body: string }>(
    `SELECT id, body FROM note WHERE id = ? AND project_id = ? AND lifecycle_state = 'active'`,
    noteId,
    ctx.projectId,
  )
  if (!note) return false

  const config = readMetadataConfig(ctx.db, ctx.projectId, noteId)
  let nextBody: string
  if (!config.enabled) {
    // Toggled off: strip the block at this system touch.
    nextBody = stripMetadataBlock(note.body).prose
  } else {
    const view = computeNoteMetadata(ctx, noteId)
    nextBody = view ? composeNoteBody(note.body, sectionsFor(view, config)) : note.body
  }
  if (nextBody === note.body) return false
  ctx.db.run('UPDATE note SET body = ? WHERE id = ?', nextBody, note.id)
  return true
}
