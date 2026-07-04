import { DomainError, type AffectedRecord } from '@ew/commands'
import { extractWikiLinks, titleKey, uuidv7 } from '@ew/domain'
import type { CommandContext } from './dispatcher'

/**
 * Link-record primitives per RFC-0001 §7.1 and invariants 26/27.
 * Both functions run inside a command handler's transaction and are
 * reused by AI-IMP-013 (restore re-runs the sweep; purge converts
 * inbound bound records to broken).
 *
 * link.source_revision stores the revision the surrounding command
 * will commit as: handlers run before the dispatcher's bump, so this
 * reads project_revision and stamps +1. Any write to a link row
 * re-stamps it — the source body is unchanged since the write, so its
 * ranges are valid as of the committing revision.
 */
function committingRevision(ctx: CommandContext): number {
  const row = ctx.db.get<{ project_revision: number }>(
    'SELECT project_revision FROM project WHERE id = ?',
    ctx.projectId,
  )!
  return row.project_revision + 1
}

/**
 * Replace a note's outbound link records from its current body
 * (§7.1 "on save"). Each token resolves by title_key against active
 * AND trashed notes → bound; otherwise unresolved (storing title_key
 * plus the token's raw title text as display text).
 *
 * Broken records never re-bind implicitly (invariant 27), so
 * brokenness survives the replace: a token whose title_key matches a
 * prior broken record of this source stays broken — even when an
 * active note with that title_key now exists — until the user edits
 * the token to a different title or explicitly relinks (§7.1). All
 * tokens sharing that title_key stay broken; occurrences are not
 * individually tracked across edits.
 *
 * Returns affected link records (removed and written).
 */
export function refreshNoteLinks(ctx: CommandContext, noteId: string): AffectedRecord[] {
  const note = ctx.db.get<{ body: string }>(
    'SELECT body FROM note WHERE id = ? AND project_id = ?',
    noteId,
    ctx.projectId,
  )
  if (!note) {
    throw new DomainError('NOTE_NOT_FOUND', `no note ${noteId}`, { noteId })
  }

  const brokenKeys = new Set(
    ctx.db
      .all<{ display_text: string }>(
        "SELECT display_text FROM link WHERE source_note_id = ? AND state = 'broken'",
        noteId,
      )
      .map((row) => titleKey(row.display_text)),
  )

  const affected: AffectedRecord[] = ctx.db
    .all<{ id: string }>('SELECT id FROM link WHERE source_note_id = ?', noteId)
    .map((row) => ({ kind: 'link', id: row.id }))
  ctx.db.run('DELETE FROM link WHERE source_note_id = ?', noteId)

  const revision = committingRevision(ctx)
  const now = ctx.now()
  const insert = ctx.db.prepare(
    `INSERT INTO link
       (id, project_id, source_note_id, source_revision, range_start, range_end,
        state, target_note_id, target_title_key, display_text, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )

  for (const token of extractWikiLinks(note.body)) {
    const key = titleKey(token.title)
    const id = uuidv7()
    if (brokenKeys.has(key)) {
      insert.run(id, ctx.projectId, noteId, revision, token.start, token.end,
        'broken', null, null, token.title, now, now)
    } else {
      const target = ctx.db.get<{ id: string }>(
        'SELECT id FROM note WHERE project_id = ? AND title_key = ?',
        ctx.projectId,
        key,
      )
      if (target) {
        insert.run(id, ctx.projectId, noteId, revision, token.start, token.end,
          'bound', target.id, null, null, now, now)
      } else {
        insert.run(id, ctx.projectId, noteId, revision, token.start, token.end,
          'unresolved', null, key, token.title, now, now)
      }
    }
    affected.push({ kind: 'link', id })
  }
  return affected
}

/**
 * The re-resolution sweep (§7.1, invariant 27): bind every unresolved
 * link record project-wide whose stored title_key matches, within the
 * caller's transaction. The only implicit binding path; broken
 * records are never touched. Called on CreateNote and RenameNote
 * here, and by AI-IMP-013 on restore.
 *
 * Returns affected link records.
 */
export function bindUnresolvedMatching(
  ctx: CommandContext,
  key: string,
  targetNoteId: string,
): AffectedRecord[] {
  const rows = ctx.db.all<{ id: string }>(
    "SELECT id FROM link WHERE project_id = ? AND state = 'unresolved' AND target_title_key = ?",
    ctx.projectId,
    key,
  )
  if (rows.length === 0) return []

  ctx.db.run(
    `UPDATE link
     SET state = 'bound', target_note_id = ?, target_title_key = NULL,
         display_text = NULL, source_revision = ?, updated_at = ?
     WHERE project_id = ? AND state = 'unresolved' AND target_title_key = ?`,
    targetNoteId,
    committingRevision(ctx),
    ctx.now(),
    ctx.projectId,
    key,
  )
  return rows.map((row) => ({ kind: 'link', id: row.id }))
}
