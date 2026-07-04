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

/** The default registry with every built-in renderer installed. */
export function createDefaultRegistry(): RendererRegistry {
  const registry = new RendererRegistry()
  registry.register('placement', placementRenderer as ItemRenderer)
  return registry
}
