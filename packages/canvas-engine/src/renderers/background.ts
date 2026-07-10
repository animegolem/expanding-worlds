import { Container, Graphics, Sprite, Texture } from 'pixi.js'
import {
  levelForZoom,
  maxLevel,
  planLevelTiles,
  tileVisible,
  type TileAddress,
  type TileTextureSource,
  type WorldRect,
} from '../background-tiles'
import { assetUrl, type SceneBackground } from '../types'
import type { RendererResources } from './registry'

/**
 * Background plane sync (§4.4/§6.7/§12.2): at most one managed-asset
 * image, world-positioned by its opaque settings JSON. Originals
 * whose largest dimension exceeds the GPU texture cap render as a
 * tile pyramid — the root container keeps the `background-image`
 * label and position/scale semantics, so the §6.7 edit mode is
 * oblivious to tiling. The solid color renders beneath the image: it
 * is returned to the host to apply as the renderer clear color.
 */

interface BackgroundSettings {
  x?: number
  y?: number
  scale?: number
  opacity?: number
}

interface LevelState {
  container: Container
  tiles: Array<{
    address: TileAddress
    sprite: Sprite | null
    texture: unknown | null
    loading: boolean
    wanted: boolean
  }>
  built: boolean
  active: boolean
}

export class BackgroundSync {
  #plane: Container
  #resources: RendererResources
  #maxTextureSize: number
  #currentHash: string | null = null
  #generation = 0
  #plainTexture: unknown | null = null
  // Tiled state (only while an oversized background is active).
  #source: TileTextureSource | null = null
  #levels = new Map<number, LevelState>()
  #topLevel = 0
  #activeLevel = -1

  constructor(plane: Container, resources: RendererResources, maxTextureSize = 4096) {
    this.#plane = plane
    this.#resources = resources
    this.#maxTextureSize = maxTextureSize
  }

  /** Applies the image; returns the color the host should clear with. */
  apply(background: SceneBackground): string | null {
    const hash = background.assetContentHash
    if (hash !== this.#currentHash) {
      this.#currentHash = hash
      this.#generation += 1
      const generation = this.#generation
      this.#teardownImageResources()
      for (const child of [...this.#plane.children]) child.destroy({ children: true })
      if (hash) {
        const placeholder = new Graphics().rect(0, 0, 4, 4).fill({ color: 0x1e1e1e })
        placeholder.label = 'background-placeholder'
        this.#plane.addChild(placeholder)
        void this.#mount(hash, generation, background.settings).catch(() => {
          /* missing blob leaves the placeholder; recovery owns repair */
        })
      }
    } else if (hash) {
      const root = this.#plane.children.find((c) => c.label === 'background-image')
      if (root) this.#applySettings(root as Container, background.settings)
    }
    return background.color
  }

  async #mount(
    hash: string,
    generation: number,
    settings: Record<string, unknown> | null,
  ): Promise<void> {
    const url = assetUrl(hash)
    if (this.#resources.loadTileSource) {
      const source = await this.#resources.loadTileSource(url)
      if (this.#generation !== generation) {
        source.destroy()
        return
      }
      if (Math.max(source.width, source.height) > this.#maxTextureSize) {
        this.#mountTiled(source, settings)
        return
      }
      source.destroy()
    }
    const texture = await this.#resources.loadTexture(url)
    if (this.#generation !== generation) {
      this.#destroyTexture(texture)
      return
    }
    this.#plane.children.find((c) => c.label === 'background-placeholder')?.destroy()
    const sprite = new Sprite(texture as Texture)
    sprite.label = 'background-image'
    this.#plane.addChild(sprite)
    this.#plainTexture = texture
    this.#applySettings(sprite, settings)
  }

  #mountTiled(source: TileTextureSource, settings: Record<string, unknown> | null): void {
    this.#plane.children.find((c) => c.label === 'background-placeholder')?.destroy()
    this.#source = source
    this.#topLevel = maxLevel(source.width, source.height)
    this.#activeLevel = -1
    const root = new Container()
    root.label = 'background-image'
    this.#plane.addChild(root)
    this.#applySettings(root, settings)
    // Coarsest level first: cheap full coverage while finer tiles load
    // (2^-top zoom selects exactly the top level).
    this.updateView(2 ** -this.#topLevel, null)
  }

  get tiled(): boolean {
    return this.#source !== null
  }

  /**
   * Level selection + per-tile culling; the host calls this on camera
   * change and after apply(). `view` is the world-space viewport (null
   * = show everything at the chosen level).
   */
  updateView(zoom: number, view: WorldRect | null): void {
    const source = this.#source
    if (!source) return
    const root = this.#plane.children.find((c) => c.label === 'background-image') as
      | Container
      | undefined
    if (!root) return
    const level = levelForZoom(zoom * root.scale.x, this.#topLevel)
    if (level !== this.#activeLevel) {
      for (const state of this.#levels.values()) this.#destroyLevel(state)
      this.#levels.clear()
      this.#activeLevel = level
    }
    let state = this.#levels.get(level)
    if (!state) {
      state = {
        container: new Container(),
        tiles: planLevelTiles(source.width, source.height, level).map((address) => ({
          address,
          sprite: null,
          texture: null,
          loading: false,
          wanted: false,
        })),
        built: false,
        active: true,
      }
      state.container.label = `background-level-${level}`
      root.addChild(state.container)
      this.#levels.set(level, state)
    }
    // Image-local view rect for tile culling (root transform removed).
    const local: WorldRect | null = view
      ? {
          x: (view.x - root.position.x) / (root.scale.x || 1),
          y: (view.y - root.position.y) / (root.scale.y || 1),
          width: view.width / (root.scale.x || 1),
          height: view.height / (root.scale.y || 1),
        }
      : null
    const generation = this.#generation
    for (const tile of state.tiles) {
      const visible = local === null || tileVisible(tile.address, local)
      tile.wanted = visible
      if (tile.sprite) {
        if (visible) tile.sprite.renderable = true
        else this.#destroyTile(tile)
        continue
      }
      if (!visible || tile.loading) continue
      // Lazy per-tile upload; dest rect == source rect in world units.
      const slot = tile
      slot.loading = true
      void source
        .texture(tile.address)
        .then((texture) => {
          slot.loading = false
          if (this.#generation !== generation || !state.active || !slot.wanted || slot.sprite) {
            this.#destroyTexture(texture)
            return
          }
          const sprite = new Sprite(texture as Texture)
          sprite.label = `tile-${tile.address.level}-${tile.address.sx}-${tile.address.sy}`
          sprite.position.set(tile.address.sx, tile.address.sy)
          sprite.width = tile.address.sw
          sprite.height = tile.address.sh
          slot.sprite = sprite
          slot.texture = texture
          state.container.addChild(sprite)
        })
        .catch(() => {
          slot.loading = false
          /* a failed tile leaves a hole, not a crash */
        })
    }
  }

  /** Release every background-owned decoded/GPU resource. */
  destroy(): void {
    this.#generation += 1
    this.#currentHash = null
    this.#teardownImageResources()
    for (const child of [...this.#plane.children]) child.destroy({ children: true })
  }

  #teardownImageResources(): void {
    if (this.#plainTexture) {
      this.#destroyTexture(this.#plainTexture)
      this.#plainTexture = null
    }
    this.#teardownTiles()
  }

  #teardownTiles(): void {
    for (const state of this.#levels.values()) this.#destroyLevel(state)
    if (this.#source) {
      this.#source.destroy()
      this.#source = null
    }
    this.#levels.clear()
    this.#activeLevel = -1
  }

  #destroyLevel(state: LevelState): void {
    state.active = false
    for (const tile of state.tiles) this.#destroyTile(tile)
    state.container.destroy({ children: true })
  }

  #destroyTile(tile: LevelState['tiles'][number]): void {
    tile.sprite?.destroy()
    tile.sprite = null
    if (tile.texture) this.#destroyTexture(tile.texture)
    tile.texture = null
  }

  #destroyTexture(texture: unknown): void {
    if (this.#resources.destroyTexture) this.#resources.destroyTexture(texture)
    else (texture as Texture).destroy(true)
  }

  #applySettings(object: Container, settings: Record<string, unknown> | null): void {
    const s = (settings ?? {}) as BackgroundSettings
    object.position.set(s.x ?? 0, s.y ?? 0)
    const scale = s.scale ?? 1
    object.scale.set(scale)
    object.alpha = s.opacity ?? 1
  }
}
