import { Container, Graphics, Sprite, Texture } from 'pixi.js'
import { assetUrl, type SceneBackground } from '../types'
import type { RendererResources } from './registry'

/**
 * Background plane sync (§4.4/§6.7): at most one managed-asset image
 * sprite, world-positioned by its opaque settings JSON. The solid
 * color renders beneath the image — it is returned to the host to
 * apply as the renderer clear color, which by construction is behind
 * every plane. Tiled/pyramidal oversized backgrounds land in
 * AI-IMP-023 behind this same entry point.
 */

interface BackgroundSettings {
  x?: number
  y?: number
  scale?: number
  opacity?: number
}

export class BackgroundSync {
  #plane: Container
  #resources: RendererResources
  #currentHash: string | null = null
  #generation = 0

  constructor(plane: Container, resources: RendererResources) {
    this.#plane = plane
    this.#resources = resources
  }

  /** Applies the image; returns the color the host should clear with. */
  apply(background: SceneBackground): string | null {
    const hash = background.assetContentHash
    if (hash !== this.#currentHash) {
      this.#currentHash = hash
      this.#generation += 1
      const generation = this.#generation
      for (const child of [...this.#plane.children]) child.destroy({ children: true })
      if (hash) {
        const placeholder = new Graphics().rect(0, 0, 4, 4).fill({ color: 0x1e1e1e })
        placeholder.label = 'background-placeholder'
        this.#plane.addChild(placeholder)
        void this.#resources
          .loadTexture(assetUrl(hash))
          .then((texture) => {
            if (this.#generation !== generation) return
            placeholder.destroy()
            const sprite = new Sprite(texture as Texture)
            sprite.label = 'background-image'
            this.#plane.addChild(sprite)
            this.#applySettings(sprite, background.settings)
          })
          .catch(() => {
            /* missing blob leaves the placeholder; recovery owns repair */
          })
      }
    } else if (hash) {
      const sprite = this.#plane.children.find((c) => c.label === 'background-image')
      if (sprite) this.#applySettings(sprite as Sprite, background.settings)
    }
    return background.color
  }

  #applySettings(sprite: Sprite, settings: Record<string, unknown> | null): void {
    const s = (settings ?? {}) as BackgroundSettings
    sprite.position.set(s.x ?? 0, s.y ?? 0)
    const scale = s.scale ?? 1
    sprite.scale.set(scale)
    sprite.alpha = s.opacity ?? 1
  }
}
