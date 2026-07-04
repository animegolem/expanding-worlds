import type { Container } from 'pixi.js'
import type { RendererRegistry, RendererResources } from './renderers/registry'
import type { SceneItem } from './types'

/**
 * Incremental projection of the scene query onto the shared content
 * plane (§12.2: the display tree is a projection, never the model).
 * Objects are keyed by item id and survive re-queries: apply() diffs
 * the incoming snapshot, creating, updating, removing, and reordering
 * children so an unchanged item keeps its display object identity
 * (texture loads and gesture references stay valid across syncs).
 */
export class SceneSync {
  #plane: Container
  #registry: RendererRegistry
  #resources: RendererResources
  #entries = new Map<string, { object: Container; item: SceneItem }>()
  #updated = new Set<(id: string, item: SceneItem, object: Container) => void>()

  constructor(plane: Container, registry: RendererRegistry, resources: RendererResources) {
    this.#plane = plane
    this.#registry = registry
    this.#resources = resources
  }

  apply(items: SceneItem[]): void {
    const seen = new Set<string>()
    for (const item of items) {
      seen.add(item.id)
      const existing = this.#entries.get(item.id)
      if (!existing) {
        const object = this.#registry.resolve(item).create(item, this.#resources)
        this.#entries.set(item.id, { object, item })
        this.#plane.addChild(object)
        this.#applyVisibility(object, item)
      } else if (existing.item !== item) {
        this.#registry.resolve(item).update(existing.object, item, existing.item, this.#resources)
        this.#applyVisibility(existing.object, item)
        existing.item = item
        for (const listener of this.#updated) listener(item.id, item, existing.object)
      }
    }
    for (const [id, entry] of this.#entries) {
      if (seen.has(id)) continue
      this.#entries.delete(id)
      const renderer = this.#registry.resolve(entry.item)
      this.#plane.removeChild(entry.object)
      if (renderer.destroy) renderer.destroy(entry.object)
      else entry.object.destroy({ children: true })
    }
    // Items arrive render_order-sorted; child order must match (§4.4).
    items.forEach((item, index) => {
      const object = this.#entries.get(item.id)!.object
      if (this.#plane.children[index] !== object) this.#plane.addChildAt(object, index)
    })
  }

  #applyVisibility(object: Container, item: SceneItem): void {
    object.visible = !(item.itemKind === 'decoration' && item.hidden === 1)
  }

  get(id: string): Container | undefined {
    return this.#entries.get(id)?.object
  }

  item(id: string): SceneItem | undefined {
    return this.#entries.get(id)?.item
  }

  /** Seam for followers (e.g. anchored connectors, AI-IMP-021). */
  onItemUpdated(listener: (id: string, item: SceneItem, object: Container) => void): () => void {
    this.#updated.add(listener)
    return () => this.#updated.delete(listener)
  }

  stats(): { total: number; placements: number; decorations: number } {
    let placements = 0
    for (const { item } of this.#entries.values()) {
      if (item.itemKind === 'placement') placements += 1
    }
    return {
      total: this.#entries.size,
      placements,
      decorations: this.#entries.size - placements,
    }
  }

  clear(): void {
    this.apply([])
  }
}
