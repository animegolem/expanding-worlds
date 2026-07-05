/**
 * Lifecycle command payloads (RFC-0001 §9, AI-IMP-013): recoverable
 * deletion as a lifecycle state (trash), aggregate-preserving trash
 * commands, restore, and permanent purge.
 */

import type { CreateDecorationPayload } from './structure'

/** Record kinds that support user-visible Trash entries (§9.1). */
export type LifecycleRecordKind = 'note' | 'node' | 'canvas'

/**
 * §9.2: removes one spatial placement (hard delete; recovery is
 * command undo, not a Trash entry). When the placement was the last
 * one of a bare node — no note, no tags, no owned canvas, no other
 * placements — the node is moved to Trash within this same command,
 * signalled by the node appearing in the result's `affected` list.
 * Keep in Project is RestoreRecord {kind: 'node'}.
 */
export interface DeletePlacementPayload {
  placementId: string
}

/**
 * Internal inverse of DeletePlacement: recreates the exact prior
 * placement row (including render_order so it returns to its slot)
 * and, when the delete bare-trashed the node in the same command,
 * restores that node first. Not part of the public UI command set.
 */
export interface RestorePlacementPayload {
  placementId: string
  canvasId: string
  nodeId: string
  x: number
  y: number
  width: number | null
  height: number | null
  scale: number
  rotation: number
  flipX: boolean
  flipY: boolean
  renderOrder: number
  labelVisible: boolean
  /** Set when DeletePlacement trashed the bare node (§9.2). */
  restoreNodeId?: string | null
}

/**
 * Batch removal of board content (AI-IMP-028): deleting a
 * multi-selection is ONE durable command — one command_log row, one
 * future undo step. Placements follow §9.2 semantics each (hard
 * delete, bare-node auto-trash on the node's last placement);
 * decorations hard-delete with recreating inverses. Everything must
 * be active and on `canvasId`. Decorations delete before placements
 * so connector inverses capture their anchors intact.
 */
export interface DeleteContentPayload {
  canvasId: string
  placementIds: string[]
  decorationIds: string[]
}

/**
 * Internal inverse of DeleteContent: restores every placement (and
 * any bare-trashed node) first, then recreates decorations so
 * connector anchors resolve. Not part of the public UI command set.
 */
export interface RestoreContentPayload {
  canvasId: string
  placements: RestorePlacementPayload[]
  /** CreateDecoration-shaped rows captured at delete time. */
  decorations: CreateDecorationPayload[]
}

/**
 * §9.4 Delete Note Everywhere: moves the note to Trash. Node
 * attachments and bound link target ids stay intact; the title_key
 * reservation holds while trashed (invariant 5).
 */
export interface TrashNotePayload {
  noteId: string
}

/**
 * §9.6 Delete Node: moves the node to Trash as one recoverable
 * aggregate — placements, owned canvas, tags, appearance, and note
 * reference stay as rows. A shared note stays active (invariant 15).
 */
export interface TrashNodePayload {
  nodeId: string
}

/**
 * §9.5 Delete Canvas: moves the canvas and its owned canvas-local
 * aggregate to Trash. Referenced nodes and notes stay active
 * (invariant 14); never auto-trashes newly unplaced bare nodes. The
 * root canvas refuses (invariant 2).
 */
export interface TrashCanvasPayload {
  canvasId: string
}

/**
 * §9.7: returns a trashed record and its preserved aggregate to
 * active participation. Restoring a note re-runs the unresolved-link
 * re-resolution sweep for its title_key (invariant 27).
 */
export interface RestoreRecordPayload {
  kind: LifecycleRecordKind
  id: string
}

/**
 * §9.7 Delete Permanently: hard-deletes the trashed record and its
 * owned aggregate rows. Inbound bound links become broken with
 * last-known display text (§7.1). Not invertible — the committed
 * result carries `inverse: null`, which is the undo-invalidation
 * signal (EPIC-007 drops undo entries depending on the purged ids
 * named in `affected`).
 */
export interface PurgeRecordPayload {
  kind: LifecycleRecordKind
  id: string
}

/** §9.1: automatic permanent deletion defaults to Never. */
export type TrashRetention = 'never' | '30d' | '60d' | '90d'

export interface SetTrashRetentionPayload {
  retention: TrashRetention
}

export const COMMAND_DELETE_PLACEMENT = 'DeletePlacement'
export const COMMAND_RESTORE_PLACEMENT = 'RestorePlacement'
export const COMMAND_DELETE_CONTENT = 'DeleteContent'
export const COMMAND_RESTORE_CONTENT = 'RestoreContent'
export const COMMAND_TRASH_NOTE = 'TrashNote'
export const COMMAND_TRASH_NODE = 'TrashNode'
export const COMMAND_TRASH_CANVAS = 'TrashCanvas'
export const COMMAND_RESTORE_RECORD = 'RestoreRecord'
export const COMMAND_PURGE_RECORD = 'PurgeRecord'
export const COMMAND_SET_TRASH_RETENTION = 'SetTrashRetention'
