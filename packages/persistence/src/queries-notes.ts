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
    ctx.db.all(
      `SELECT id, title, title_key AS titleKey,
              lifecycle_state AS lifecycleState
       FROM note WHERE project_id = ? AND lifecycle_state = 'active'
       ORDER BY title_key`,
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
