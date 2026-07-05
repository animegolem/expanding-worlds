import { placementRenderer } from './renderers/placement'
import { RendererRegistry, type ItemRenderer } from './renderers/registry'
import { connectorRenderer } from './renderers/decorations/connector'
import { arrowRenderer, lineRenderer } from './renderers/decorations/line'
import { pathRenderer } from './renderers/decorations/path'
import { shapeRenderer } from './renderers/decorations/shape'
import { textRenderer } from './renderers/decorations/text'

export {
  assetUrl,
  type CanvasScene,
  type SceneBackground,
  type SceneCamera,
  type SceneDecoration,
  type SceneItem,
  type ScenePlacement,
} from './types'
export { createScenePlanes, type ScenePlanes } from './planes'
export { SceneSync } from './scene-sync'
export {
  RendererRegistry,
  fallbackRenderer,
  rendererKey,
  type ItemRenderer,
  type RendererResources,
} from './renderers/registry'
export { DEFAULT_DOT_RADIUS, cssColorToNumber, placementRenderer } from './renderers/placement'
export { BackgroundSync } from './renderers/background'
export { Camera, MAX_ZOOM, MIN_ZOOM, type Point, type Rect } from './camera'
export {
  hitTest,
  isHittable,
  itemWorldAABB,
  marqueeHits,
  placementSize,
  unionBounds,
} from './hit-test'
export { Selection } from './selection'
export {
  GestureSession,
  placementTransformOf,
  type GestureUpdate,
  type PlacementTransform,
} from './gesture'
export { noopSnapProvider, type SnapGuide, type SnapProvider, type SnapQuery, type SnapResult } from './snap'
export { CommandGateway, type ProjectExecutor } from './command-gateway'
export {
  CanvasController,
  type ControllerHost,
  type GestureContext,
  type GestureDriver,
  type PointerModifiers,
} from './controller'
export { moveDriver } from './gestures/move'
export { createResizeDriver, RESIZE_HANDLES, type ResizeHandle } from './gestures/resize'
export { rotateDriver, ROTATE_SNAP_STEP } from './gestures/rotate'
export {
  mapDecorationPoints,
  rotateDecorationData,
  scaleDecorationData,
  translateDecorationData,
} from './gestures/decoration-data'
export { reorderPayloads, type ReorderOp } from './reorder'
export { LABEL_HEIGHT_RATIO } from './renderers/placement'

export {
  DEFAULT_STROKE,
  DEFAULT_STROKE_WIDTH,
  TEXT_LEGIBLE_SCREEN_PX,
  isConnectorData,
  isLineData,
  isPathData,
  isShapeData,
  isTextData,
  legibleFontSize,
  validateDecorationData,
  type ConnectorData,
  type LineData,
  type PathData,
  type ShapeData,
  type ShapeKind,
  type TextData,
} from './decoration-data'
export { textRenderer } from './renderers/decorations/text'
export { shapeRenderer } from './renderers/decorations/shape'
export { pathRenderer } from './renderers/decorations/path'
export { arrowRenderer, lineRenderer } from './renderers/decorations/line'
export {
  connectorEndpoints,
  connectorRenderer,
  type ConnectorEndpoints,
} from './renderers/decorations/connector'
export {
  ToolManager,
  type ToolKind,
  type ToolManagerHost,
  type ToolStyle,
  type ToolTarget,
} from './tools/tool-mode'
export {
  PATH_THIN_WORLD_UNITS,
  ToolOverlay,
  beginDrawSession,
  placementAt,
  type DrawSession,
  type DrawToolKind,
  type DrawUpdate,
  type ToolCreateInput,
  type ToolPreview,
} from './tools/draw-tools'

export { createSnapProvider, SNAP_ENGAGE_PX, SNAP_RELEASE_PX } from './snap-provider'
export {
  drawSnapGuides,
  snapGuideSegments,
  SNAP_GUIDE_ALPHA,
  SNAP_GUIDE_COLOR,
  SNAP_GUIDE_DASH_PX,
  SNAP_GUIDE_GAP_PX,
  SNAP_GUIDE_WIDTH_PX,
  type GuideSegment,
} from './snap-guides'
export { alignPayload, distributePayload, type AlignOp, type DistributeAxis } from './arrange'

export { Culler, RENDER_PADDING, RESIDENCY_PADDING, type CullerHooks } from './culling'
export {
  DEFAULT_TEXTURE_BUDGET_BYTES,
  TextureBudget,
  type BudgetTexture,
} from './texture-budget'
export {
  levelForZoom,
  maxLevel,
  planLevelTiles,
  tileVisible,
  TILE_SIZE,
  type TileAddress,
  type TileTextureSource,
  type WorldRect,
} from './background-tiles'
export { setPlacementTextureResident } from './renderers/placement'

/** The default registry with every built-in renderer installed. */
export function createDefaultRegistry(): RendererRegistry {
  const registry = new RendererRegistry()
  registry.register('placement', placementRenderer as ItemRenderer)
  registry.register('decoration:text', textRenderer as ItemRenderer)
  registry.register('decoration:shape', shapeRenderer as ItemRenderer)
  registry.register('decoration:path', pathRenderer as ItemRenderer)
  registry.register('decoration:line', lineRenderer as ItemRenderer)
  registry.register('decoration:arrow', arrowRenderer as ItemRenderer)
  registry.register('decoration:connector', connectorRenderer as ItemRenderer)
  return registry
}
