/**
 * Structural command payloads (RFC-0001 §10.1): node/note attachment,
 * appearance, canvases, placements, tags, and decorations
 * (AI-IMP-012). Clients supply new-record UUIDv7s in payloads so
 * inverses and tests stay deterministic.
 */

// ---------------------------------------------------------------- nodes

/** §6.6: attach an existing note to a note-less node (invariant 3). */
export interface AttachNoteToNodePayload {
  nodeId: string
  noteId: string
}

/** §6.6: clear the node→note reference only (invariants 4, 12). */
export interface DetachNoteFromNodePayload {
  nodeId: string
}

/**
 * AI-IMP-086 compound: create a note (linkable-title + title-free
 * rules, §4.2/§7.7) AND attach it to an existing note-less active
 * node. One user act — "Attach New Note…", the attach picker's
 * create row, the corner charm's first committed edit — is ONE
 * durable command (§10.2) and one future undo step. Any rejection
 * (node trashed, node already has a note, title collision) commits
 * nothing: no loose note, no reserved title.
 */
export interface CreateNoteAndAttachPayload {
  nodeId: string
  /** Client-supplied UUIDv7 for the new note. */
  noteId: string
  title: string
  /** Optional initial body (corner-charm drafts, §8.5). */
  body?: string
}

/**
 * Internal inverse of CreateNoteAndAttach: clears the node's note
 * reference (its prior note_id was NULL by construction — the
 * forward command refuses nodes that already reference a note) and
 * trashes the created note if still active (purge-safe, mirroring
 * CreateNote↔TrashNote and DeleteDraftPin: by undo time the note may
 * have gained body text or inbound links). Not part of the public UI
 * command set.
 */
export interface DetachAndTrashNotePayload {
  nodeId: string
  noteId: string
}

/**
 * §6.6: copy the current shared note's body into a new note under a
 * new project-unique title and swap the node's reference to it.
 * Collisions return the §7.7 NOTE_TITLE_CONFLICT shape.
 */
export interface MakeNoteIndependentPayload {
  nodeId: string
  /** Client-supplied UUIDv7 for the new note. */
  newNoteId: string
  newTitle: string
}

/**
 * Internal inverse of MakeNoteIndependent: removes the copied note
 * (only while this node is its sole referent) and reattaches the
 * previous note. Not part of the public UI command set.
 */
export interface UnmakeNoteIndependentPayload {
  nodeId: string
  newNoteId: string
  previousNoteId: string
}

/** §4.6 appearance variants; null clears back to the default. */
export type NodeAppearance =
  | { kind: 'dot'; color: string }
  | { kind: 'icon'; icon: string }
  | {
      kind: 'image'
      assetId: string
      /** Non-destructive crop/framing; the asset is never modified. */
      crop: { x: number; y: number; width: number; height: number } | null
    }
  /** rev 0.31: card chrome renders the attached note — no payload,
   * content comes from the note via the read model. */
  | { kind: 'card' }
  /** §4.9 rev 0.54 (EPIC-017): a frame is an ordinary node whose
   * board presence is a drawn region other content sits inside —
   * payload-less like card; the drawn size rides placement geometry.
   * Membership is recorded in frame_member, never in the appearance. */
  | { kind: 'frame' }

export interface SetNodeAppearancePayload {
  nodeId: string
  appearance: NodeAppearance | null
}

// -------------------------------------------------------------- canvases

/** §4.4: at most one canvas per node (invariant 10). */
export interface CreateCanvasPayload {
  canvasId: string
  nodeId: string
}

/**
 * Internal inverse of CreateCanvas: hard-deletes a canvas that is
 * still a draft (no placements, decorations, bookmarks, background).
 */
export interface DeleteDraftCanvasPayload {
  canvasId: string
}

/** §4.4/§6.7: image background; independent of the color field. */
export interface SetCanvasBackgroundPayload {
  canvasId: string
  assetId: string | null
  /** Transform, fit, opacity, presentation settings (opaque JSON). */
  settings: Record<string, unknown> | null
}

/** §4.4: solid color rendered beneath the image background. */
export interface SetCanvasBackgroundColorPayload {
  canvasId: string
  color: string | null
}

// ------------------------------------------------------------ placements

/**
 * §4.5. Optional presentation fields exist so inverse commands can
 * restore an exact prior placement; ordinary creation omits them.
 */
export interface CreatePlacementPayload {
  placementId: string
  canvasId: string
  nodeId: string
  x?: number
  y?: number
  width?: number | null
  height?: number | null
  scale?: number
  rotation?: number
  renderOrder?: number
  labelVisible?: boolean
  /** §4.5 rev 0.68: identity-free text local to this placement. */
  caption?: string | null
  flipX?: boolean
  flipY?: boolean
  locked?: boolean
}

/**
 * Internal inverse of CreatePlacement: hard-deletes one placement,
 * freeing any anchored connector endpoints at their last position.
 * Lifecycle-aware DeletePlacement (trash + bare-node rule) is
 * AI-IMP-013's.
 */
export interface DeleteDraftPlacementPayload {
  placementId: string
}

/**
 * §10.2/invariant 25: one completed gesture commits one MovePlacement
 * carrying the full resulting transform.
 */
export interface MovePlacementPayload {
  placementId: string
  x: number
  y: number
  width: number | null
  height: number | null
  scale: number
  rotation: number
}

/** §4.5: per-placement label visibility, default visible. */
export interface SetPlacementLabelVisibilityPayload {
  placementId: string
  visible: boolean
}

/** §4.5 rev 0.68: set, replace, or clear one placement's caption. */
export interface SetPlacementCaptionPayload {
  placementId: string
  caption: string | null
}

/** Toggles one mirror axis; self-inverse. */
export interface FlipPlacementPayload {
  placementId: string
  axis: 'x' | 'y'
}

/**
 * §6.9 rev 0.17: a locked placement refuses move/resize/rotate at the
 * gesture surface (refusal cursor, no drag starts). Command-only
 * until the §8.4 charm bar ships its toggle (AI-IMP-063).
 */
export interface SetPlacementLockPayload {
  placementId: string
  locked: boolean
}

/**
 * §4.4/§6.8: reorder one item (placement or decoration) within the
 * shared normal-content plane. `afterId`/`beforeId` name the content
 * items that must end up directly below/above the moved item;
 * `afterId: null` sends to back, `beforeId: null` brings to front.
 * The handler MAY rebalance order keys transactionally without
 * changing visible order.
 */
export interface ReorderContentPayload {
  canvasId: string
  /** Placement or decoration id; the handler resolves which. */
  itemId: string
  afterId: string | null
  beforeId: string | null
}

// ------------------------------------------------------------------ tags

/** §4.8: flat project-scoped records, name_key unique. */
export interface CreateTagPayload {
  tagId: string
  name: string
  color?: string | null
  icon?: string | null
}

/**
 * Internal inverse of CreateTag: hard-deletes a tag that has no
 * assignments. Lifecycle-aware tag deletion is out of scope here.
 */
export interface DeleteDraftTagPayload {
  tagId: string
}

/** §4.8: identity is independent of name; assignments are untouched. */
export interface RenameTagPayload {
  tagId: string
  name: string
}

/** Invariant 8: tags assign only to nodes in Phase 1, M:N. */
export interface AssignTagToNodePayload {
  tagId: string
  nodeId: string
}

export interface UnassignTagFromNodePayload {
  tagId: string
  nodeId: string
}

/**
 * §4.8: lifecycle-aware tag deletion (AI-IMP-105). Removes ALL of the
 * tag's assignments and the tag row in one transaction — the in-use
 * counterpart to DeleteDraftTag, which stays for the no-assignment
 * create-undo case. The inverse restores the tag row and every prior
 * assignment exactly (RestoreTag).
 */
export interface DeleteTagPayload {
  tagId: string
}

/** One tag assignment carried across a delete/merge inverse. */
export interface RestoredTagAssignment {
  nodeId: string
  /** Original tag_assignment.created_at, restored byte-exact. */
  createdAt: string
}

/** The full tag row an inverse recreates (updated_at is re-stamped). */
export interface RestoredTagRow {
  tagId: string
  name: string
  /** Normalized §4.8 key; restored verbatim so identity is preserved. */
  nameKey: string
  color: string | null
  icon: string | null
  /** Original tag.created_at, restored byte-exact. */
  createdAt: string
}

/**
 * Internal inverse of DeleteTag: recreates the tag row (id, name,
 * name_key, color, icon, created_at) and re-inserts every prior
 * assignment exactly. Not part of the public UI command set.
 */
export interface RestoreTagPayload {
  tag: RestoredTagRow
  assignments: RestoredTagAssignment[]
}

/**
 * §4.8: fold the loser tag into the winner (AI-IMP-105). Every
 * loser-tagged node ends up carrying the winner exactly once —
 * assignments the winner already holds are dropped (dedupe), the rest
 * move over — and the loser row is removed, all in one transaction.
 * Both tags must exist and differ.
 */
export interface MergeTagPayload {
  loserTagId: string
  winnerTagId: string
}

/**
 * Internal inverse of MergeTag: recreates the loser row with its exact
 * original assignments, and removes from the winner ONLY the
 * assignments the merge added (`addedNodeIds`) — the winner's
 * pre-existing assignments, including overlap nodes, are untouched.
 * Not part of the public UI command set.
 */
export interface UnmergeTagPayload {
  loser: RestoredTagRow
  loserAssignments: RestoredTagAssignment[]
  winnerTagId: string
  /** Node ids whose assignment the merge moved onto the winner. */
  addedNodeIds: string[]
}

/**
 * §4.8: write a tag's presentation fields (AI-IMP-105). Sets the
 * whole appearance — both color and icon — mirroring SetNodeAppearance
 * (an omitted field clears to null). Prior-state inverse: the same
 * command carrying the pre-existing color and icon.
 */
export interface SetTagAppearancePayload {
  tagId: string
  color?: string | null
  icon?: string | null
}

// ------------------------------------------------------------ decorations

export type DecorationKindPayload =
  | 'text'
  | 'path'
  | 'shape'
  | 'line'
  | 'arrow'
  | 'connector'
  | 'guide'

/**
 * §4.9. Anchors are connector-only. Optional restore fields
 * (renderOrder, groupId, locked, hidden) exist so DeleteDecoration's
 * inverse can recreate the exact prior row.
 */
export interface CreateDecorationPayload {
  decorationId: string
  canvasId: string
  kind: DecorationKindPayload
  /** Kind-specific geometry/content (opaque JSON). */
  data: Record<string, unknown>
  anchorStartPlacementId?: string | null
  anchorEndPlacementId?: string | null
  renderOrder?: number
  groupId?: string | null
  locked?: boolean
  hidden?: boolean
}

/** Partial update; only keys present in `set` change. */
export interface UpdateDecorationPayload {
  decorationId: string
  set: {
    data?: Record<string, unknown>
    locked?: boolean
    hidden?: boolean
    anchorStartPlacementId?: string | null
    anchorEndPlacementId?: string | null
  }
}

export interface DeleteDecorationPayload {
  decorationId: string
}

/** §6.8: canvas-local movement group; no semantic containment. */
export interface GroupDecorationsPayload {
  groupId: string
  canvasId: string
  decorationIds: string[]
}

export interface UngroupDecorationsPayload {
  groupId: string
}

// ------------------------------------------------------------- constants

export const COMMAND_ATTACH_NOTE_TO_NODE = 'AttachNoteToNode'
export const COMMAND_DETACH_NOTE_FROM_NODE = 'DetachNoteFromNode'
export const COMMAND_CREATE_NOTE_AND_ATTACH = 'CreateNoteAndAttach'
export const COMMAND_DETACH_AND_TRASH_NOTE = 'DetachAndTrashNote'
export const COMMAND_MAKE_NOTE_INDEPENDENT = 'MakeNoteIndependent'
export const COMMAND_UNMAKE_NOTE_INDEPENDENT = 'UnmakeNoteIndependent'
export const COMMAND_SET_NODE_APPEARANCE = 'SetNodeAppearance'

export const COMMAND_CREATE_CANVAS = 'CreateCanvas'
export const COMMAND_DELETE_DRAFT_CANVAS = 'DeleteDraftCanvas'
export const COMMAND_SET_CANVAS_BACKGROUND = 'SetCanvasBackground'
export const COMMAND_SET_CANVAS_BACKGROUND_COLOR = 'SetCanvasBackgroundColor'

export const COMMAND_CREATE_PLACEMENT = 'CreatePlacement'
export const COMMAND_DELETE_DRAFT_PLACEMENT = 'DeleteDraftPlacement'
export const COMMAND_MOVE_PLACEMENT = 'MovePlacement'
export const COMMAND_SET_PLACEMENT_LABEL_VISIBILITY = 'SetPlacementLabelVisibility'
export const COMMAND_SET_PLACEMENT_CAPTION = 'SetPlacementCaption'
export const COMMAND_FLIP_PLACEMENT = 'FlipPlacement'
export const COMMAND_SET_PLACEMENT_LOCK = 'SetPlacementLock'
export const COMMAND_REORDER_CONTENT = 'ReorderContent'

export const COMMAND_CREATE_TAG = 'CreateTag'
export const COMMAND_DELETE_DRAFT_TAG = 'DeleteDraftTag'
export const COMMAND_RENAME_TAG = 'RenameTag'
export const COMMAND_ASSIGN_TAG_TO_NODE = 'AssignTagToNode'
export const COMMAND_UNASSIGN_TAG_FROM_NODE = 'UnassignTagFromNode'
export const COMMAND_DELETE_TAG = 'DeleteTag'
export const COMMAND_RESTORE_TAG = 'RestoreTag'
export const COMMAND_MERGE_TAG = 'MergeTag'
export const COMMAND_UNMERGE_TAG = 'UnmergeTag'
export const COMMAND_SET_TAG_APPEARANCE = 'SetTagAppearance'

export const COMMAND_CREATE_DECORATION = 'CreateDecoration'
export const COMMAND_UPDATE_DECORATION = 'UpdateDecoration'
export const COMMAND_DELETE_DECORATION = 'DeleteDecoration'
export const COMMAND_GROUP_DECORATIONS = 'GroupDecorations'
export const COMMAND_UNGROUP_DECORATIONS = 'UngroupDecorations'

// ------------------------------------------------------ batch transform

/** New full transform for one placement inside TransformContent. */
export interface PlacementTransformItem {
  kind: 'placement'
  placementId: string
  x: number
  y: number
  width: number | null
  height: number | null
  scale: number
  rotation: number
}

/**
 * Full replacement data for one decoration inside TransformContent —
 * decoration geometry lives inside its data JSON (§4.9).
 */
export interface DecorationTransformItem {
  kind: 'decoration'
  decorationId: string
  data: Record<string, unknown>
}

export type TransformContentItem = PlacementTransformItem | DecorationTransformItem

/**
 * §10.2/invariant 25: one completed multi-selection gesture — drag,
 * multi-resize, rotate, align, distribute — commits exactly one
 * durable command carrying the full resulting transform of every
 * member. All items must live on `canvasId` and be active. The
 * inverse is the same command with prior values.
 */
export interface TransformContentPayload {
  canvasId: string
  items: TransformContentItem[]
}

/**
 * §4.4 camera persistence. Not undoable (inverse null): §6.9 treats
 * camera motion as non-durable navigation, so the application undo
 * stack (invariant 31) skips inverse-null commands; persisting via a
 * command keeps every write inside the §10 pipeline.
 */
export interface SetCanvasCameraPayload {
  canvasId: string
  camera: { x: number; y: number; zoom: number }
}

export const COMMAND_TRANSFORM_CONTENT = 'TransformContent'
export const COMMAND_SET_CANVAS_CAMERA = 'SetCanvasCamera'
