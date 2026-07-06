/**
 * Wire-shaped scene types. These mirror the `getCanvasScene` query
 * result as it crosses the Project API as JSON — the engine never
 * imports persistence (RFC §11.1); the shapes are re-declared here on
 * the renderer side of the boundary.
 */

export interface SceneCamera {
  x: number
  y: number
  zoom: number
}

export interface SceneBackground {
  color: string | null
  assetId: string | null
  assetContentHash: string | null
  assetMimeType: string | null
  /** Native pixel dimensions of the background asset (AI-IMP-032):
   * with the stored transform they define the stage extent. */
  assetWidth: number | null
  assetHeight: number | null
  settings: Record<string, unknown> | null
}

export interface ScenePlacement {
  itemKind: 'placement'
  id: string
  nodeId: string
  x: number
  y: number
  width: number | null
  height: number | null
  scale: number
  rotation: number
  flipX: 0 | 1
  flipY: 0 | 1
  renderOrder: number
  labelVisible: 0 | 1
  /** §6.9 rev 0.17: locked placements refuse move/resize/rotate. */
  locked: 0 | 1
  appearanceKind: 'dot' | 'icon' | 'image' | null
  appearanceColor: string | null
  appearanceIcon: string | null
  appearanceAssetId: string | null
  appearanceCrop: string | null
  noteTitle: string | null
  /** §8.4 hint charms: the node's active note and child canvas. */
  noteId: string | null
  childCanvasId: string | null
  assetContentHash: string | null
  assetMimeType: string | null
  assetWidth: number | null
  assetHeight: number | null
}

export interface SceneDecoration {
  itemKind: 'decoration'
  id: string
  kind: string
  data: Record<string, unknown>
  renderOrder: number
  locked: 0 | 1
  hidden: 0 | 1
  groupId: string | null
  anchorStartPlacementId: string | null
  anchorEndPlacementId: string | null
}

export type SceneItem = ScenePlacement | SceneDecoration

export interface CanvasScene {
  canvasId: string
  nodeId: string
  camera: SceneCamera
  background: SceneBackground
  items: SceneItem[]
}

/** Managed-blob URL for the custom protocol served by the main process. */
export function assetUrl(contentHash: string): string {
  return `ew-asset://${contentHash}`
}
