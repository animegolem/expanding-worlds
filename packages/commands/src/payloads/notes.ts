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

export const COMMAND_CREATE_NOTE = 'CreateNote'
export const COMMAND_UPDATE_NOTE = 'UpdateNote'
export const COMMAND_RENAME_NOTE = 'RenameNote'
export const COMMAND_PURGE_DRAFT_NOTE = 'PurgeDraftNote'
