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
export const LABEL_HEIGHT_RATIO = 0.14

const LABEL_COLOR = 0xc8cfd8

/**
 * §6.9 selection outline geometry in SCREEN pixels (AI-IMP-087).
 * Defined here — next to the label clearance that must out-reach
 * them — and imported by the host's drawSelection, so the outline
 * and the label clearance cannot drift apart. The multi-select AABB
 * box pads the rect by PAD before stroking; the single-item oriented
 * box hugs the corners (stroke only), so PAD + STROKE is the
 * worst-case outer reach of the outline beyond the body edge.
 */
export const SELECTION_OUTLINE_PAD_PX = 2
export const SELECTION_OUTLINE_STROKE_PX = 1.5
/** Breathing room between the outline's outer edge and the label. */
export const LABEL_OUTLINE_GAP_PX = 3
/**
 * Screen-space distance from the body edge to the label's near edge:
 * outline pad + stroke + gap. Reserved whether or not the item is
 * selected, so selecting never jumps the label.
 */
export const LABEL_CLEARANCE_PX =
  SELECTION_OUTLINE_PAD_PX + SELECTION_OUTLINE_STROKE_PX + LABEL_OUTLINE_GAP_PX

/**
 * §4.6 card appearance (rev 0.31, AI-IMP-084): the fixed chrome's
 * design size in world units. The chrome is laid out ONCE at this
 * size and the group scales onto the placement rect, so resize
 * stretches the card like an image body. The scene projection
 * (persistence queries-structure) mirrors these numbers to coalesce
 * unsized card placements — hit box = the card rect.
 */
export const CARD_DEFAULT_WIDTH = 260
export const CARD_DEFAULT_HEIGHT = 160
const CARD_CORNER_RADIUS = 10
const CARD_PADDING = 14
const CARD_TITLE_SIZE = 16
const CARD_EXCERPT_SIZE = 12
/** Deterministic single-line clamp — no canvas text measuring. */
const CARD_TITLE_MAX_CHARS = 28
const CARD_SURFACE = 0x2b323c
const CARD_BORDER = 0x555f6d
const CARD_TITLE_COLOR = 0xdde3ea
const CARD_EXCERPT_COLOR = 0xa9b3bf
const CARD_PHANTOM_BORDER = 0x8a94a0

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

  if (kind === 'card') {
    buildCardBody(container, item)
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

/**
 * §4.6 note card: fixed chrome — rounded rect, title line, clamped
 * excerpt — rendered as world content with NO shadow (§8.5: the
 * shadow is the depth cue for screen-space panels; flat means part
 * of the world). Content comes from the projection's noteTitle /
 * noteExcerpt, so note edits repaint through the ordinary scene
 * refresh. A card node with NO note renders the §7.2 phantom state:
 * empty chrome, nothing printed, until the first committed edit.
 */
function buildCardBody(container: PlacementObject, item: ScenePlacement): void {
  const group = new Container()
  group.label = 'card'
  const hasNote = item.noteId !== null
  const w = CARD_DEFAULT_WIDTH
  const h = CARD_DEFAULT_HEIGHT
  const chrome = new Graphics()
  chrome.label = hasNote ? 'card-chrome' : 'card-chrome-phantom'
  chrome.roundRect(-w / 2, -h / 2, w, h, CARD_CORNER_RADIUS)
  if (hasNote) {
    chrome.fill({ color: CARD_SURFACE }).stroke({ width: 1.5, color: CARD_BORDER })
  } else {
    // Phantom card (§7.2): visibly a card-shaped absence.
    chrome.stroke({ width: 1.5, color: CARD_PHANTOM_BORDER })
  }
  group.addChild(chrome)
  if (hasNote) {
    const rawTitle = item.noteTitle ?? ''
    const title =
      rawTitle.length > CARD_TITLE_MAX_CHARS
        ? `${rawTitle.slice(0, CARD_TITLE_MAX_CHARS - 1)}…`
        : rawTitle
    const titleText = new Text({
      text: title,
      style: { fontSize: CARD_TITLE_SIZE, fill: CARD_TITLE_COLOR, fontWeight: '600' },
    })
    titleText.label = 'card-title'
    titleText.position.set(-w / 2 + CARD_PADDING, -h / 2 + CARD_PADDING)
    group.addChild(titleText)
    // Whitespace collapses so a newline-heavy body cannot overflow
    // the fixed chrome vertically (plain-text clamp; rich rendering
    // is polish per the ticket).
    const excerpt = (item.noteExcerpt ?? '').replace(/\s+/g, ' ').trim()
    if (excerpt.length > 0) {
      const excerptText = new Text({
        text: excerpt,
        style: {
          fontSize: CARD_EXCERPT_SIZE,
          fill: CARD_EXCERPT_COLOR,
          wordWrap: true,
          wordWrapWidth: w - CARD_PADDING * 2,
          lineHeight: CARD_EXCERPT_SIZE * 1.35,
        },
      })
      excerptText.label = 'card-excerpt'
      excerptText.position.set(-w / 2 + CARD_PADDING, -h / 2 + CARD_PADDING + CARD_TITLE_SIZE * 1.6)
      group.addChild(excerptText)
    }
  }
  // Fixed layout, scaled onto the placement rect (resize stretches).
  group.scale.set((item.width ?? w) / w, (item.height ?? h) / h)
  container.addChild(group)
}

/** In-place card resize: the chrome layout is fixed; only the group
 * scale maps it onto the new rect (no per-frame Text rebuilds). */
function resizeCardBody(container: PlacementObject, item: ScenePlacement): void {
  const group = container.getChildByLabel('card')
  if (group) {
    group.scale.set(
      (item.width ?? CARD_DEFAULT_WIDTH) / CARD_DEFAULT_WIDTH,
      (item.height ?? CARD_DEFAULT_HEIGHT) / CARD_DEFAULT_HEIGHT,
    )
  }
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
function syncLabel(container: Container, item: ScenePlacement, zoom: number): void {
  const existing = container.children.find((child) => child.label === 'label') as
    | Text
    | undefined
  const title = item.noteTitle
  // §4.6 card: the chrome's title line IS the label — an under-label
  // would print the title twice.
  if (title === null || item.labelVisible !== 1 || item.appearanceKind === 'card') {
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
  label.scale.set(item.flipX ? -1 : 1, item.flipY === 1 ? -1 : 1)
  syncPlacementLabelOffset(container, item, zoom)
}

/**
 * AI-IMP-087: hangs the label a constant SCREEN distance under the
 * body edge — LABEL_CLEARANCE_PX / zoom in world units — so the §6.9
 * screen-scale selection outline never runs through the §4.5
 * world-scale label as zoom-out compresses world gaps. Divides out
 * the container scale too (the label is a child, so item.scale
 * applies on top of local units). The host re-applies this each cull
 * pass: camera motion never re-runs renderer updates.
 */
export function syncPlacementLabelOffset(
  object: Container,
  item: ScenePlacement,
  zoom: number,
): void {
  const label = object.children.find((child) => child.label === 'label')
  if (!label) return
  const scale = Math.abs(item.scale) || 1
  const safeZoom = zoom > 0 ? zoom : 1
  const clearanceLocal = LABEL_CLEARANCE_PX / (safeZoom * scale)
  const offset = labelBasis(item).height / 2 + clearanceLocal
  // flipY negates the container's y-scale; negating the local offset
  // keeps the label below the body in world space (its own scale
  // sign, set in syncLabel, un-mirrors the glyphs).
  label.position.set(0, offset * (item.flipY === 1 ? -1 : 1))
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
    syncLabel(container, item, resources.getZoom?.() ?? 1)
    return container
  },
  update(object, item, previous, resources) {
    const container = object as PlacementObject
    const sizeChanged = item.width !== previous.width || item.height !== previous.height
    // §4.6 card content lives OUTSIDE identitySignature (adding note
    // fields there would rebuild image bodies on every rename and
    // drop texture residency): note edits repaint the card here.
    const cardContentChanged =
      item.appearanceKind === 'card' &&
      (item.noteTitle !== previous.noteTitle ||
        (item.noteExcerpt ?? null) !== (previous.noteExcerpt ?? null) ||
        (item.noteId === null) !== (previous.noteId === null))
    if (identitySignature(item) !== identitySignature(previous) || cardContentChanged) {
      // buildBody clears ALL children (label included); syncLabel below
      // recreates it against the new body size.
      buildBody(container, item, resources)
    } else if (sizeChanged) {
      if (item.appearanceKind === 'image' && item.assetContentHash) {
        resizeImageBody(container, item)
      } else if (item.appearanceKind === 'card') {
        resizeCardBody(container, item)
      } else {
        buildBody(container, item, resources)
      }
    }
    applyTransform(object, item)
    syncLabel(object, item, resources.getZoom?.() ?? 1)
  },
}
