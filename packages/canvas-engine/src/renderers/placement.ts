import { Container, Graphics, Sprite, Text, Texture } from 'pixi.js'
import { assetUrl, type ScenePlacement } from '../types'
import type { ItemRenderer, RendererResources } from './registry'

/**
 * Placement renderer: dot, icon placeholder, or image appearance
 * (§4.6). Convention shared with hit-testing and gestures: placement
 * (x, y) is the CENTER of the body, and rotation/flip apply about it
 * — bodies are drawn centered on the local origin. The label (§4.5)
 * is a Text child under the body: it exists only when the node has a
 * note AND label visibility is on, and its size is proportional to
 * the placement's world size (rev 0.8 — labels are world content,
 * never screen-space overlays, and there is no legibility clamping).
 */

export const DEFAULT_DOT_RADIUS = 12

/** §4.5: label font size = body height × this single tuning ratio. */
export const LABEL_HEIGHT_RATIO = 0.18

const LABEL_COLOR = 0xc8cfd8

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

/** Unscaled body extent the label hangs under (container scale applies on top). */
function labelBasis(item: ScenePlacement): { height: number } {
  return {
    height: item.height ?? item.width ?? item.assetHeight ?? DEFAULT_DOT_RADIUS * 2,
  }
}

/**
 * Creates, updates, or removes the label Text child. Called on every
 * update so renames (new noteTitle through the scene re-query),
 * visibility toggles, and resizes all reflow it. Flip is applied to
 * the container as scale sign, so the label counter-flips to stay
 * readable and stays below the body in world space.
 */
function syncLabel(container: Container, item: ScenePlacement): void {
  const existing = container.children.find((child) => child.label === 'label') as
    | Text
    | undefined
  const title = item.noteTitle
  if (title === null || item.labelVisible !== 1) {
    existing?.destroy()
    return
  }
  const fontSize = labelBasis(item).height * LABEL_HEIGHT_RATIO
  let label = existing
  if (!label) {
    label = new Text({ text: title, style: { fontSize, fill: LABEL_COLOR } })
    label.label = 'label'
    label.anchor.set(0.5, 0)
    container.addChild(label)
  } else {
    label.text = title
    label.style.fontSize = fontSize
  }
  const flipY = item.flipY === 1
  label.position.set(0, (labelBasis(item).height / 2 + fontSize * 0.35) * (flipY ? -1 : 1))
  label.scale.set(item.flipX ? -1 : 1, flipY ? -1 : 1)
}

export const placementRenderer: ItemRenderer<ScenePlacement> = {
  create(item, resources) {
    const container: PlacementObject = new Container()
    container.label = `placement:${item.id}`
    buildBody(container, item, resources)
    applyTransform(container, item)
    syncLabel(container, item)
    return container
  },
  update(object, item, previous, resources) {
    if (appearanceSignature(item) !== appearanceSignature(previous)) {
      // buildBody clears ALL children (label included); syncLabel below
      // recreates it against the new body size.
      buildBody(object as PlacementObject, item, resources)
    }
    applyTransform(object, item)
    syncLabel(object, item)
  },
}
