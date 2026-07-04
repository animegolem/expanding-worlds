import {
  COMMAND_CREATE_NOTE,
  COMMAND_PURGE_DRAFT_NOTE,
  COMMAND_RENAME_NOTE,
  COMMAND_TRASH_NOTE,
  COMMAND_UPDATE_NOTE,
  DomainError,
  type AffectedRecord,
  type CommandRegistry,
  type CreateNotePayload,
  type PurgeDraftNotePayload,
  type RenameNotePayload,
  type TrashNotePayload,
  type UpdateNotePayload,
} from '@ew/commands'
import { extractWikiLinks, titleKey } from '@ew/domain'
import type { CommandContext } from '../dispatcher'
import { bindUnresolvedMatching, refreshNoteLinks } from '../links'

interface NoteRow {
  id: string
  title: string
  title_key: string
  body: string
  lifecycle_state: 'active' | 'trashed'
}

function getNoteRow(ctx: CommandContext, noteId: string): NoteRow | undefined {
  return ctx.db.get<NoteRow>(
    `SELECT id, title, title_key, body, lifecycle_state
     FROM note WHERE id = ? AND project_id = ?`,
    noteId,
    ctx.projectId,
  )
}

function requireActiveNote(ctx: CommandContext, noteId: string): NoteRow {
  const note = getNoteRow(ctx, noteId)
  if (!note) throw new DomainError('NOTE_NOT_FOUND', `no note ${noteId}`, { noteId })
  if (note.lifecycle_state !== 'active') {
    // Trash flows (restore/purge, AI-IMP-013) own trashed notes.
    throw new DomainError('NOTE_NOT_ACTIVE', `note ${noteId} is in Trash`, { noteId })
  }
  return note
}

/**
 * Validate a title and derive its title_key. Phase 1 restriction
 * (AI-IMP-011 decision): titles may not contain `[`, `]`, `|`, or
 * line breaks — such a title could never be written as a wiki-link
 * token, so rename rewrites of inbound tokens would corrupt source
 * bodies. Revisit if unlinkable titles become a requirement.
 */
export function requireLinkableTitle(title: unknown): { title: string; key: string } {
  if (typeof title !== 'string' || titleKey(title).length === 0) {
    throw new DomainError('VALIDATION_FAILED', 'title must be a non-empty string')
  }
  if (/[[\]|\r\n]/.test(title)) {
    throw new DomainError(
      'VALIDATION_FAILED',
      'title may not contain "[", "]", "|", or line breaks (Phase 1: titles must be expressible as wiki-link tokens)',
    )
  }
  return { title, key: titleKey(title) }
}

/** §7.7: blocked creations and renames return a structured conflict. */
export function requireTitleFree(
  ctx: CommandContext,
  key: string,
  title: string,
  selfId?: string,
): void {
  const existing = ctx.db.get<{ id: string; lifecycle_state: string }>(
    'SELECT id, lifecycle_state FROM note WHERE project_id = ? AND title_key = ?',
    ctx.projectId,
    key,
  )
  if (existing && existing.id !== selfId) {
    throw new DomainError('NOTE_TITLE_CONFLICT', `a note titled "${title}" already exists`, {
      existingNoteId: existing.id,
      requestedTitle: title,
      titleKey: key,
      conflictingLifecycle: existing.lifecycle_state,
    })
  }
}

/**
 * Note command handlers per RFC-0001 §4.2, §7.1, §7.7 (AI-IMP-011).
 * Every handler is one user-level command (§10.2): link refreshes,
 * the re-resolution sweep, and rename rewrites all commit inside the
 * dispatcher's single transaction and single revision bump.
 */
export function registerNoteHandlers(registry: CommandRegistry<CommandContext>): void {
  registry.register<CreateNotePayload>(COMMAND_CREATE_NOTE, 1, (ctx, payload) => {
    if (typeof payload?.noteId !== 'string' || payload.noteId.length === 0) {
      throw new DomainError('VALIDATION_FAILED', 'CreateNote requires payload.noteId')
    }
    if (payload.body !== undefined && typeof payload.body !== 'string') {
      throw new DomainError('VALIDATION_FAILED', 'CreateNote body must be a string when present')
    }
    const { title, key } = requireLinkableTitle(payload.title)
    requireTitleFree(ctx, key, title)

    const now = ctx.now()
    ctx.db.run(
      `INSERT INTO note (id, project_id, title, title_key, body, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      payload.noteId,
      ctx.projectId,
      title,
      key,
      payload.body ?? '',
      now,
      now,
    )

    const affected: AffectedRecord[] = [{ kind: 'note', id: payload.noteId }]
    // Own outbound records first (self-references bind directly)…
    affected.push(...refreshNoteLinks(ctx, payload.noteId))
    // …then the materialization sweep (§7.2, invariant 27).
    affected.push(...bindUnresolvedMatching(ctx, key, payload.noteId))

    return {
      affected,
      // AI-IMP-013: the inverse is the purge-safe TrashNote (never
      // refuses, keeps links and the title reservation intact) rather
      // than PurgeDraftNote, which fails once anything references the
      // note. Redo is RestoreRecord via TrashNote's own inverse.
      inverse: {
        commandType: COMMAND_TRASH_NOTE,
        commandVersion: 1,
        payload: { noteId: payload.noteId } satisfies TrashNotePayload,
      },
    }
  })

  registry.register<UpdateNotePayload>(COMMAND_UPDATE_NOTE, 1, (ctx, payload) => {
    if (typeof payload?.noteId !== 'string' || typeof payload?.body !== 'string') {
      throw new DomainError('VALIDATION_FAILED', 'UpdateNote requires noteId and a string body')
    }
    const note = requireActiveNote(ctx, payload.noteId)

    ctx.db.run(
      'UPDATE note SET body = ?, updated_at = ? WHERE id = ?',
      payload.body,
      ctx.now(),
      note.id,
    )
    const affected: AffectedRecord[] = [{ kind: 'note', id: note.id }]
    affected.push(...refreshNoteLinks(ctx, note.id))

    return {
      affected,
      inverse: {
        commandType: COMMAND_UPDATE_NOTE,
        commandVersion: 1,
        payload: { noteId: note.id, body: note.body } satisfies UpdateNotePayload,
      },
    }
  })

  registry.register<RenameNotePayload>(COMMAND_RENAME_NOTE, 1, (ctx, payload) => {
    if (typeof payload?.noteId !== 'string') {
      throw new DomainError('VALIDATION_FAILED', 'RenameNote requires payload.noteId')
    }
    const { title, key } = requireLinkableTitle(payload.title)
    const note = requireActiveNote(ctx, payload.noteId)
    requireTitleFree(ctx, key, title, note.id)

    const now = ctx.now()
    ctx.db.run(
      'UPDATE note SET title = ?, title_key = ?, updated_at = ? WHERE id = ?',
      title,
      key,
      now,
      note.id,
    )
    const affected: AffectedRecord[] = [{ kind: 'note', id: note.id }]

    // §7.1: rewrite inbound tokens in source bodies transactionally.
    // The token's title text follows the rename in BOTH forms — an
    // aliased token becomes [[New|alias]], so its user-visible display
    // label is unchanged — because on the next save each token
    // re-resolves by title_key (§7.1); leaving [[Old|alias]] intact
    // would silently unresolve it. Sources are found via the link
    // index (invariant 6) and may include the note itself.
    const sources = ctx.db.all<{ source_note_id: string }>(
      `SELECT DISTINCT source_note_id FROM link
       WHERE target_note_id = ? AND state = 'bound'`,
      note.id,
    )
    for (const { source_note_id } of sources) {
      const source = ctx.db.get<{ body: string }>(
        'SELECT body FROM note WHERE id = ?',
        source_note_id,
      )!
      const tokens = extractWikiLinks(source.body).filter(
        (t) => titleKey(t.title) === note.title_key && t.title !== title,
      )
      if (tokens.length > 0) {
        let rewritten = ''
        let cursor = 0
        for (const t of tokens) {
          rewritten += source.body.slice(cursor, t.start)
          rewritten += t.alias === null ? `[[${title}]]` : `[[${title}|${t.alias}]]`
          cursor = t.end
        }
        rewritten += source.body.slice(cursor)
        ctx.db.run(
          'UPDATE note SET body = ?, updated_at = ? WHERE id = ?',
          rewritten,
          now,
          source_note_id,
        )
        affected.push({ kind: 'note', id: source_note_id })
      }
      // Rebuild ranges (and states) even when only offsets moved.
      affected.push(...refreshNoteLinks(ctx, source_note_id))
    }

    // Sweep for the NEW title (invariant 27).
    affected.push(...bindUnresolvedMatching(ctx, key, note.id))

    return {
      affected,
      inverse: {
        commandType: COMMAND_RENAME_NOTE,
        commandVersion: 1,
        payload: { noteId: note.id, title: note.title } satisfies RenameNotePayload,
      },
    }
  })

  registry.register<PurgeDraftNotePayload>(COMMAND_PURGE_DRAFT_NOTE, 1, (ctx, payload) => {
    if (typeof payload?.noteId !== 'string') {
      throw new DomainError('VALIDATION_FAILED', 'PurgeDraftNote requires payload.noteId')
    }
    const note = getNoteRow(ctx, payload.noteId)
    if (!note) {
      throw new DomainError('NOTE_NOT_FOUND', `no note ${payload.noteId}`, {
        noteId: payload.noteId,
      })
    }
    const guards = ctx.db.get<{ inbound: number; nodes: number }>(
      `SELECT
         (SELECT count(*) FROM link
          WHERE target_note_id = ?1 AND source_note_id <> ?1) AS inbound,
         (SELECT count(*) FROM node WHERE note_id = ?1) AS nodes`,
      note.id,
    )!
    if (guards.inbound > 0 || guards.nodes > 0) {
      throw new DomainError(
        'NOTE_NOT_DRAFT',
        'PurgeDraftNote only removes notes no other note links to and no node references (real Trash lands in AI-IMP-013)',
        { noteId: note.id, inboundLinkCount: guards.inbound, referencingNodeCount: guards.nodes },
      )
    }

    const affected: AffectedRecord[] = ctx.db
      .all<{ id: string }>('SELECT id FROM link WHERE source_note_id = ?', note.id)
      .map((row) => ({ kind: 'link', id: row.id }))
    ctx.db.run('DELETE FROM link WHERE source_note_id = ?', note.id)
    ctx.db.run('DELETE FROM note WHERE id = ?', note.id)
    affected.push({ kind: 'note', id: note.id })

    return {
      affected,
      inverse: {
        commandType: COMMAND_CREATE_NOTE,
        commandVersion: 1,
        payload: { noteId: note.id, title: note.title, body: note.body } satisfies CreateNotePayload,
      },
    }
  })
}
