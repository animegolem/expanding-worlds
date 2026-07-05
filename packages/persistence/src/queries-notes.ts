import { titleKey } from '@ew/domain'
import type { QueryRegistry } from './queries'

/** Escape LIKE wildcards so user input matches literally. */
function likePattern(key: string): string {
  return `%${key.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`
}

export interface TitleSuggestion {
  title: string
  titleKey: string
  /** null for phantom suggestions (no note row, invariant 28). */
  noteId: string | null
  phantom: boolean
  /** §7.2: trashed titles MAY be suggested, marked In Trash. */
  inTrash: boolean
  /** Unresolved-reference count; null for real notes. */
  referenceCount: number | null
}

export interface NoteLinkRecord {
  linkId: string
  rangeStart: number
  rangeEnd: number
  state: 'bound' | 'unresolved' | 'broken'
  targetNoteId: string | null
  targetTitleKey: string | null
  displayText: string | null
  /** Lifecycle of the bound target (In Trash rendering, §7.1); null
   * unless state is 'bound'. */
  targetLifecycleState: 'active' | 'trashed' | null
}

export interface NoteUsesNode {
  nodeId: string
  appearanceKind: string | null
  appearanceColor: string | null
  appearanceIcon: string | null
  appearanceAssetId: string | null
  tags: string[]
  placements: Array<{ placementId: string; x: number; y: number }>
}

export interface NoteUsesCanvas {
  canvasId: string
  /** Title of the canvas's owning node's note; null when untitled. */
  canvasTitle: string | null
  isRoot: boolean
  nodes: NoteUsesNode[]
}

export interface NoteUses {
  canvases: NoteUsesCanvas[]
  /** Active referencing nodes with zero active placements (§7.4). */
  unplaced: NoteUsesNode[]
  totalPlacements: number
}

export interface PhantomReference {
  linkId: string
  rangeStart: number
  rangeEnd: number
  displayText: string
}

export interface PhantomView {
  titleKey: string
  /** Would-be title: display text of the earliest unresolved record. */
  title: string
  referenceCount: number
  /** References grouped by source note (§7.2). */
  sources: Array<{ noteId: string; noteTitle: string; references: PhantomReference[] }>
}

/**
 * Note and phantom read models (RFC-0001 §7.2, §11.3). Phantom notes
 * are projections over unresolved link records — no note row, no
 * title reservation (invariant 28) — so every phantom shape here is
 * computed from the link table at query time.
 */
export function registerNoteQueries(registry: QueryRegistry): void {
  registry.register('getNote', (ctx, args) => {
    const { noteId } = args as { noteId: string }
    return (
      ctx.db.get(
        `SELECT id, title, title_key AS titleKey, body,
                lifecycle_state AS lifecycleState,
                created_at AS createdAt, updated_at AS updatedAt
         FROM note WHERE id = ? AND project_id = ?`,
        noteId,
        ctx.projectId,
      ) ?? null
    )
  })

  registry.register('listNotes', (ctx) =>
    // nodeCount counts ACTIVE referencing nodes: zero-node views (§6.10
    // Unplaced-note placement sources) filter on it server-side.
    ctx.db.all(
      `SELECT note.id, note.title, note.title_key AS titleKey,
              note.lifecycle_state AS lifecycleState,
              (SELECT count(*) FROM node
                WHERE node.note_id = note.id AND node.lifecycle_state = 'active')
                AS nodeCount
       FROM note WHERE note.project_id = ? AND note.lifecycle_state = 'active'
       ORDER BY note.title_key`,
      ctx.projectId,
    ),
  )

  registry.register('suggestTitles', (ctx, args): TitleSuggestion[] => {
    const { query } = args as { query: string }
    const pattern = likePattern(titleKey(query ?? ''))

    const notes = ctx.db.all<{ id: string; title: string; title_key: string; lifecycle_state: string }>(
      `SELECT id, title, title_key, lifecycle_state
       FROM note WHERE project_id = ? AND title_key LIKE ? ESCAPE '\\'
       ORDER BY title_key`,
      ctx.projectId,
      pattern,
    )
    // Would-be title spelling: the earliest record's display text
    // (UUIDv7 ids order by creation) so suggestions converge on one
    // spelling (§7.2).
    const phantoms = ctx.db.all<{ target_title_key: string; display_text: string; n: number }>(
      `SELECT target_title_key, count(*) AS n,
              (SELECT l2.display_text FROM link l2
               WHERE l2.project_id = l.project_id
                 AND l2.state = 'unresolved'
                 AND l2.target_title_key = l.target_title_key
               ORDER BY l2.id LIMIT 1) AS display_text
       FROM link l
       WHERE l.project_id = ? AND l.state = 'unresolved'
         AND l.target_title_key LIKE ? ESCAPE '\\'
       GROUP BY l.target_title_key
       ORDER BY l.target_title_key`,
      ctx.projectId,
      pattern,
    )

    return [
      ...notes.map((row) => ({
        title: row.title,
        titleKey: row.title_key,
        noteId: row.id,
        phantom: false,
        inTrash: row.lifecycle_state === 'trashed',
        referenceCount: null,
      })),
      ...phantoms.map((row) => ({
        title: row.display_text,
        titleKey: row.target_title_key,
        noteId: null,
        phantom: true,
        inTrash: false,
        referenceCount: row.n,
      })),
    ]
  })

  // §7.1 outbound link records for editor decoration (AI-IMP-044):
  // broken-ness lives ONLY here — presentation must never re-derive
  // it from titles.
  registry.register('getNoteLinks', (ctx, args): NoteLinkRecord[] => {
    const { noteId } = args as { noteId: string }
    return ctx.db.all<NoteLinkRecord>(
      `SELECT l.id AS linkId, l.range_start AS rangeStart,
              l.range_end AS rangeEnd, l.state,
              l.target_note_id AS targetNoteId,
              l.target_title_key AS targetTitleKey,
              l.display_text AS displayText,
              t.lifecycle_state AS targetLifecycleState
       FROM link l LEFT JOIN note t ON t.id = l.target_note_id
       WHERE l.project_id = ? AND l.source_note_id = ?
       ORDER BY l.range_start`,
      ctx.projectId,
      noteId,
    )
  })

  // §7.3/§7.4 location model: placements of every ACTIVE node
  // referencing the note, grouped canvas → node, plus the Unplaced
  // group. One query serves link activation, the Uses sidebar, and
  // the future location chooser (EPIC-006).
  registry.register('getNoteUses', (ctx, args): NoteUses => {
    const { noteId } = args as { noteId: string }

    const nodeRows = ctx.db.all<{
      nodeId: string
      appearanceKind: string | null
      appearanceColor: string | null
      appearanceIcon: string | null
      appearanceAssetId: string | null
    }>(
      `SELECT n.id AS nodeId, n.appearance_kind AS appearanceKind,
              n.appearance_color AS appearanceColor,
              n.appearance_icon AS appearanceIcon,
              n.appearance_asset_id AS appearanceAssetId
       FROM node n
       WHERE n.project_id = ? AND n.note_id = ? AND n.lifecycle_state = 'active'
       ORDER BY n.id`,
      ctx.projectId,
      noteId,
    )

    const placementRows = ctx.db.all<{
      placementId: string
      x: number
      y: number
      nodeId: string
      canvasId: string
      canvasTitle: string | null
    }>(
      `SELECT p.id AS placementId, p.x, p.y, p.node_id AS nodeId,
              c.id AS canvasId, cnote.title AS canvasTitle
       FROM node n
       JOIN placement p ON p.node_id = n.id AND p.lifecycle_state = 'active'
       JOIN canvas c ON c.id = p.canvas_id AND c.lifecycle_state = 'active'
       LEFT JOIN node owner ON owner.id = c.node_id
       LEFT JOIN note cnote ON cnote.id = owner.note_id
       WHERE n.project_id = ? AND n.note_id = ? AND n.lifecycle_state = 'active'
       ORDER BY c.id, p.node_id, p.id`,
      ctx.projectId,
      noteId,
    )

    const tagsFor = (nodeId: string): string[] =>
      ctx.db
        .all<{ name: string }>(
          `SELECT t.name FROM tag t
           JOIN tag_assignment ta ON ta.tag_id = t.id
           WHERE ta.node_id = ? AND t.lifecycle_state = 'active'
           ORDER BY t.name_key`,
          nodeId,
        )
        .map((t) => t.name)

    const nodes = new Map<string, NoteUsesNode>()
    for (const row of nodeRows) {
      nodes.set(row.nodeId, { ...row, tags: tagsFor(row.nodeId), placements: [] })
    }

    const canvases = new Map<string, NoteUsesCanvas>()
    // Per-canvas node groups are rebuilt so one node placed on two
    // canvases appears in both groups with only its local placements.
    const groupNodes = new Map<string, Map<string, NoteUsesNode>>()
    for (const row of placementRows) {
      const base = nodes.get(row.nodeId)
      if (!base) continue
      base.placements.push({ placementId: row.placementId, x: row.x, y: row.y })

      let canvas = canvases.get(row.canvasId)
      if (!canvas) {
        canvas = {
          canvasId: row.canvasId,
          canvasTitle: row.canvasTitle,
          isRoot: row.canvasId === ctx.rootCanvasId,
          nodes: [],
        }
        canvases.set(row.canvasId, canvas)
        groupNodes.set(row.canvasId, new Map())
      }
      const perCanvas = groupNodes.get(row.canvasId)!
      let grouped = perCanvas.get(row.nodeId)
      if (!grouped) {
        grouped = { ...base, placements: [] }
        perCanvas.set(row.nodeId, grouped)
        canvas.nodes.push(grouped)
      }
      grouped.placements.push({ placementId: row.placementId, x: row.x, y: row.y })
    }

    return {
      canvases: [...canvases.values()],
      unplaced: [...nodes.values()].filter((n) => n.placements.length === 0),
      totalPlacements: placementRows.length,
    }
  })

  registry.register('getPhantom', (ctx, args): PhantomView | null => {
    const args_ = args as { titleKey: string }
    const key = titleKey(args_.titleKey ?? '')
    const rows = ctx.db.all<{
      id: string
      source_note_id: string
      source_title: string
      range_start: number
      range_end: number
      display_text: string
    }>(
      `SELECT l.id, l.source_note_id, n.title AS source_title,
              l.range_start, l.range_end, l.display_text
       FROM link l JOIN note n ON n.id = l.source_note_id
       WHERE l.project_id = ? AND l.state = 'unresolved' AND l.target_title_key = ?
       ORDER BY l.id`,
      ctx.projectId,
      key,
    )
    const first = rows[0]
    if (first === undefined) return null

    const sources = new Map<string, PhantomView['sources'][number]>()
    for (const row of rows) {
      let source = sources.get(row.source_note_id)
      if (!source) {
        source = { noteId: row.source_note_id, noteTitle: row.source_title, references: [] }
        sources.set(row.source_note_id, source)
      }
      source.references.push({
        linkId: row.id,
        rangeStart: row.range_start,
        rangeEnd: row.range_end,
        displayText: row.display_text,
      })
    }
    return {
      titleKey: key,
      title: first.display_text,
      referenceCount: rows.length,
      sources: [...sources.values()],
    }
  })
}
