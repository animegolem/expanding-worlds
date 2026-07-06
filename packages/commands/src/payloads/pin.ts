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
   * `body` carries phantom draft content (§7.2 — Create and Place
   * must not drop typed text; AI-IMP-058).
   */
  note?:
    | { kind: 'create'; noteId: string; title: string; body?: string }
    | { kind: 'attach'; noteId: string }
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

/**
 * §8.5 place-on-board compound (AI-IMP-086): the pinned panel's one
 * deliberate act is ONE durable command (§10.2). In a single
 * transaction it (a) flips the node's appearance to the §4.6 card
 * ONLY when the current appearance is a dot or unset — icon/image
 * nodes place as-is, their look already represents them (AI-IMP-084)
 * — and (b) creates the placement at x/y.
 */
export interface PlaceAsCardPayload {
  nodeId: string
  canvasId: string
  placementId: string
  x: number
  y: number
}

/**
 * Internal inverse of PlaceAsCard: hard-deletes the placement
 * (freeing anchored connector endpoints, like DeleteDraftPlacement)
 * and, when the forward command flipped the appearance, restores the
 * exact prior value — one undo reverts both. Refuses (UNDO_STALE)
 * when the appearance moved on since the flip. Not part of the
 * public UI command set.
 */
export interface UnplaceCardPayload {
  placementId: string
  nodeId: string
  /** True when PlaceAsCard flipped the appearance to card. */
  appearanceChanged: boolean
  /** The pre-flip appearance to restore; null = unset (§4.6). */
  priorAppearance: NodeAppearance | null
}

export const COMMAND_CREATE_PIN = 'CreatePin'
export const COMMAND_DELETE_DRAFT_PIN = 'DeleteDraftPin'
export const COMMAND_PLACE_AS_CARD = 'PlaceAsCard'
export const COMMAND_UNPLACE_CARD = 'UnplaceCard'
