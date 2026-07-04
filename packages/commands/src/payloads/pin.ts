import type { NodeAppearance } from './structure'

/**
 * Create Pin composite payloads (RFC-0001 §6.2, AI-IMP-020). Every
 * creation surface — import drop/paste (§6.1), the Create Pin dialog
 * (§6.2), zero-node note placement (§6.10) — commits through this one
 * user-level command: node + appearance + note (created or attached) +
 * tags + placement in a single transaction. Clients supply UUIDs per
 * §10.1 so inverses and tests stay deterministic.
 */
export interface CreatePinPayload {
  nodeId: string
  canvasId: string
  placementId: string
  x: number
  y: number
  appearance: NodeAppearance
  /**
   * 'create' makes a new note (linkable-title + title-free rules,
   * §4.2/§7.7) and attaches it; 'attach' shares an existing active
   * note (§6.10). Omitted = a note-less pin (§6.1 image import).
   */
  note?: { kind: 'create'; noteId: string; title: string } | { kind: 'attach'; noteId: string }
  /** Existing active tags only; new tags are separate CreateTag commands. */
  tagIds?: string[]
}

/**
 * Internal inverse of CreatePin: hard-deletes the placement, the tag
 * assignments, and the node; a note the pin CREATED is trashed
 * (purge-safe, mirroring CreateNote↔TrashNote), while an ATTACHED
 * note is left untouched. Not part of the public UI command set.
 */
export interface DeleteDraftPinPayload {
  nodeId: string
  placementId: string
  /** Set when the pin created its note; that note is trashed. */
  createdNoteId?: string | null
}

export const COMMAND_CREATE_PIN = 'CreatePin'
export const COMMAND_DELETE_DRAFT_PIN = 'DeleteDraftPin'
