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
  /** Content hash currently acquired from the texture budget. */
  __acquiredHash?: string | null
  /** Hash with an acquire in flight (double-grant guard). */
  __acquiring?: string | null
  /** Body natural size the sprite renders at when the texture lands. */
  __imageSize?: { width: number; height: number }
}

/** What the body is made of — a change forces a full rebuild. Size is
 * deliberately excluded: resizes adjust bodies in place so a resident
 * image never drops to its placeholder mid-gesture (AI-IMP-025). */
function identitySignature(item: ScenePlacement): string {
  return [
    item.appearanceKind,
    item.appearanceColor,
    item.appearanceIcon,
    item.assetContentHash,
    item.appearanceCrop,
  ].join('|')
}

function buildBody(
  container: PlacementObject,
  item: ScenePlacement,
  resources: RendererResources,
): void {
  const generation = (container.__textureGeneration ?? 0) + 1
  container.__textureGeneration = generation
  // The Culler only fires residency hooks on TRANSITIONS, so a body
  // rebuilt while resident must re-acquire its texture itself — no
  // re-grant is coming (this left permanent grey boxes, AI-IMP-025).
  const wasEngaged = Boolean(container.__acquiredHash || container.__acquiring)
  if (container.__acquiredHash && resources.textures) {
    // Appearance changed while resident: drop the old budget ref.
    resources.textures.release(container.__acquiredHash)
    container.__acquiredHash = null
  }
  // Any in-flight attach is stale now (generation bumped above); its
  // landing self-releases. Clear the flag so a re-acquire can start.
  container.__acquiring = null
  for (const child of [...container.children]) child.destroy()

  const kind = item.appearanceKind
  if (kind === 'image' && item.assetContentHash) {
    const width = item.width ?? item.assetWidth ?? 128
    const height = item.height ?? item.assetHeight ?? 128
    container.__imageSize = { width, height }
    const placeholder = new Graphics()
      .rect(-width / 2, -height / 2, width, height)
      .fill({ color: 0x2b2b2b })
    placeholder.label = 'image-placeholder'
    container.addChild(placeholder)
    // Without a texture budget, load eagerly (tests, simple hosts).
    // With one, residency is granted by the Culler via
    // setPlacementTextureResident — the body stays a placeholder
    // until the item nears the viewport (§12.2 lazy textures) —
    // unless it was already resident, in which case re-acquire now.
    if (!resources.textures) {
      void attachTexture(container, item.assetContentHash, generation, resources)
    } else if (wasEngaged) {
      container.__acquiring = item.assetContentHash
      void attachTexture(container, item.assetContentHash, generation, resources)
    }
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

async function attachTexture(
  container: PlacementObject,
  contentHash: string,
  generation: number,
  resources: RendererResources,
): Promise<void> {
  const url = assetUrl(contentHash)
  try {
    const texture = resources.textures
      ? await resources.textures.acquire(contentHash, url)
      : await resources.loadTexture(url)
    if (container.destroyed || container.__textureGeneration !== generation) {
      // Stale landing (rebuilt, revoked, or destroyed): return the ref.
      if (resources.textures) resources.textures.release(contentHash)
      return
    }
    const size = container.__imageSize ?? { width: 128, height: 128 }
    container.getChildByLabel('image-placeholder')?.destroy()
    const sprite = new Sprite(texture as Texture)
    sprite.label = 'image'
    sprite.anchor.set(0.5)
    sprite.width = size.width
    sprite.height = size.height
    container.addChildAt(sprite, 0)
    if (resources.textures) container.__acquiredHash = contentHash
  } catch {
    /* placeholder stays; a broken blob must not take down the scene */
  } finally {
    if (container.__acquiring === contentHash) container.__acquiring = null
  }
}

/**
 * Residency switch driven by the Culler (§12.2). Granting residency
 * acquires the texture through the budget and swaps the sprite in;
 * revoking swaps the placeholder back and releases the budget ref.
 * No-ops for non-image bodies and when no budget is configured.
 */
export function setPlacementTextureResident(
  object: Container,
  item: ScenePlacement,
  resources: RendererResources,
  resident: boolean,
): void {
  const container = object as PlacementObject
  if (!resources.textures) return
  if (item.appearanceKind !== 'image' || !item.assetContentHash) return
  if (resident) {
    if (container.__acquiredHash === item.assetContentHash) return
    if (container.__acquiring === item.assetContentHash) return
    container.__acquiring = item.assetContentHash
    void attachTexture(
      container,
      item.assetContentHash,
      container.__textureGeneration ?? 0,
      resources,
    )
  } else if (container.__acquiredHash || container.__acquiring) {
    // Invalidate any in-flight attach: its landing self-releases.
    container.__textureGeneration = (container.__textureGeneration ?? 0) + 1
    container.__acquiring = null
    const hash = container.__acquiredHash
    container.__acquiredHash = null
    const sprite = container.getChildByLabel('image')
    if (sprite) {
      sprite.destroy()
      const size = container.__imageSize ?? { width: 128, height: 128 }
      const placeholder = new Graphics()
        .rect(-size.width / 2, -size.height / 2, size.width, size.height)
        .fill({ color: 0x2b2b2b })
      placeholder.label = 'image-placeholder'
      container.addChildAt(placeholder, 0)
    }
    if (hash) resources.textures.release(hash)
  }
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

/** In-place resize for image bodies: adjust the sprite (or its
 * placeholder) instead of rebuilding, so ephemeral resize gestures
 * keep the texture on screen every frame. Vector bodies (dot, icon)
 * redraw exactly via buildBody — they have no residency state. */
function resizeImageBody(container: PlacementObject, item: ScenePlacement): void {
  const width = item.width ?? item.assetWidth ?? 128
  const height = item.height ?? item.assetHeight ?? 128
  container.__imageSize = { width, height }
  const body =
    container.getChildByLabel('image') ?? container.getChildByLabel('image-placeholder')
  if (body) {
    ;(body as Sprite).width = width
    ;(body as Sprite).height = height
  }
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
    const container = object as PlacementObject
    const sizeChanged = item.width !== previous.width || item.height !== previous.height
    if (identitySignature(item) !== identitySignature(previous)) {
      // buildBody clears ALL children (label included); syncLabel below
      // recreates it against the new body size.
      buildBody(container, item, resources)
    } else if (sizeChanged) {
      if (item.appearanceKind === 'image' && item.assetContentHash) {
        resizeImageBody(container, item)
      } else {
        buildBody(container, item, resources)
      }
    }
    applyTransform(object, item)
    syncLabel(object, item)
  },
}
