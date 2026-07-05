/** Note command payloads (§10.1, §7.1, §7.7). Grown by AI-IMP-013. */

export interface CreateNotePayload {
  /** Client-supplied UUIDv7 keeps inverses and tests deterministic. */
  noteId: string
  title: string
  body?: string
}

/**
 * One committed UpdateNote per editing burst (invariant 29); the
 * debounce/flush policy lives in the editor (EPIC-005), not here.
 */
export interface UpdateNotePayload {
  noteId: string
  body: string
}

export interface RenameNotePayload {
  noteId: string
  title: string
}

/**
 * Internal inverse of CreateNote until AI-IMP-013 lands note
 * lifecycle commands: hard-deletes a note that nothing else depends
 * on. Refuses when any OTHER note holds a bound link to it or any
 * node references it. Its own outbound link records are removed with
 * it; the title_key reservation ends immediately.
 */
export interface PurgeDraftNotePayload {
  noteId: string
}

/**
 * §7.1 broken-link recovery (AI-IMP-048): broken records never
 * re-bind implicitly (invariant 27), so recovery flips the RECORDS —
 * a text rewrite cannot do it, because refreshNoteLinks keeps a
 * title_key broken across saves. Flips every broken record of
 * `sourceNoteId` whose display text normalizes to
 * titleKey(displayTitle) — granularity is per (source, title_key),
 * matching link-refresh semantics. Exactly one of `targetNoteId`
 * (relink to an existing ACTIVE note) or `create` (recreate from the
 * display text, in the same transaction) must be present; the
 * target's title_key MUST equal the broken key so the next save
 * re-resolves identically.
 */
export interface RelinkBrokenLinksPayload {
  sourceNoteId: string
  displayTitle: string
  targetNoteId?: string
  create?: { noteId: string; title: string }
}

/**
 * Internal inverse of RelinkBrokenLinks: returns the named bound
 * records to broken with the given display text. Not part of the
 * public UI command set.
 */
export interface BreakNoteLinksPayload {
  linkIds: string[]
  displayTitle: string
}

export const COMMAND_CREATE_NOTE = 'CreateNote'
export const COMMAND_UPDATE_NOTE = 'UpdateNote'
export const COMMAND_RENAME_NOTE = 'RenameNote'
export const COMMAND_PURGE_DRAFT_NOTE = 'PurgeDraftNote'
export const COMMAND_RELINK_BROKEN_LINKS = 'RelinkBrokenLinks'
export const COMMAND_BREAK_NOTE_LINKS = 'BreakNoteLinks'
