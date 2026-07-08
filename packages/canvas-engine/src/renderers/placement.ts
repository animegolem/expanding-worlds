import { Container, Graphics, Matrix, NineSliceSprite, Sprite, Text, Texture } from 'pixi.js'
import { assetUrl, type ScenePlacement } from '../types'
import { EW_FURNITURE_MIN_PX } from '../shrink-ladder'
import { renderStrokeWidth } from '../stroke-render'
import type { ImageTreatment, ItemRenderer, RendererResources } from './registry'

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
/** §7.1 editor face (AI-IMP-131): the card title + excerpt are note
 * TEXT, so they bake in Maple Mono (the ONE typography carve-out). The
 * host warms these faces at boot (document.fonts.load) before the scene
 * applies; ui-monospace is the graceful fallback until they land. */
const CARD_FONT_FAMILY = "'Maple Mono', ui-monospace, Menlo, monospace"
/** Deterministic single-line clamp — no canvas text measuring. */
const CARD_TITLE_MAX_CHARS = 28
const CARD_SURFACE = 0x2b323c
const CARD_BORDER = 0x555f6d
const CARD_TITLE_COLOR = 0xdde3ea
const CARD_EXCERPT_COLOR = 0xa9b3bf
const CARD_PHANTOM_BORDER = 0x8a94a0

/**
 * §4.9 frame appearance (AI-IMP-127): a drawn region other content
 * sits inside — "furniture, not art", so the fill is a low-alpha wash
 * and the border a thin subtle line. Colors come from theme tokens via
 * resources.frameColors (no raw hex here); only the alpha/geometry
 * feel constants live in code. The fallback is used only by minimal
 * test hosts that inject no theme colors.
 */
export const DEFAULT_FRAME_SIZE = 200
const FRAME_FILL_ALPHA = 0.16
const FRAME_BORDER_ALPHA = 0.85
const FRAME_BORDER_WIDTH = 2
const FRAME_CORNER_RADIUS = 6
const FRAME_FALLBACK = { fill: 0x20242b, border: 0x3a3e46, label: 0x79808a }

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
  /** The resident image texture (§8.5): kept so an in-place resize can
   * redraw the rounded body Graphics without dropping to placeholder. */
  __imageTexture?: Texture
  /** §4.6 parsed appearance crop (AI-IMP-159), stored at buildBody time
   * so the async texture landing draws the same region without
   * re-parsing wire JSON. Null = uncropped. */
  __imageCrop?: PlacementCrop | null
  /** §8.2/AI-IMP-138: the world-unit border width the frame region was
   * last drawn at, so the per-cull stroke floor re-derive (camera
   * motion runs no renderer update) is a no-op unless the floor bites. */
  __frameStrokeWidth?: number
}

/**
 * §4.6 non-destructive display crop (AI-IMP-159): a normalized
 * source-space rect (all fields 0..1 against the full image). The wire
 * carries it as JSON in `appearanceCrop`; the asset itself is NEVER
 * modified — the crop only remaps the fill's texture UVs.
 */
export interface PlacementCrop {
  x: number
  y: number
  width: number
  height: number
}

/** Parse the wire crop JSON leniently: any malformed / non-finite /
 * empty-region value renders as uncropped rather than taking down the
 * scene (mirrors attachTexture's broken-blob tolerance). */
export function parsePlacementCrop(raw: string | null): PlacementCrop | null {
  if (!raw) return null
  try {
    const value = JSON.parse(raw) as Partial<PlacementCrop> | null
    const rect = {
      x: Number(value?.x),
      y: Number(value?.y),
      width: Number(value?.width),
      height: Number(value?.height),
    }
    const finite = [rect.x, rect.y, rect.width, rect.height].every((v) => Number.isFinite(v))
    if (!finite || rect.width <= 0 || rect.height <= 0) return null
    // The full frame is the uncropped identity.
    if (rect.x === 0 && rect.y === 0 && rect.width === 1 && rect.height === 1) return null
    return rect
  } catch {
    return null
  }
}

/**
 * The crop → UV fill matrix. Pixi's textureSpace 'local' maps the
 * shape's bounds onto UV 0..1 of the WHOLE source and ignores
 * texture.frame (generateTextureMatrix's local branch), so sub-frame
 * textures cannot crop a local fill. `style.matrix` IS honored — it is
 * inverted and composed with the local mapping, giving final
 * UV = matrix⁻¹ · localNormalized. We want localNormalized u ∈ 0..1 to
 * sample crop.x + u·crop.width, i.e. matrix⁻¹ = translate(crop)·scale
 * (crop) — so the style matrix is its inverse. This keeps the ONE
 * shared budget texture (same-source images stay in one batch) and
 * never copies pixels: the crop is pure sampling.
 */
export function cropFillMatrix(crop: PlacementCrop): Matrix {
  return new Matrix(1 / crop.width, 0, 0, 1 / crop.height, -crop.x / crop.width, -crop.y / crop.height)
}

/** §8.5 image body treatment (AI-IMP-140): host-injected radius + shadow,
 * or null when a minimal test host injects none (raw untreated sprites). */
function imageTreatment(resources: RendererResources): ImageTreatment | null {
  return resources.imageTreatment?.() ?? null
}

/**
 * Draws (or redraws) an image body: a rounded rect filled with the
 * texture, stretched to the placement rect via textureSpace 'local'
 * (AI-IMP-140). No per-sprite Graphics mask and no custom shader — the
 * rounded quad keeps every same-texture image in the shared Graphics
 * batch, and the texture is SAMPLED, never modified, so exports/crops
 * read original pixels. A §4.6 crop (AI-IMP-159) remaps the fill's UVs
 * through the style matrix so only the cropped source region stretches
 * onto the rect — the radius/shadow treatment composes unchanged
 * because the body GEOMETRY (rounded rect + 9-slice shadow) is
 * untouched; only what the fill samples moves.
 */
function drawImageBody(
  gfx: Graphics,
  texture: Texture,
  width: number,
  height: number,
  radius: number,
  crop: PlacementCrop | null,
): void {
  gfx.clear()
  gfx.roundRect(-width / 2, -height / 2, width, height, radius).fill({
    texture,
    textureSpace: 'local',
    ...(crop ? { matrix: cropFillMatrix(crop) } : {}),
  })
}

/** The loading placeholder shares the image body's rounded silhouette so
 * the corner treatment does not pop in when the texture lands. */
function drawImagePlaceholder(
  gfx: Graphics,
  width: number,
  height: number,
  radius: number,
): void {
  gfx.clear()
  gfx.roundRect(-width / 2, -height / 2, width, height, radius).fill({ color: 0x2b2b2b })
}

/**
 * §8.5 soft drop shadow (AI-IMP-140): one shared 9-slice silhouette
 * texture (host-built) sits under the body, sized to the placement plus
 * the token's spread, offset down, alpha from the token. One texture
 * means every image shadow batches. Creates, resizes, or removes the
 * shadow child and keeps it at the back of the body.
 */
function syncImageShadow(
  container: PlacementObject,
  width: number,
  height: number,
  resources: RendererResources,
): void {
  const shadow = imageTreatment(resources)?.shadow ?? null
  const existing = container.getChildByLabel('image-shadow') as NineSliceSprite | null
  if (!shadow) {
    existing?.destroy()
    return
  }
  const sw = width + shadow.spread * 2
  const sh = height + shadow.spread * 2
  let nine = existing
  if (!nine) {
    nine = new NineSliceSprite({
      texture: shadow.texture,
      leftWidth: shadow.inset,
      topHeight: shadow.inset,
      rightWidth: shadow.inset,
      bottomHeight: shadow.inset,
      width: sw,
      height: sh,
    })
    nine.label = 'image-shadow'
    // Always the backmost child: content and label paint over it.
    container.addChildAt(nine, 0)
  } else {
    nine.width = sw
    nine.height = sh
    if (nine.texture !== shadow.texture) nine.texture = shadow.texture
  }
  nine.alpha = shadow.alpha
  nine.position.set(-sw / 2, -sh / 2 + shadow.offsetY)
}

/** Index to insert a rebuilt image body at: above the shadow (kept at 0)
 * but below any label the sync pass appended. */
function imageBodyIndex(container: PlacementObject): number {
  return container.getChildByLabel('image-shadow') ? 1 : 0
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
    // §4.6 crop: parsed once per rebuild — appearanceCrop sits in
    // identitySignature, so a crop change always lands here.
    container.__imageCrop = parsePlacementCrop(item.appearanceCrop)
    delete container.__imageTexture
    const radius = imageTreatment(resources)?.radius ?? 0
    const placeholder = new Graphics()
    placeholder.label = 'image-placeholder'
    drawImagePlaceholder(placeholder, width, height, radius)
    container.addChild(placeholder)
    // §8.5 shadow sits UNDER the body; built here so it is present for
    // the placeholder too and never pops in when the texture lands.
    syncImageShadow(container, width, height, resources)
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

  if (kind === 'frame') {
    buildFrameBody(container, item, resources)
    return
  }

  if (kind === 'icon') {
    const size = item.width ?? DEFAULT_DOT_RADIUS * 2
    const iconId = item.appearanceIcon
    const frames = iconId ? (resources.iconAtlas?.frames(iconId) ?? null) : null
    if (resources.iconAtlas && frames && frames.length > 0) {
      // §8.2 object glyph: a sprite from the shared atlas, plus the
      // dot it degrades to below the furniture threshold. Both are
      // built once; the LOD pass toggles which one is visible (and
      // picks the crispest tier) as zoom changes — no rebuild.
      const dot = new Graphics()
        .circle(0, 0, size / 2)
        .fill({ color: resources.iconAtlas.dotColor(iconId!) })
      dot.label = 'icon-dot'
      dot.visible = false
      container.addChild(dot)
      const sprite = new Sprite(frames[0] as Texture)
      sprite.label = 'icon-object'
      sprite.anchor.set(0.5)
      sprite.setSize(size)
      container.addChild(sprite)
      syncPlacementIconLod(container, item, resources.getZoom?.() ?? 1, resources)
      return
    }
    // Fallback: no atlas injected (minimal test hosts) — the generic
    // diamond glyph, so a bare renderer still shows an icon body.
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
 * §4.9 frame region: a rounded rect drawn centered on the body origin,
 * sized straight from placement width/height (rev 0.54 — the drawn
 * size rides placement geometry). Subordinate to content: a low-alpha
 * fill and a thin border so images placed on top read first. Colors
 * are theme-token numbers injected via resources.frameColors, so no
 * literal color lives in this renderer.
 */
function buildFrameBody(
  container: PlacementObject,
  item: ScenePlacement,
  resources: RendererResources,
): void {
  const w = item.width ?? DEFAULT_FRAME_SIZE
  const h = item.height ?? DEFAULT_FRAME_SIZE
  const colors = resources.frameColors?.() ?? FRAME_FALLBACK
  const region = new Graphics()
  region.label = 'frame'
  const width = frameRegionStrokeWidth(item, resources.getZoom?.() ?? 1)
  drawFrameRegion(region, w, h, colors, width)
  container.__frameStrokeWidth = width
  container.addChild(region)
}

/** Draw (or redraw) a frame region's wash + border at a given world
 * stroke width. Clears first so the same Graphics can be re-stroked in
 * place when the zoom floor changes (syncFrameRegionStroke). */
function drawFrameRegion(
  region: Graphics,
  w: number,
  h: number,
  colors: { fill: number; border: number },
  strokeWidth: number,
): void {
  region.clear()
  region
    .roundRect(-w / 2, -h / 2, w, h, FRAME_CORNER_RADIUS)
    .fill({ color: colors.fill, alpha: FRAME_FILL_ALPHA })
    .stroke({ width: strokeWidth, color: colors.border, alpha: FRAME_BORDER_ALPHA })
}

/**
 * §8.2/AI-IMP-138 minimum region stroke: the world-unit border width to
 * draw a frame at for the current zoom, floored (renderStrokeWidth) so
 * the rasterized stroke never drops below MIN_STROKE_SCREEN_PX. A
 * frame's region IS its membership boundary — it must stay visible even
 * below the furniture floor, where the on-edge title and other
 * furniture are gone. The effective on-screen scale is zoom × the
 * placement's own scale (the world plane and the container both scale
 * the local stroke), so the floor is computed against that product.
 */
export function frameRegionStrokeWidth(item: ScenePlacement, zoom: number): number {
  const scale = Math.abs(item.scale) || 1
  return renderStrokeWidth(FRAME_BORDER_WIDTH, zoom * scale)
}

/**
 * Re-derive a frame region's border width for the current zoom and
 * redraw it in place when the floor bites. Camera motion runs no
 * renderer update, so the host re-runs this every cull pass (mirrors
 * syncPlacementIconLod). Cheap and idempotent: a cached width makes it
 * a no-op whenever the true width is unchanged. No-op for non-frame
 * bodies and for containers without a built frame region.
 */
export function syncFrameRegionStroke(
  object: Container,
  item: ScenePlacement,
  zoom: number,
  resources: RendererResources,
): void {
  if (item.appearanceKind !== 'frame') return
  const container = object as PlacementObject
  const region = object.children.find((child) => child.label === 'frame') as Graphics | undefined
  if (!region) return
  const width = frameRegionStrokeWidth(item, zoom)
  if (container.__frameStrokeWidth === width) return
  container.__frameStrokeWidth = width
  const w = item.width ?? DEFAULT_FRAME_SIZE
  const h = item.height ?? DEFAULT_FRAME_SIZE
  const colors = resources.frameColors?.() ?? FRAME_FALLBACK
  drawFrameRegion(region, w, h, colors, width)
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
      style: {
        fontFamily: CARD_FONT_FAMILY,
        fontSize: CARD_TITLE_SIZE,
        fill: CARD_TITLE_COLOR,
        fontWeight: '600',
      },
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
          fontFamily: CARD_FONT_FAMILY,
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
    const placeholder = container.getChildByLabel('image-placeholder')
    const insertIndex = placeholder
      ? container.getChildIndex(placeholder)
      : imageBodyIndex(container)
    placeholder?.destroy()
    const radius = imageTreatment(resources)?.radius ?? 0
    const body = new Graphics()
    body.label = 'image'
    drawImageBody(
      body,
      texture as Texture,
      size.width,
      size.height,
      radius,
      container.__imageCrop ?? null,
    )
    container.__imageTexture = texture as Texture
    container.addChildAt(body, Math.min(insertIndex, container.children.length))
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
      const index = container.getChildIndex(sprite)
      sprite.destroy()
      delete container.__imageTexture
      const size = container.__imageSize ?? { width: 128, height: 128 }
      const radius = imageTreatment(resources)?.radius ?? 0
      const placeholder = new Graphics()
      placeholder.label = 'image-placeholder'
      drawImagePlaceholder(placeholder, size.width, size.height, radius)
      container.addChildAt(placeholder, Math.min(index, container.children.length))
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
 * §4.5 label metric: Pixi lays a single-line label out in the font's
 * own line box, whose measured height is ~1.2×fontSize. This ratio
 * slightly over-covers that so callers that must clear the label
 * (the §8.4 charm bar, AI-IMP-161) never cut into a descender. The
 * ONLY place the label's rendered height is named — derive it here,
 * never re-derive text metrics in the desktop app.
 */
export const LABEL_TEXT_HEIGHT_RATIO = 1.3

/** True when syncLabel would draw an under-body label for this item. */
function hasUnderBodyLabel(item: ScenePlacement): boolean {
  // Mirrors syncLabel's guard (title/visibility/§4.6 card) plus flipY:
  // a y-flipped placement's label hangs ABOVE the body, so nothing
  // reaches below the bottom edge.
  return (
    item.noteTitle !== null &&
    item.labelVisible === 1 &&
    item.appearanceKind !== 'card' &&
    item.flipY !== 1
  )
}

/**
 * World-space Y of the visible label's bottom edge, matching
 * syncLabel/syncPlacementLabelOffset exactly: the body's bottom edge,
 * a fixed LABEL_CLEARANCE_PX screen gap (→ world via zoom), then the
 * world-scaled glyph box. Null when no label reaches below the body
 * (no note, label hidden, a §4.6 card whose chrome carries the title,
 * or a y-flip that lifts the label above the body). Zoom enters only
 * through the screen-space clearance term.
 */
export function placementLabelWorldBottom(item: ScenePlacement, zoom: number): number | null {
  if (!hasUnderBodyLabel(item)) return null
  const basis = labelBasis(item).height * (Math.abs(item.scale) || 1)
  const safeZoom = zoom > 0 ? zoom : 1
  const bodyBottom = item.y + basis / 2
  const clearanceWorld = LABEL_CLEARANCE_PX / safeZoom
  const glyphWorld = basis * LABEL_HEIGHT_RATIO * LABEL_TEXT_HEIGHT_RATIO
  return bodyBottom + clearanceWorld + glyphWorld
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

/**
 * §8.2 icon level-of-detail (AI-IMP-132). Object icons carry two
 * bodies — the atlas sprite and the plain dot — and this toggles
 * which is visible by the icon's RENDERED screen size (body world
 * size × zoom × container scale), degrading to the dot below
 * EW_FURNITURE_MIN_PX (the shared shrink-ladder furniture floor).
 * Above it, the crispest atlas tier ≥ the
 * rendered size is selected; swapping tiers reassigns a frame of the
 * SAME base texture, so batching is preserved. Cheap and idempotent:
 * the host re-runs it every cull pass so camera motion needs no
 * renderer update (mirrors syncPlacementLabelOffset). No-op for
 * non-atlas icon bodies (the generic-glyph fallback).
 */
export function syncPlacementIconLod(
  object: Container,
  item: ScenePlacement,
  zoom: number,
  resources: RendererResources,
): void {
  const sprite = object.children.find((child) => child.label === 'icon-object') as
    | Sprite
    | undefined
  const dot = object.children.find((child) => child.label === 'icon-dot')
  if (!sprite || !dot) return
  const size = item.width ?? DEFAULT_DOT_RADIUS * 2
  const safeZoom = zoom > 0 ? zoom : 1
  const rendered = size * safeZoom * (Math.abs(item.scale) || 1)
  const belowFurniture = rendered < EW_FURNITURE_MIN_PX
  sprite.visible = !belowFurniture
  dot.visible = belowFurniture
  if (belowFurniture) return
  const iconId = item.appearanceIcon
  const atlas = resources.iconAtlas
  const frames = iconId ? (atlas?.frames(iconId) ?? null) : null
  if (!atlas || !frames || frames.length === 0) return
  // Smallest tier ≥ rendered px (crisp minification), else the largest.
  let chosenIndex = 0
  let chosenTier = Infinity
  let largestIndex = 0
  let largestTier = -Infinity
  atlas.tiers.forEach((tier, index) => {
    if (tier > largestTier) {
      largestTier = tier
      largestIndex = index
    }
    if (tier >= rendered && tier < chosenTier) {
      chosenTier = tier
      chosenIndex = index
    }
  })
  const index = Number.isFinite(chosenTier) ? chosenIndex : largestIndex
  const texture = frames[index] as Texture
  if (sprite.texture !== texture) {
    sprite.texture = texture
    // Reassigning the texture resets the sprite to the frame's natural
    // size; re-pin it to the body's world size.
    sprite.setSize(size)
  }
}

/** In-place resize for image bodies: adjust the sprite (or its
 * placeholder) instead of rebuilding, so ephemeral resize gestures
 * keep the texture on screen every frame. Vector bodies (dot, icon)
 * redraw exactly via buildBody — they have no residency state. */
function resizeImageBody(
  container: PlacementObject,
  item: ScenePlacement,
  resources: RendererResources,
): void {
  const width = item.width ?? item.assetWidth ?? 128
  const height = item.height ?? item.assetHeight ?? 128
  container.__imageSize = { width, height }
  const radius = imageTreatment(resources)?.radius ?? 0
  // Redraw the rounded body geometry in place (the texture, if resident,
  // is preserved so the image never blinks to placeholder mid-gesture).
  // The crop rides along unchanged: a crop CHANGE goes through
  // identitySignature → buildBody, never this resize path.
  const image = container.getChildByLabel('image') as Graphics | null
  if (image && container.__imageTexture) {
    drawImageBody(image, container.__imageTexture, width, height, radius, container.__imageCrop ?? null)
  } else {
    const placeholder = container.getChildByLabel('image-placeholder') as Graphics | null
    if (placeholder) drawImagePlaceholder(placeholder, width, height, radius)
  }
  syncImageShadow(container, width, height, resources)
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
        resizeImageBody(container, item, resources)
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
