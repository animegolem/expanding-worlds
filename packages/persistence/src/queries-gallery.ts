import { shortCode } from '@ew/domain'
import type { QueryRegistry } from './queries'

/**
 * Gallery read models (RFC-0001 §14.4, AI-IMP-077): the file-browser
 * projection over the project's nodes. Two queries, split for
 * virtualization: `getGalleryIndex` returns the COMPACT whole-project
 * index (id + timestamp + kind — enough to lay out buckets and rows
 * without hydrating anything), and `getGalleryItems` hydrates a
 * viewport window by id batch. Entries are ordinary nodes — the
 * §14.4 standing guardrail: no gallery-only record kinds.
 *
 * Kind discrimination (image · note · board, rev 0.22) by
 * precedence: a node owning an active canvas is a BOARD (it is a
 * door before it is a picture), an image appearance makes an IMAGE,
 * everything else — noted or bare — renders as a NOTE entry. The
 * root node is excluded: it is the project, not material (§14.1
 * outline precedent).
 */

export type GalleryKind = 'image' | 'note' | 'board'

export interface GalleryIndexEntry {
  nodeId: string
  createdAt: string
  kind: GalleryKind
}

export interface GalleryItem {
  nodeId: string
  kind: GalleryKind
  label: string
  appearanceKind: string | null
  appearanceColor: string | null
  appearanceIcon: string | null
  /** Image appearance's asset hash — the thumb/original URL key. */
  contentHash: string | null
  width: number | null
  height: number | null
  noteId: string | null
  childCanvasId: string | null
}

const KIND_CASE = `CASE
  WHEN EXISTS (
    SELECT 1 FROM canvas c
    WHERE c.node_id = n.id AND c.lifecycle_state = 'active'
  ) THEN 'board'
  WHEN n.appearance_kind = 'image' THEN 'image'
  ELSE 'note'
END`

export function registerGalleryQueries(registry: QueryRegistry): void {
  registry.register('getGalleryIndex', (ctx): GalleryIndexEntry[] => {
    return ctx.db.all<GalleryIndexEntry>(
      `SELECT n.id AS nodeId, n.created_at AS createdAt, ${KIND_CASE} AS kind
       FROM node n
       WHERE n.project_id = ? AND n.lifecycle_state = 'active'
         AND n.id <> ?
       ORDER BY n.created_at DESC, n.id DESC`,
      ctx.projectId,
      ctx.rootNodeId,
    )
  })

  registry.register('getGalleryItems', (ctx, args): GalleryItem[] => {
    const { nodeIds } = (args ?? {}) as { nodeIds?: string[] }
    if (!Array.isArray(nodeIds) || nodeIds.length === 0) return []
    // Callers batch by viewport window (≈ tens); chunk defensively
    // under SQLite's parameter ceiling all the same.
    const out: GalleryItem[] = []
    for (let i = 0; i < nodeIds.length; i += 500) {
      const chunk = nodeIds.slice(i, i + 500)
      const marks = chunk.map(() => '?').join(', ')
      const rows = ctx.db.all<{
        nodeId: string
        kind: GalleryKind
        appearanceKind: string | null
        appearanceColor: string | null
        appearanceIcon: string | null
        noteId: string | null
        noteTitle: string | null
        contentHash: string | null
        width: number | null
        height: number | null
        childCanvasId: string | null
      }>(
        `SELECT n.id AS nodeId, ${KIND_CASE} AS kind,
                n.appearance_kind AS appearanceKind,
                n.appearance_color AS appearanceColor,
                n.appearance_icon AS appearanceIcon,
                n.note_id AS noteId, note.title AS noteTitle,
                a.content_hash AS contentHash, a.width, a.height,
                (SELECT c.id FROM canvas c
                 WHERE c.node_id = n.id AND c.lifecycle_state = 'active'
                 ORDER BY c.id LIMIT 1) AS childCanvasId
         FROM node n
         LEFT JOIN note ON note.id = n.note_id
           AND note.lifecycle_state = 'active'
         LEFT JOIN asset a ON a.id = n.appearance_asset_id
           AND a.lifecycle_state = 'active'
         WHERE n.lifecycle_state = 'active' AND n.id IN (${marks})`,
        ...chunk,
      )
      for (const row of rows) {
        out.push({
          nodeId: row.nodeId,
          kind: row.kind,
          label: row.noteTitle ?? shortCode(row.nodeId),
          appearanceKind: row.appearanceKind,
          appearanceColor: row.appearanceColor,
          appearanceIcon: row.appearanceIcon,
          contentHash: row.kind === 'image' ? row.contentHash : null,
          width: row.width,
          height: row.height,
          noteId: row.noteId,
          childCanvasId: row.childCanvasId,
        })
      }
    }
    // Hand batches back in request order so callers can zip windows.
    const byId = new Map(out.map((item) => [item.nodeId, item]))
    return nodeIds.map((id) => byId.get(id)).filter((i): i is GalleryItem => i !== undefined)
  })
}
