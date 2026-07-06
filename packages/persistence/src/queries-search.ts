import { shortCode, titleKey } from '@ew/domain'
import type { QueryRegistry } from './queries'
import { ftsMatchExpression } from './search'

/**
 * Search read models (RFC-0001 §8.3): grouped full-text search over
 * the four fts5 corpora (migration 0003) and title_key quick-open.
 * Trashed records are excluded at query time by joining
 * lifecycle_state — the index never changes on trash/restore.
 */

export interface NoteSearchResult {
  noteId: string
  title: string
  snippet: string
}

export interface TagSearchResult {
  tagId: string
  name: string
}

export interface AssetSearchResult {
  assetId: string
  filename: string
  /** Active nodes whose image appearance uses this asset (§8.3). */
  usingNodeIds: string[]
  /** Active canvases using this asset as background, labeled with
   * the location grammar ('Home' for root, else the owning node's
   * note title ?? short code) so the panel can render them as
   * navigable rows. */
  usingCanvases: Array<{ canvasId: string; canvasLabel: string }>
}

export interface CanvasTextSearchResult {
  decorationId: string
  canvasId: string
  snippet: string
}

export interface SearchResults {
  notes: NoteSearchResult[]
  tags: TagSearchResult[]
  assets: AssetSearchResult[]
  canvasText: CanvasTextSearchResult[]
}

/**
 * §8.3 quick-open entry: a note opens the note pane, a canvas opens
 * in the workspace. For kind 'canvas', id is the canvas-owning node
 * and canvasId the canvas to open.
 */
export interface QuickOpenEntry {
  kind: 'note' | 'canvas'
  id: string
  canvasId?: string
  label: string
}

const SNIPPET_ARGS = `-1, '[', ']', '…', 12`

/** Escape LIKE wildcards so user input matches literally. */
function likePattern(key: string): string {
  return `%${key.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`
}

const EMPTY_RESULTS: SearchResults = { notes: [], tags: [], assets: [], canvasText: [] }

export function registerSearchQueries(registry: QueryRegistry): void {
  registry.register('searchProject', (ctx, args): SearchResults => {
    const { query } = (args ?? {}) as { query?: string }
    const match = ftsMatchExpression(query ?? '')
    if (match === null) return EMPTY_RESULTS

    const notes = ctx.db.all<NoteSearchResult>(
      `SELECT n.id AS noteId, n.title,
              snippet(note_fts, ${SNIPPET_ARGS}) AS snippet
       FROM note_fts
       JOIN note n ON n.rowid = note_fts.rowid
       WHERE note_fts MATCH ?
         AND n.project_id = ? AND n.lifecycle_state = 'active'
       ORDER BY rank`,
      match,
      ctx.projectId,
    )

    const tags = ctx.db.all<TagSearchResult>(
      `SELECT t.id AS tagId, t.name
       FROM tag_fts
       JOIN tag t ON t.rowid = tag_fts.rowid
       WHERE tag_fts MATCH ?
         AND t.project_id = ? AND t.lifecycle_state = 'active'
       ORDER BY rank`,
      match,
      ctx.projectId,
    )

    const assets = ctx.db
      .all<{ assetId: string; filename: string }>(
        `SELECT a.id AS assetId, a.original_filename AS filename
         FROM asset_fts
         JOIN asset a ON a.rowid = asset_fts.rowid
         WHERE asset_fts MATCH ?
           AND a.project_id = ? AND a.lifecycle_state = 'active'
         ORDER BY rank`,
        match,
        ctx.projectId,
      )
      .map((row) => ({
        ...row,
        usingNodeIds: ctx.db
          .all<{ id: string }>(
            `SELECT id FROM node
             WHERE appearance_asset_id = ? AND lifecycle_state = 'active'
             ORDER BY id`,
            row.assetId,
          )
          .map((n) => n.id),
        usingCanvases: ctx.db
          .all<{ id: string; canvasNodeId: string; canvasNoteTitle: string | null; isRoot: number }>(
            `SELECT c.id, c.node_id AS canvasNodeId,
                    cnote.title AS canvasNoteTitle,
                    CASE WHEN c.node_id = pr.root_node_id THEN 1 ELSE 0 END
                      AS isRoot
             FROM canvas c
             JOIN project pr ON pr.id = c.project_id
             LEFT JOIN node cn ON cn.id = c.node_id
             LEFT JOIN note cnote ON cnote.id = cn.note_id
               AND cnote.lifecycle_state = 'active'
             WHERE c.background_asset_id = ? AND c.lifecycle_state = 'active'
             ORDER BY c.id`,
            row.assetId,
          )
          .map((c) => ({
            canvasId: c.id,
            canvasLabel: c.isRoot === 1 ? 'Home' : (c.canvasNoteTitle ?? shortCode(c.canvasNodeId)),
          })),
      }))

    const canvasText = ctx.db.all<CanvasTextSearchResult>(
      `SELECT d.id AS decorationId, d.canvas_id AS canvasId,
              snippet(canvas_text_fts, ${SNIPPET_ARGS}) AS snippet
       FROM canvas_text_fts
       JOIN decoration d ON d.rowid = canvas_text_fts.rowid
       JOIN canvas c ON c.id = d.canvas_id AND c.lifecycle_state = 'active'
       WHERE canvas_text_fts MATCH ?
         AND d.project_id = ? AND d.lifecycle_state = 'active'
       ORDER BY rank`,
      match,
      ctx.projectId,
    )

    return { notes, tags, assets, canvasText }
  })

  // §8.3: title_key match over active notes and canvas-owning active
  // nodes. No phantoms (they live only in link records, never queried
  // here) and no trashed records. A canvas-owning node without an
  // active note has no title; it is addressable by its short code
  // (§4.11) instead.
  registry.register('quickOpen', (ctx, args): QuickOpenEntry[] => {
    const { query } = (args ?? {}) as { query?: string }
    const raw = (query ?? '').trim()
    if (raw.length === 0) return []
    const key = titleKey(raw)
    const pattern = likePattern(key)
    const codeNeedle = raw.toLowerCase()

    const entries: QuickOpenEntry[] = ctx.db
      .all<{ id: string; title: string }>(
        `SELECT id, title FROM note
         WHERE project_id = ? AND lifecycle_state = 'active'
           AND title_key LIKE ? ESCAPE '\\'`,
        ctx.projectId,
        pattern,
      )
      .map((row) => ({ kind: 'note' as const, id: row.id, label: row.title }))

    const canvasNodes = ctx.db.all<{
      nodeId: string
      canvasId: string
      noteTitle: string | null
      noteTitleKey: string | null
    }>(
      `SELECT n.id AS nodeId, c.id AS canvasId,
              note.title AS noteTitle, note.title_key AS noteTitleKey
       FROM canvas c
       JOIN node n ON n.id = c.node_id
       LEFT JOIN note ON note.id = n.note_id
         AND note.lifecycle_state = 'active'
       WHERE c.project_id = ? AND c.lifecycle_state = 'active'
         AND n.lifecycle_state = 'active'`,
      ctx.projectId,
    )
    for (const row of canvasNodes) {
      if (row.noteTitle !== null && row.noteTitleKey !== null) {
        if (key.length > 0 && row.noteTitleKey.includes(key)) {
          entries.push({
            kind: 'canvas',
            id: row.nodeId,
            canvasId: row.canvasId,
            label: row.noteTitle,
          })
        }
      } else {
        const code = shortCode(row.nodeId)
        if (code.includes(codeNeedle)) {
          entries.push({ kind: 'canvas', id: row.nodeId, canvasId: row.canvasId, label: code })
        }
      }
    }

    entries.sort((a, b) => {
      const la = a.label.toLowerCase()
      const lb = b.label.toLowerCase()
      if (la !== lb) return la < lb ? -1 : 1
      if (a.kind !== b.kind) return a.kind === 'note' ? -1 : 1
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
    })
    return entries
  })
}
