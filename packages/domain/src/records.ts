/**
 * TypeScript shapes for the RFC-0001 §4 record types as persisted.
 * These mirror the SQLite schema owned by @ew/persistence; pure types
 * only, safe for any process including the renderer.
 */

/** §9.1: recoverable deletion is a lifecycle state, not a container. */
export type LifecycleState = 'active' | 'trashed'

export interface LifecycleFields {
  lifecycleState: LifecycleState
  trashedAt: string | null
  trashedByCommandId: string | null
}

export interface TimestampFields {
  createdAt: string
  updatedAt: string
}

/** §4.10 */
export interface ProjectRecord {
  id: string
  title: string
  schemaVersion: number
  projectRevision: number
  rootNodeId: string
  createdAt: string
  updatedAt: string
}

/** §4.2 */
export interface NoteRecord extends LifecycleFields, TimestampFields {
  id: string
  projectId: string
  title: string
  titleKey: string
  body: string
}

export type AppearanceKind = 'dot' | 'icon' | 'image'

/** §4.6: non-destructive crop/framing for image appearances. */
export interface AppearanceCrop {
  x: number
  y: number
  width: number
  height: number
}

/** §4.3 */
export interface NodeRecord extends LifecycleFields, TimestampFields {
  id: string
  projectId: string
  noteId: string | null
  appearanceKind: AppearanceKind | null
  appearanceColor: string | null
  appearanceIcon: string | null
  appearanceAssetId: string | null
  appearanceCrop: AppearanceCrop | null
}

/** §4.4 camera/view state, stored as JSON. */
export interface CanvasCamera {
  x: number
  y: number
  zoom: number
}

/** §4.4 */
export interface CanvasRecord extends LifecycleFields, TimestampFields {
  id: string
  projectId: string
  nodeId: string
  backgroundAssetId: string | null
  /** Transform, fit, opacity, presentation settings for the image background. */
  backgroundSettings: Record<string, unknown> | null
  backgroundColor: string | null
  camera: CanvasCamera
}

/** §4.5 */
export interface PlacementRecord extends LifecycleFields, TimestampFields {
  id: string
  projectId: string
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
}

/** §4.7: Phase 1 ships only 'image'; discriminator exists now. */
export type AssetKind = 'image' | 'web-reference'

export interface AssetRecord extends LifecycleFields, TimestampFields {
  id: string
  projectId: string
  kind: AssetKind
  contentHash: string
  originalFilename: string
  mimeType: string
  width: number | null
  height: number | null
  storagePath: string
  sourceUrl: string | null
  attribution: string | null
}

/** §4.8 */
export interface TagRecord extends LifecycleFields, TimestampFields {
  id: string
  projectId: string
  name: string
  nameKey: string
  color: string | null
  icon: string | null
}

/** §4.9 */
export type DecorationKind =
  | 'text'
  | 'path'
  | 'shape'
  | 'line'
  | 'arrow'
  | 'connector'
  | 'guide'

export interface DecorationRecord extends LifecycleFields, TimestampFields {
  id: string
  projectId: string
  canvasId: string
  kind: DecorationKind
  /** Kind-specific geometry/content; text kind stores { text } for FTS. */
  data: Record<string, unknown>
  renderOrder: number
  locked: boolean
  hidden: boolean
  groupId: string | null
  anchorStartPlacementId: string | null
  anchorEndPlacementId: string | null
}

/** §7.1 link record states. */
export type LinkState = 'bound' | 'unresolved' | 'broken'

export interface LinkRecord {
  id: string
  projectId: string
  sourceNoteId: string
  sourceRevision: number
  rangeStart: number
  rangeEnd: number
  state: LinkState
  /** bound */
  targetNoteId: string | null
  /** unresolved */
  targetTitleKey: string | null
  /** unresolved + broken; display text of the token. */
  displayText: string | null
  createdAt: string
  updatedAt: string
}

/**
 * §8.1 bookmarks target stable canvas identity plus viewport; never
 * deleted automatically (trashed/purged targets degrade explicitly).
 * `sortKey` carries drag order — row order IS the Mod+1–n binding.
 * `targetKind` is the EPIC-013 projection seam; only 'canvas' ships.
 */
export interface BookmarkRecord {
  id: string
  projectId: string
  targetKind: 'canvas'
  canvasId: string
  label: string
  viewport: CanvasCamera | null
  sortKey: number
  createdAt: string
  updatedAt: string
}

/** §10.2 committed-command metadata log entry (not replayable). */
export interface CommandLogRecord {
  commandId: string
  projectId: string
  commandType: string
  commandVersion: number
  issuedAt: string
  resultingRevision: number
}
