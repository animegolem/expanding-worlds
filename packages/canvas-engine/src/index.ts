import { placementRenderer } from './renderers/placement'
import { RendererRegistry, type ItemRenderer } from './renderers/registry'

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

/** The default registry with every built-in renderer installed. */
export function createDefaultRegistry(): RendererRegistry {
  const registry = new RendererRegistry()
  registry.register('placement', placementRenderer as ItemRenderer)
  return registry
}
