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
  flipX?: boolean
  flipY?: boolean
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

/** Toggles one mirror axis; self-inverse. */
export interface FlipPlacementPayload {
  placementId: string
  axis: 'x' | 'y'
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
export const COMMAND_FLIP_PLACEMENT = 'FlipPlacement'
export const COMMAND_REORDER_CONTENT = 'ReorderContent'

export const COMMAND_CREATE_TAG = 'CreateTag'
export const COMMAND_DELETE_DRAFT_TAG = 'DeleteDraftTag'
export const COMMAND_RENAME_TAG = 'RenameTag'
export const COMMAND_ASSIGN_TAG_TO_NODE = 'AssignTagToNode'
export const COMMAND_UNASSIGN_TAG_FROM_NODE = 'UnassignTagFromNode'

export const COMMAND_CREATE_DECORATION = 'CreateDecoration'
export const COMMAND_UPDATE_DECORATION = 'UpdateDecoration'
export const COMMAND_DELETE_DECORATION = 'DeleteDecoration'
export const COMMAND_GROUP_DECORATIONS = 'GroupDecorations'
export const COMMAND_UNGROUP_DECORATIONS = 'UngroupDecorations'
