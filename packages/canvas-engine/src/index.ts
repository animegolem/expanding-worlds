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
