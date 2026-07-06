import { Container, Graphics } from 'pixi.js'
import type { SceneItem } from '../types'

/**
 * Renderer seam (AI-IMP-017): scene-sync looks up one renderer per
 * item — `placement` for placements, `decoration:<kind>` for
 * decorations — so later tickets add renderer modules without
 * touching the sync core. Unknown kinds fall back to a neutral
 * outline stub rather than failing the whole scene.
 */

export interface RendererResources {
  /** Resolves a texture for a managed asset URL; injectable for tests. */
  loadTexture: (url: string) => Promise<unknown>
  /**
   * §12.2 lazy textures: when present, image bodies stay placeholders
   * until residency is granted (Culler enter/leave drives
   * setPlacementTextureResident), and loads/releases are refcounted
   * by content hash through the budget.
   */
  textures?: {
    acquire(hash: string, url: string): Promise<unknown>
    release(hash: string): void
  }
  /**
   * Looks up another item's live display object (e.g. a connector
   * following its anchor placement each frame). Optional: absent in
   * minimal test setups.
   */
  resolveObject?: (id: string) => Container | undefined
  /**
   * §12.2 tiled backgrounds: decodes an original into a sliceable
   * source. When present, BackgroundSync tiles any image whose
   * largest dimension exceeds its texture cap.
   */
  loadTileSource?: (url: string) => Promise<import('../background-tiles').TileTextureSource>
  /**
   * Current camera zoom, for screen-constant geometry computed inside
   * renderers (the §4.5 label's outline clearance, AI-IMP-087).
   * Optional: absent (tests, minimal hosts) means zoom 1.
   */
  getZoom?: () => number
}

export interface ItemRenderer<T extends SceneItem = SceneItem> {
  create(item: T, resources: RendererResources): Container
  update(object: Container, item: T, previous: T, resources: RendererResources): void
  destroy?(object: Container): void
}

export function rendererKey(item: SceneItem): string {
  return item.itemKind === 'placement' ? 'placement' : `decoration:${item.kind}`
}

export class RendererRegistry {
  #renderers = new Map<string, ItemRenderer>()

  register(key: string, renderer: ItemRenderer): this {
    if (this.#renderers.has(key)) throw new Error(`duplicate renderer ${key}`)
    this.#renderers.set(key, renderer)
    return this
  }

  resolve(item: SceneItem): ItemRenderer {
    return this.#renderers.get(rendererKey(item)) ?? fallbackRenderer
  }
}

const FALLBACK_SIZE = 64

/** Neutral outline for decoration kinds with no renderer yet. */
export const fallbackRenderer: ItemRenderer = {
  create(item) {
    const container = new Container()
    container.label = `stub:${rendererKey(item)}`
    const outline = new Graphics()
      .rect(0, 0, FALLBACK_SIZE, FALLBACK_SIZE)
      .stroke({ width: 2, color: 0x888888 })
    container.addChild(outline)
    if (item.itemKind === 'decoration') {
      const at = item.data as { x?: number; y?: number }
      container.position.set(at.x ?? 0, at.y ?? 0)
    }
    return container
  },
  update(object, item) {
    if (item.itemKind === 'decoration') {
      const at = item.data as { x?: number; y?: number }
      object.position.set(at.x ?? 0, at.y ?? 0)
    }
  },
}
