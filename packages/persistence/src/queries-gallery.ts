import { shortCode } from '@ew/domain'
import type { SqlValue } from './db'
import type { QueryRegistry } from './queries'

/**
 * Gallery read models (RFC-0001 §14.4, AI-IMP-077/078): the
 * file-browser projection over the project's nodes. Two queries,
 * split for virtualization: `getGalleryIndex` returns the COMPACT
 * whole-project index (id + timestamp + kind — enough to lay out
 * buckets and rows without hydrating anything), and
 * `getGalleryItems` hydrates a viewport window by id batch. Entries
 * are ordinary nodes — the §14.4 standing guardrail: no gallery-only
 * record kinds.
 *
 * 078 adds the retrieval half: the index takes facet arguments
 * (sort × kind mask × tags × cleanup flags) composing in one SQL
 * statement, and `galleryTagCounts` projects the flat §4.8 tag list
 * with carrier counts scoped to the active kind mask. Facet state is
 * view state — nothing here writes.
 *
 * Kind discrimination (image · note · board, rev 0.22) by
 * precedence: a node owning an active canvas is a BOARD (it is a
 * door before it is a picture), an image appearance makes an IMAGE,
 * everything else — noted or bare — renders as a NOTE entry. The
 * root node is excluded: it is the project, not material (§14.1
 * outline precedent).
 */

export type GalleryKind = 'image' | 'note' | 'board'
export type GallerySort = 'date' | 'name' | 'size'

export interface GalleryIndexArgs {
  sort?: GallerySort
  /** Kind mask; omitted or empty means every kind. */
  kinds?: GalleryKind[]
  /** Tag filter; several ids intersect (a carrier of ALL of them). */
  tagIds?: string[]
  /** §14.1 cleanup vocabulary: zero active-tag assignments. */
  untagged?: boolean
  /** §14.1 cleanup vocabulary: zero active placements on active
   * canvases (`listNodeLibrary`'s unplaced). */
  unplaced?: boolean
}

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
  /** FR-8 text posts: clamped body head; rides NOTE entries only. */
  noteExcerpt: string | null
  /** Active tag names, name_key order — the hover chip content. */
  tagNames: string[]
}

export interface GalleryTagCount {
  id: string
  name: string
  count: number
}

const KIND_CASE = `CASE
  WHEN EXISTS (
    SELECT 1 FROM canvas c
    WHERE c.node_id = n.id AND c.lifecycle_state = 'active'
  ) THEN 'board'
  WHEN n.appearance_kind = 'image' THEN 'image'
  ELSE 'note'
END`

/** Assignments to trashed tags do not count anywhere (§4.8). */
const ACTIVE_TAG_EXISTS = `SELECT 1 FROM tag_assignment ta
  JOIN tag t ON t.id = ta.tag_id AND t.lifecycle_state = 'active'
  WHERE ta.node_id = n.id`

/** Same clause listNodeLibrary counts: an active placement on an
 * active canvas. A placement whose canvas is trashed does not place. */
const ACTIVE_PLACEMENT_EXISTS = `SELECT 1 FROM placement p
  JOIN canvas pc ON pc.id = p.canvas_id AND pc.lifecycle_state = 'active'
  WHERE p.node_id = n.id AND p.lifecycle_state = 'active'`

/**
 * Sort keys (§14.4: date · name · size):
 * - date: creation, newest first (077's order; buckets are its
 *   presentation).
 * - name: the label's collation key — note title_key (already
 *   case/space-normalized) when a note is attached, else the node id.
 *   The untitled label the UI shows is shortCode(id), a digest OF the
 *   id, so id order is the honest cheap stand-in: stable, and since
 *   uuidv7 hex leads with digits it groups the untitled together
 *   ahead of the titled, in creation order, rather than pretending
 *   they have names.
 * - size: assets store no byte size, so pixel area (width*height) is
 *   the honest proxy for anything with an image appearance; noted
 *   entries fall back to body length; bare nodes sink to 0. Largest
 *   first, created_at breaking ties.
 */
const ORDER_BY: Record<GallerySort, string> = {
  date: 'n.created_at DESC, n.id DESC',
  name: 'COALESCE(note.title_key, n.id) ASC, n.id ASC',
  size: `COALESCE(a.width * a.height, length(note.body), 0) DESC,
         n.created_at DESC, n.id DESC`,
}

const ALL_KINDS: readonly GalleryKind[] = ['image', 'note', 'board']

/** A validated kind mask, or null when it does not narrow. */
function kindMask(kinds: unknown): GalleryKind[] | null {
  if (!Array.isArray(kinds)) return null
  const mask = ALL_KINDS.filter((k) => kinds.includes(k))
  return mask.length === 0 || mask.length === ALL_KINDS.length ? null : mask
}

export function registerGalleryQueries(registry: QueryRegistry): void {
  registry.register('getGalleryIndex', (ctx, args): GalleryIndexEntry[] => {
    const { sort, kinds, tagIds, untagged, unplaced } = (args ?? {}) as GalleryIndexArgs
    const order = sort && sort in ORDER_BY ? sort : 'date'

    const where: string[] = []
    const params: SqlValue[] = [ctx.projectId, ctx.rootNodeId]
    const mask = kindMask(kinds)
    if (mask) {
      where.push(`(${KIND_CASE}) IN (${mask.map(() => '?').join(', ')})`)
      params.push(...mask)
    }
    if (Array.isArray(tagIds)) {
      for (const tagId of tagIds) {
        where.push(`EXISTS (${ACTIVE_TAG_EXISTS} AND ta.tag_id = ?)`)
        params.push(tagId)
      }
    }
    if (untagged === true) where.push(`NOT EXISTS (${ACTIVE_TAG_EXISTS})`)
    if (unplaced === true) where.push(`NOT EXISTS (${ACTIVE_PLACEMENT_EXISTS})`)

    return ctx.db.all<GalleryIndexEntry>(
      `SELECT n.id AS nodeId, n.created_at AS createdAt, ${KIND_CASE} AS kind
       FROM node n
       LEFT JOIN note ON note.id = n.note_id
         AND note.lifecycle_state = 'active'
       LEFT JOIN asset a ON a.id = n.appearance_asset_id
         AND a.lifecycle_state = 'active'
       WHERE n.project_id = ? AND n.lifecycle_state = 'active'
         AND n.id <> ?
         ${where.map((clause) => `AND ${clause}`).join('\n         ')}
       ORDER BY ${ORDER_BY[order]}`,
      ...params,
    )
  })

  // §14.4: the flat tag filter's vocabulary — tag → carrier count
  // WITHIN the active kind mask, orderable by count (the completion
  // list's order) or by name. Tags with no in-scope carrier are
  // omitted: suggesting a filter that empties the grid helps nobody.
  registry.register('galleryTagCounts', (ctx, args): GalleryTagCount[] => {
    const { kinds, order } = (args ?? {}) as { kinds?: GalleryKind[]; order?: 'name' | 'count' }
    const mask = kindMask(kinds)
    const params: SqlValue[] = [ctx.rootNodeId, ctx.projectId]
    let kindClause = ''
    if (mask) {
      kindClause = `AND (${KIND_CASE}) IN (${mask.map(() => '?').join(', ')})`
      params.push(...mask)
    }
    return ctx.db.all<GalleryTagCount>(
      `SELECT t.id, t.name, count(*) AS count
       FROM tag t
       JOIN tag_assignment ta ON ta.tag_id = t.id
       JOIN node n ON n.id = ta.node_id
         AND n.lifecycle_state = 'active' AND n.id <> ?
       WHERE t.project_id = ? AND t.lifecycle_state = 'active'
         ${kindClause}
       GROUP BY t.id
       ORDER BY ${order === 'name' ? 't.name_key ASC' : 'count DESC, t.name_key ASC'}`,
      ...params,
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
        noteExcerpt: string | null
        contentHash: string | null
        width: number | null
        height: number | null
        childCanvasId: string | null
        tagList: string | null
      }>(
        `SELECT n.id AS nodeId, ${KIND_CASE} AS kind,
                n.appearance_kind AS appearanceKind,
                n.appearance_color AS appearanceColor,
                n.appearance_icon AS appearanceIcon,
                n.note_id AS noteId, note.title AS noteTitle,
                substr(note.body, 1, 140) AS noteExcerpt,
                a.content_hash AS contentHash, a.width, a.height,
                (SELECT c.id FROM canvas c
                 WHERE c.node_id = n.id AND c.lifecycle_state = 'active'
                 ORDER BY c.id LIMIT 1) AS childCanvasId,
                (SELECT group_concat(name, char(31)) FROM (
                   SELECT t.name FROM tag_assignment ta
                   JOIN tag t ON t.id = ta.tag_id
                     AND t.lifecycle_state = 'active'
                   WHERE ta.node_id = n.id
                   ORDER BY t.name_key)) AS tagList
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
          // Excerpts ride NOTE entries only, the way hashes ride
          // images: a board's cell is a door, not a clipping.
          noteExcerpt: row.kind === 'note' ? row.noteExcerpt : null,
          tagNames: row.tagList === null || row.tagList === '' ? [] : row.tagList.split('\u001f'),
        })
      }
    }
    // Hand batches back in request order so callers can zip windows.
    const byId = new Map(out.map((item) => [item.nodeId, item]))
    return nodeIds.map((id) => byId.get(id)).filter((i): i is GalleryItem => i !== undefined)
  })
}
