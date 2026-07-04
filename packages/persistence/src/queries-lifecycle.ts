import type { TrashRetention } from '@ew/commands'
import type { QueryRegistry } from './queries'

/**
 * Lifecycle read models (RFC-0001 §9, AI-IMP-013): the Trash view
 * (§9.1), the impact summaries deletion confirmations show
 * (§9.4–§9.6), Empty Trash eligibility (§9.7), and the retention
 * setting (§9.1, default Never).
 */

export interface TrashEntry {
  id: string
  trashedAt: string | null
  trashedByCommandId: string | null
}

export interface TrashView {
  notes: Array<TrashEntry & { title: string }>
  nodes: Array<TrashEntry & { noteId: string | null; noteTitle: string | null }>
  canvases: Array<TrashEntry & { nodeId: string }>
}

/** §9.4: what Delete Note Everywhere reports before confirmation. */
export interface NoteImpact {
  noteId: string
  title: string
  referencingNodeIds: string[]
  inboundLinkCount: number
  outboundLinkCount: number
  /** The note has no nodes and exists only as text. */
  textOnly: boolean
}

/** §9.5: what Delete Canvas reports before confirmation. */
export interface CanvasImpact {
  canvasId: string
  placementCount: number
  decorationCount: number
  referencedNodeCount: number
  /** Nodes whose only active placements sit on this canvas. */
  newlyUnplacedCount: number
  /** Of the newly unplaced: no note, no tags, no owned canvas. */
  newlyUnplacedBareCount: number
}

/** §9.6: what Delete Node reports before confirmation. */
export interface NodeImpact {
  nodeId: string
  noteId: string | null
  placementCount: number
  tagCount: number
  ownedCanvasId: string | null
  ownedCanvasPlacementCount: number
  ownedCanvasDecorationCount: number
}

export interface EmptyTrashEntry {
  kind: 'note' | 'node' | 'canvas'
  id: string
  label: string | null
  trashedAt: string | null
}

const TRASH_STAMPS = `trashed_at AS trashedAt, trashed_by_command_id AS trashedByCommandId`

export function registerLifecycleQueries(registry: QueryRegistry): void {
  // §9.1: Trash is a query view over records in the trashed lifecycle
  // state, grouped by kind. Aggregate members preserved under a
  // trashed parent (e.g. a trashed node's placements) stay active
  // rows and are intentionally not listed — restore or purge operates
  // on the parent record.
  registry.register('getTrashView', (ctx): TrashView => {
    const notes = ctx.db.all<TrashEntry & { title: string }>(
      `SELECT id, title, ${TRASH_STAMPS}
       FROM note WHERE project_id = ? AND lifecycle_state = 'trashed'
       ORDER BY trashed_at, id`,
      ctx.projectId,
    )
    const nodes = ctx.db.all<TrashEntry & { noteId: string | null; noteTitle: string | null }>(
      `SELECT n.id, n.note_id AS noteId, note.title AS noteTitle,
              n.trashed_at AS trashedAt, n.trashed_by_command_id AS trashedByCommandId
       FROM node n LEFT JOIN note ON note.id = n.note_id
       WHERE n.project_id = ? AND n.lifecycle_state = 'trashed'
       ORDER BY n.trashed_at, n.id`,
      ctx.projectId,
    )
    const canvases = ctx.db.all<TrashEntry & { nodeId: string }>(
      `SELECT id, node_id AS nodeId, ${TRASH_STAMPS}
       FROM canvas WHERE project_id = ? AND lifecycle_state = 'trashed'
       ORDER BY trashed_at, id`,
      ctx.projectId,
    )
    return { notes, nodes, canvases }
  })

  registry.register('getNoteImpact', (ctx, args): NoteImpact | null => {
    const { noteId } = args as { noteId: string }
    const note = ctx.db.get<{ id: string; title: string }>(
      'SELECT id, title FROM note WHERE id = ? AND project_id = ?',
      noteId,
      ctx.projectId,
    )
    if (!note) return null
    const referencingNodeIds = ctx.db
      .all<{ id: string }>('SELECT id FROM node WHERE note_id = ? ORDER BY id', noteId)
      .map((row) => row.id)
    const counts = ctx.db.get<{ inbound: number; outbound: number }>(
      `SELECT
         (SELECT count(*) FROM link
          WHERE target_note_id = ?1 AND state = 'bound' AND source_note_id <> ?1) AS inbound,
         (SELECT count(*) FROM link WHERE source_note_id = ?1) AS outbound`,
      noteId,
    )!
    return {
      noteId: note.id,
      title: note.title,
      referencingNodeIds,
      inboundLinkCount: counts.inbound,
      outboundLinkCount: counts.outbound,
      textOnly: referencingNodeIds.length === 0,
    }
  })

  registry.register('getCanvasImpact', (ctx, args): CanvasImpact | null => {
    const { canvasId } = args as { canvasId: string }
    const canvas = ctx.db.get<{ id: string }>(
      'SELECT id FROM canvas WHERE id = ? AND project_id = ?',
      canvasId,
      ctx.projectId,
    )
    if (!canvas) return null
    const counts = ctx.db.get<{ placements: number; decorations: number; nodes: number }>(
      `SELECT
         (SELECT count(*) FROM placement
          WHERE canvas_id = ?1 AND lifecycle_state = 'active') AS placements,
         (SELECT count(*) FROM decoration
          WHERE canvas_id = ?1 AND lifecycle_state = 'active') AS decorations,
         (SELECT count(DISTINCT node_id) FROM placement
          WHERE canvas_id = ?1 AND lifecycle_state = 'active') AS nodes`,
      canvasId,
    )!
    // §9.5: nodes that would become unplaced — all their other active
    // placements (if any) also sit on this canvas — and how many of
    // those are bare (no note, tags, or owned canvas; their remaining
    // placements are exactly the ones this canvas preserves).
    const newlyUnplaced = ctx.db.all<{ id: string; bare: number }>(
      `SELECT n.id,
              (CASE WHEN n.note_id IS NULL
                     AND NOT EXISTS (SELECT 1 FROM tag_assignment ta WHERE ta.node_id = n.id)
                     AND NOT EXISTS (SELECT 1 FROM canvas c WHERE c.node_id = n.id)
                    THEN 1 ELSE 0 END) AS bare
       FROM node n
       WHERE n.lifecycle_state = 'active'
         AND EXISTS (SELECT 1 FROM placement p
                     WHERE p.node_id = n.id AND p.canvas_id = ?1
                       AND p.lifecycle_state = 'active')
         AND NOT EXISTS (SELECT 1 FROM placement p
                         WHERE p.node_id = n.id AND p.canvas_id <> ?1
                           AND p.lifecycle_state = 'active')`,
      canvasId,
    )
    return {
      canvasId,
      placementCount: counts.placements,
      decorationCount: counts.decorations,
      referencedNodeCount: counts.nodes,
      newlyUnplacedCount: newlyUnplaced.length,
      newlyUnplacedBareCount: newlyUnplaced.filter((n) => n.bare === 1).length,
    }
  })

  registry.register('getNodeImpact', (ctx, args): NodeImpact | null => {
    const { nodeId } = args as { nodeId: string }
    const node = ctx.db.get<{ id: string; note_id: string | null }>(
      'SELECT id, note_id FROM node WHERE id = ? AND project_id = ?',
      nodeId,
      ctx.projectId,
    )
    if (!node) return null
    const ownedCanvas = ctx.db.get<{ id: string }>(
      'SELECT id FROM canvas WHERE node_id = ?',
      nodeId,
    )
    const counts = ctx.db.get<{ placements: number; tags: number }>(
      `SELECT
         (SELECT count(*) FROM placement
          WHERE node_id = ?1 AND lifecycle_state = 'active') AS placements,
         (SELECT count(*) FROM tag_assignment WHERE node_id = ?1) AS tags`,
      nodeId,
    )!
    const canvasCounts = ownedCanvas
      ? ctx.db.get<{ placements: number; decorations: number }>(
          `SELECT
             (SELECT count(*) FROM placement
              WHERE canvas_id = ?1 AND lifecycle_state = 'active') AS placements,
             (SELECT count(*) FROM decoration
              WHERE canvas_id = ?1 AND lifecycle_state = 'active') AS decorations`,
          ownedCanvas.id,
        )!
      : { placements: 0, decorations: 0 }
    return {
      nodeId: node.id,
      noteId: node.note_id,
      placementCount: counts.placements,
      tagCount: counts.tags,
      ownedCanvasId: ownedCanvas?.id ?? null,
      ownedCanvasPlacementCount: canvasCounts.placements,
      ownedCanvasDecorationCount: canvasCounts.decorations,
    }
  })

  // §9.7: what Empty Trash would purge — every trashed record, so the
  // impact summary can be shown before purging them all. Retention
  // scheduling (EPIC-007) filters this by trashed_at age.
  registry.register('getEmptyTrashEligibility', (ctx): EmptyTrashEntry[] => {
    return ctx.db.all<EmptyTrashEntry>(
      `SELECT 'note' AS kind, id, title AS label, trashed_at AS trashedAt
       FROM note WHERE project_id = ?1 AND lifecycle_state = 'trashed'
       UNION ALL
       SELECT 'node' AS kind, n.id, note.title AS label, n.trashed_at AS trashedAt
       FROM node n LEFT JOIN note ON note.id = n.note_id
       WHERE n.project_id = ?1 AND n.lifecycle_state = 'trashed'
       UNION ALL
       SELECT 'canvas' AS kind, id, NULL AS label, trashed_at AS trashedAt
       FROM canvas WHERE project_id = ?1 AND lifecycle_state = 'trashed'
       ORDER BY trashedAt, id`,
      ctx.projectId,
    )
  })

  // §9.1: automatic permanent deletion defaults to Never; written via
  // the SetTrashRetention command.
  registry.register('getTrashRetention', (ctx): TrashRetention => {
    const row = ctx.db.get<{ value: string }>(
      "SELECT value FROM settings WHERE project_id = ? AND key = 'trash_retention'",
      ctx.projectId,
    )
    return row ? (JSON.parse(row.value) as TrashRetention) : 'never'
  })
}
