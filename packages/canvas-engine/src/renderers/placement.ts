import { Container, Graphics, Sprite, Texture } from 'pixi.js'
import { assetUrl, type ScenePlacement } from '../types'
import type { ItemRenderer, RendererResources } from './registry'

/**
 * Placement renderer: dot, icon placeholder, or image appearance
 * (§4.6). Convention shared with hit-testing and gestures: placement
 * (x, y) is the CENTER of the body, and rotation/flip apply about it
 * — bodies are drawn centered on the local origin. Labels are added
 * by AI-IMP-019.
 */

export const DEFAULT_DOT_RADIUS = 12

export function cssColorToNumber(color: string | null, fallback = 0x4a90d9): number {
  if (!color) return fallback
  const hex = color.startsWith('#') ? color.slice(1) : color
  const full =
    hex.length === 3
      ? hex
          .split('')
          .map((c) => c + c)
          .join('')
      : hex
  const parsed = Number.parseInt(full, 16)
  return Number.isNaN(parsed) ? fallback : parsed
}

interface PlacementObject extends Container {
  /** Generation guard so a stale async texture never lands. */
  __textureGeneration?: number
}

function appearanceSignature(item: ScenePlacement): string {
  return [
    item.appearanceKind,
    item.appearanceColor,
    item.appearanceIcon,
    item.assetContentHash,
    item.appearanceCrop,
    item.width,
    item.height,
  ].join('|')
}

function buildBody(
  container: PlacementObject,
  item: ScenePlacement,
  resources: RendererResources,
): void {
  const generation = (container.__textureGeneration ?? 0) + 1
  container.__textureGeneration = generation
  for (const child of [...container.children]) child.destroy()

  const kind = item.appearanceKind
  if (kind === 'image' && item.assetContentHash) {
    const width = item.width ?? item.assetWidth ?? 128
    const height = item.height ?? item.assetHeight ?? 128
    const placeholder = new Graphics()
      .rect(-width / 2, -height / 2, width, height)
      .fill({ color: 0x2b2b2b })
    placeholder.label = 'image-placeholder'
    container.addChild(placeholder)
    void resources
      .loadTexture(assetUrl(item.assetContentHash))
      .then((texture) => {
        if (container.destroyed || container.__textureGeneration !== generation) return
        placeholder.destroy()
        const sprite = new Sprite(texture as Texture)
        sprite.label = 'image'
        sprite.anchor.set(0.5)
        sprite.width = width
        sprite.height = height
        container.addChildAt(sprite, 0)
      })
      .catch(() => {
        /* placeholder stays; a broken blob must not take down the scene */
      })
    return
  }

  if (kind === 'icon') {
    const size = item.width ?? DEFAULT_DOT_RADIUS * 2
    const half = size / 2
    const glyph = new Graphics()
      .roundRect(-half, -half, size, size, size / 5)
      .fill({ color: 0x555f6d })
      .poly([0, -half / 2, half / 2, 0, 0, half / 2, -half / 2, 0])
      .fill({ color: 0xdde3ea })
    glyph.label = 'icon'
    container.addChild(glyph)
    return
  }

  // Dot appearance — and the visible default for appearance-less nodes.
  const radius = item.width != null ? item.width / 2 : DEFAULT_DOT_RADIUS
  const dot = new Graphics()
  if (kind === 'dot') {
    dot.circle(0, 0, radius).fill({ color: cssColorToNumber(item.appearanceColor) })
  } else {
    dot.circle(0, 0, radius).stroke({ width: 2, color: 0x8a94a0 })
  }
  dot.label = kind === 'dot' ? 'dot' : 'bare-node'
  container.addChild(dot)
}

function applyTransform(container: Container, item: ScenePlacement): void {
  container.position.set(item.x, item.y)
  container.rotation = item.rotation
  container.scale.set(item.scale * (item.flipX ? -1 : 1), item.scale * (item.flipY ? -1 : 1))
}

export const placementRenderer: ItemRenderer<ScenePlacement> = {
  create(item, resources) {
    const container: PlacementObject = new Container()
    container.label = `placement:${item.id}`
    buildBody(container, item, resources)
    applyTransform(container, item)
    return container
  },
  update(object, item, previous, resources) {
    if (appearanceSignature(item) !== appearanceSignature(previous)) {
      buildBody(object as PlacementObject, item, resources)
    }
    applyTransform(object, item)
  },
}
