import { Container, Graphics, Matrix, NineSliceSprite, Sprite, Text, Texture } from 'pixi.js'
import { assetUrl, type ScenePlacement } from '../types'
import { EW_FURNITURE_MIN_PX, EW_PAGE_FLOOR_PX } from '../shrink-ladder'
import { renderStrokeWidth } from '../stroke-render'
import type { ImageTreatment, ItemRenderer, RendererResources } from './registry'

/**
 * Placement renderer: dot, icon placeholder, or image appearance
 * (§4.6). Convention shared with hit-testing and gestures: placement
 * (x, y) is the CENTER of the body, and rotation/flip apply about it
 * — bodies are drawn centered on the local origin. The label (§4.5)
 * is a Text child under the body: a placement caption occupies that
 * slot ahead of the attached note title, and its size is proportional to
 * the placement's world size (rev 0.8 — labels are world content,
 * never screen-space overlays; the glyphs themselves are never
 * clamped). §8.2 label zoom ceiling (AI-IMP-216): the label's
 * OPACITY, not its size, is gated on the placement's own rendered
 * screen size — below EW_FURNITURE_MIN_PX it fades to nothing, so a
 * legible title never dominates a body too small to read. See
 * placementRenderedMaxEdge / labelZoomOpacity below.
 */

export const DEFAULT_DOT_RADIUS = 12

/** §4.5: label font size = body height × this single tuning ratio. */
export const LABEL_HEIGHT_RATIO = 0.14

/** §4.5 caption clamp. Kept beside the layout helper so render and
 * adorned bounds cannot disagree about how many lines exist. */
export const CAPTION_MAX_LINES = 3

/** Deterministic wrapping estimate. Caption layout must also run in
 * hit-testing, where no Pixi Text/canvas context exists. A conservative
 * one-em cell keeps the explicit lines within Pixi's proportional-font
 * wordWrapWidth so renderer and adorned bounds cannot diverge. */
const CAPTION_CELL_WIDTH_RATIO = 1

const LABEL_COLOR = 0xc8cfd8

/** §4.5 rev 0.71 caption plaque geometry, expressed from the existing
 * label/body metrics so it scales and re-rasterizes with the ONE label
 * pipeline. The outer width is strictly narrower than the print. */
export const CAPTION_PLAQUE_WIDTH_RATIO = 0.9
const CAPTION_PLAQUE_WRAP_RATIO = 0.82
const CAPTION_PLAQUE_PADDING_X_EM = 0.7
const CAPTION_PLAQUE_PADDING_Y_EM = 0.4
const CAPTION_PLAQUE_RADIUS_EM = 0.28
const CAPTION_PLAQUE_SHADOW_OFFSET_EM = 0.18
const CAPTION_PLAQUE_SHADOW_ALPHA = 0.24
const CAPTION_PLAQUE_BORDER_EM = 0.075

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

function labelWidth(item: ScenePlacement): number {
  return item.width ?? item.assetWidth ?? DEFAULT_DOT_RADIUS * 2
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

export interface PlacementLabelLayout {
  text: string
  lineCount: number
  wrapWidth: number | null
}

function appendWrappedWord(lines: string[], word: string, maxChars: number): void {
  const remainder = Array.from(word)
  while (remainder.length > maxChars) {
    lines.push(remainder.splice(0, maxChars).join(''))
  }
  if (remainder.length > 0) lines.push(remainder.join(''))
}

/**
 * Caption layout shared by Pixi rendering and adorned bounds. The wire
 * has already been trimmed by SetPlacementCaption; whitespace is folded
 * within a line while explicit newlines remain real line breaks. Long
 * words split deterministically, and overflow is clamped to three lines
 * with an ellipsis before Pixi sees it.
 */
export function placementLabelLayout(item: ScenePlacement): PlacementLabelLayout | null {
  const caption = item.caption
  if (caption === null) {
    if (item.noteTitle === null || item.appearanceKind === 'card') return null
    return { text: item.noteTitle, lineCount: 1, wrapWidth: null }
  }

  const wrapWidth = Math.max(1, labelWidth(item) * CAPTION_PLAQUE_WRAP_RATIO)
  const fontSize = Math.max(1, labelBasis(item).height * LABEL_HEIGHT_RATIO)
  const maxChars = Math.max(1, Math.floor(wrapWidth / (fontSize * CAPTION_CELL_WIDTH_RATIO)))
  const lines: string[] = []

  for (const paragraph of caption.replace(/\r\n?/g, '\n').split('\n')) {
    const words = paragraph.trim().split(/\s+/u).filter(Boolean)
    if (words.length === 0) {
      lines.push('')
      continue
    }
    let current = ''
    for (const word of words) {
      if (Array.from(word).length > maxChars) {
        if (current) {
          lines.push(current)
          current = ''
        }
        const chunks: string[] = []
        appendWrappedWord(chunks, word, maxChars)
        current = chunks.pop() ?? ''
        lines.push(...chunks)
      } else if (!current) {
        current = word
      } else if (Array.from(current).length + 1 + Array.from(word).length <= maxChars) {
        current += ` ${word}`
      } else {
        lines.push(current)
        current = word
      }
    }
    if (current) lines.push(current)
  }

  const overflow = lines.length > CAPTION_MAX_LINES
  const visible = lines.slice(0, CAPTION_MAX_LINES)
  if (overflow) {
    const lastIndex = CAPTION_MAX_LINES - 1
    const last = Array.from((visible[lastIndex] ?? '').trimEnd())
    visible[lastIndex] =
      maxChars === 1
        ? '…'
        : `${last.slice(0, Math.max(0, maxChars - 1)).join('').trimEnd()}…`
  }
  return {
    text: visible.join('\n'),
    lineCount: Math.max(1, visible.length),
    wrapWidth,
  }
}

/**
 * AI-IMP-262 label re-raster buckets. A label is a Text rasterized at
 * fontSize × Text.resolution device px; pixi re-rasters only when the
 * style or resolution changes (CanvasTextPipe keys on
 * text:styleKey:resolution) and auto-resolution is the renderer's DPR
 * — camera zoom enters neither, so a zoom glide upscales one fixed
 * raster indefinitely. A New-board pin makes that catastrophic: its
 * bare-node body defaults to 24 world units, the §4.5 ratio puts the
 * label at ~3.4 world units, and Home's fit-view zooms magnify that
 * ~7-device-px raster 8-20× into mush (the field report this ticket
 * answers). labelTextResolution picks the resolution the raster
 * SHOULD have for the current effective scale (zoom × |placement
 * scale| × DPR), quantized UP to the next power of the bucket base so
 * glyphs are only ever downscaled (< one bucket, invisible under
 * linear filtering) and a glide re-rasters at most once per bucket
 * crossing — ~10 crossings over the full MIN..MAX_ZOOM range.
 * Floored at the DPR (today's auto value: zooming OUT never rasters
 * below what a static scene gets) and capped so one label's glyph em
 * never exceeds LABEL_MAX_RASTER_EM_PX device px however deep
 * MAX_ZOOM (64×) is pushed — already-large labels (big image bodies)
 * hit the cap at their DPR floor and keep today's raster exactly.
 */
const LABEL_RESOLUTION_BUCKET_BASE = 1.5
const LABEL_MAX_RASTER_EM_PX = 192

export function labelTextResolution(
  fontSize: number,
  effectiveZoom: number,
  dpr: number = (globalThis as { devicePixelRatio?: number }).devicePixelRatio ?? 1,
): number {
  const safeDpr = dpr > 0 ? dpr : 1
  if (!(fontSize > 0)) return safeDpr
  const needed = Math.max(effectiveZoom, 0) * safeDpr
  const stepped =
    needed <= safeDpr
      ? safeDpr
      : Math.pow(
          LABEL_RESOLUTION_BUCKET_BASE,
          // Epsilon so an exact bucket value does not ceil past itself.
          Math.ceil(
            Math.log(needed) / Math.log(LABEL_RESOLUTION_BUCKET_BASE) - 1e-9,
          ),
        )
  const cap = Math.max(safeDpr, LABEL_MAX_RASTER_EM_PX / fontSize)
  return Math.min(stepped, cap)
}

/** True when syncLabel would draw an under-body label for this item. */
function hasUnderBodyLabel(item: ScenePlacement): boolean {
  // syncPlacementLabelOffset counter-flips both position and glyphs, so
  // the label remains below the body even when the placement is flipped.
  return placementLabelLayout(item) !== null && item.labelVisible === 1
}

/**
 * World-space Y of the visible label's bottom edge, matching
 * syncLabel/syncPlacementLabelOffset exactly: the body's bottom edge,
 * a fixed LABEL_CLEARANCE_PX screen gap (→ world via zoom), then the
 * world-scaled glyph box. Null when no label reaches below the body
 * (no caption/note title or label hidden). Zoom enters only
 * through the screen-space clearance term.
 */
export function placementLabelWorldBottom(item: ScenePlacement, zoom: number): number | null {
  if (!hasUnderBodyLabel(item)) return null
  const basis = labelBasis(item).height * (Math.abs(item.scale) || 1)
  const safeZoom = zoom > 0 ? zoom : 1
  const bodyBottom = item.y + basis / 2
  const clearanceWorld = LABEL_CLEARANCE_PX / safeZoom
  const lineCount = placementLabelLayout(item)?.lineCount ?? 1
  const glyphWorld = basis * LABEL_HEIGHT_RATIO * LABEL_TEXT_HEIGHT_RATIO * lineCount
  const plaqueExtra =
    item.caption === null
      ? 0
      : basis * LABEL_HEIGHT_RATIO * (CAPTION_PLAQUE_PADDING_Y_EM + CAPTION_PLAQUE_SHADOW_OFFSET_EM)
  return bodyBottom + clearanceWorld + glyphWorld + plaqueExtra
}

/** The one-shot plaque birth curve. It arrives slightly small, whispers
 * past rest once, and lands exactly at 1 — no loop and no model state. */
export function captionPopScale(elapsedMs: number, durationMs: number): number {
  if (!(durationMs > 0) || elapsedMs >= durationMs) return 1
  const progress = Math.max(0, elapsedMs / durationMs)
  const easeOut = (t: number): number => 1 - Math.pow(1 - t, 3)
  if (progress <= 0.68) {
    return 0.92 + (1.015 - 0.92) * easeOut(progress / 0.68)
  }
  return 1.015 + (1 - 1.015) * easeOut((progress - 0.68) / 0.32)
}

/** Applies the plaque-only birth scale without moving or scaling its
 * placement body. Flip signs counter-mirror both plaque and glyphs. */
export function syncPlacementCaptionPop(
  object: Container,
  item: ScenePlacement,
  scale: number,
): void {
  if (item.caption === null) return
  const x = (item.flipX ? -1 : 1) * scale
  const y = (item.flipY === 1 ? -1 : 1) * scale
  const label = object.children.find((child) => child.label === 'label')
  const plaque = object.children.find((child) => child.label === 'caption-plaque')
  label?.scale.set(x, y)
  plaque?.scale.set(x, y)
}

function syncCaptionPlaque(
  container: Container,
  item: ScenePlacement,
  label: Text,
  resources: RendererResources,
): void {
  const existing = container.children.find((child) => child.label === 'caption-plaque') as
    | Graphics
    | undefined
  if (item.caption === null) {
    existing?.destroy()
    label.style.fill = LABEL_COLOR
    return
  }
  const colors = resources.plaqueColors?.() ?? {
    face: FRAME_FALLBACK.label,
    border: FRAME_FALLBACK.border,
    text: LABEL_COLOR,
    shadow: FRAME_FALLBACK.fill,
  }
  label.style.fill = colors.text
  const fontSize = Number(label.style.fontSize)
  const borderWidth = Math.max(0.5, fontSize * CAPTION_PLAQUE_BORDER_EM)
  // The invariant governs the OUTER metal edge, not merely its fill.
  const maxWidth = Math.max(1, labelWidth(item) * CAPTION_PLAQUE_WIDTH_RATIO - borderWidth)
  // Keep geometry deterministic and headless-safe: Pixi's Text.width /
  // height invoke browser canvas metrics, while the label pipeline's
  // wrap itself deliberately uses conservative em-cell estimates so
  // rendering and adorned bounds can agree without a canvas context.
  const lines = String(label.text).split('\n')
  const longest = Math.max(1, ...lines.map((line) => Array.from(line).length))
  const estimatedTextWidth = Math.min(
    labelWidth(item) * CAPTION_PLAQUE_WRAP_RATIO,
    longest * fontSize * CAPTION_CELL_WIDTH_RATIO,
  )
  const width = Math.min(
    maxWidth,
    Math.max(fontSize * 4, estimatedTextWidth + fontSize * CAPTION_PLAQUE_PADDING_X_EM * 2),
  )
  const textHeight = lines.length * fontSize * LABEL_TEXT_HEIGHT_RATIO
  const height = textHeight + fontSize * CAPTION_PLAQUE_PADDING_Y_EM * 2
  const x = -width / 2
  const y = -fontSize * CAPTION_PLAQUE_PADDING_Y_EM
  const radius = fontSize * CAPTION_PLAQUE_RADIUS_EM
  let plaque = existing
  if (!plaque) {
    plaque = new Graphics()
    plaque.label = 'caption-plaque'
    plaque.eventMode = 'none'
    container.addChildAt(plaque, container.getChildIndex(label))
  }
  plaque
    .clear()
    .roundRect(x, y + fontSize * CAPTION_PLAQUE_SHADOW_OFFSET_EM, width, height, radius)
    .fill({ color: colors.shadow, alpha: CAPTION_PLAQUE_SHADOW_ALPHA })
    .roundRect(x, y, width, height, radius)
    .fill({ color: colors.face })
    .stroke({ color: colors.border, width: borderWidth })
}

/**
 * The placement BODY's own rendered (screen) size: its max edge in
 * world units × the live zoom × the placement's own scale — the same
 * "rendered screen size" quantity the shrink ladder already gates
 * furniture (syncPlacementIconLod) and the bound page on (§8.2). The
 * §8.2 label ceiling below rides THIS, not the label's own glyph
 * size, because the complaint is about the body/label RATIO: a
 * legible title over a body too small to read inverts the hierarchy
 * no matter how small the glyphs themselves have honestly shrunk to
 * (LABEL_HEIGHT_RATIO, unchanged).
 */
export function placementRenderedMaxEdge(item: ScenePlacement, zoom: number): number {
  const width = item.width ?? item.assetWidth ?? DEFAULT_DOT_RADIUS * 2
  const height = item.height ?? item.assetHeight ?? DEFAULT_DOT_RADIUS * 2
  const safeZoom = zoom > 0 ? zoom : 1
  const scale = Math.abs(item.scale) || 1
  return Math.max(width, height) * safeZoom * scale
}

/**
 * §8.2 label zoom ceiling (AI-IMP-216): the label has no legibility
 * clamp of its own (LABEL_HEIGHT_RATIO honestly shrinks its glyphs
 * with the body), but a readable title sitting on artwork too small
 * to read at all inverts the same content/chrome doctrine the ladder
 * already polices for furniture (isFurnitureVisible) and the bound
 * page (pageDegradeStage). Rather than invent a third boundary, the
 * label rides the ladder's own two EXISTING bounds as a fade
 * envelope: full opacity at/above EW_PAGE_FLOOR_PX — already
 * documented as the tier "a bound page's affordances need to still
 * read," which fits a run of text; EW_FURNITURE_MIN_PX alone is
 * calibrated for a glyph MARK (an icon dot) and is too small to hold
 * a legible word — ramping linearly to fully hidden at/below
 * EW_FURNITURE_MIN_PX, where the ladder degrades everything else to
 * nothing too. The ramp is continuous in the placement's rendered
 * size, so a zoom glide crosses it smoothly: no single-frame pop, no
 * boundary flicker (the ladder's existing banding stands in for a
 * bespoke hysteresis margin).
 */
export function labelZoomOpacity(renderedMaxEdgePx: number): number {
  if (renderedMaxEdgePx >= EW_PAGE_FLOOR_PX) return 1
  if (renderedMaxEdgePx <= EW_FURNITURE_MIN_PX) return 0
  return (renderedMaxEdgePx - EW_FURNITURE_MIN_PX) / (EW_PAGE_FLOOR_PX - EW_FURNITURE_MIN_PX)
}

/**
 * Creates, updates, or removes the label Text child. Called on every
 * update so renames (new noteTitle through the scene re-query),
 * visibility toggles, and resizes all reflow it. Flip is applied to
 * the container as scale sign, so the label counter-flips to stay
 * readable and stays below the body in world space.
 */
function syncLabel(
  container: Container,
  item: ScenePlacement,
  resources: RendererResources,
  zoom: number,
): void {
  const existing = container.children.find((child) => child.label === 'label') as
    | Text
    | undefined
  const layout = placementLabelLayout(item)
  if (layout === null || item.labelVisible !== 1) {
    existing?.destroy()
    container.children.find((child) => child.label === 'caption-plaque')?.destroy()
    return
  }
  const fontSize = labelBasis(item).height * LABEL_HEIGHT_RATIO
  let label = existing
  if (!label) {
    label = new Text({
      text: layout.text,
      style: {
        fontSize,
        fill: LABEL_COLOR,
        lineHeight: fontSize * LABEL_TEXT_HEIGHT_RATIO,
        ...(layout.wrapWidth === null
          ? {}
          : { wordWrap: true, breakWords: true, wordWrapWidth: layout.wrapWidth }),
      },
    })
    label.label = 'label'
    label.anchor.set(0.5, 0)
    container.addChild(label)
  } else {
    label.text = layout.text
    label.style.fontSize = fontSize
    label.style.lineHeight = fontSize * LABEL_TEXT_HEIGHT_RATIO
    label.style.wordWrap = layout.wrapWidth !== null
    label.style.breakWords = layout.wrapWidth !== null
    if (layout.wrapWidth !== null) label.style.wordWrapWidth = layout.wrapWidth
  }
  label.scale.set(item.flipX ? -1 : 1, item.flipY === 1 ? -1 : 1)
  syncCaptionPlaque(container, item, label, resources)
  syncPlacementCaptionPop(container, item, 1)
  syncPlacementLabelOffset(container, item, zoom)
}

/**
 * AI-IMP-087: hangs the label a constant SCREEN distance under the
 * body edge — LABEL_CLEARANCE_PX / zoom in world units — so the §6.9
 * screen-scale selection outline never runs through the §4.5
 * world-scale label as zoom-out compresses world gaps. Divides out
 * the container scale too (the label is a child, so item.scale
 * applies on top of local units). The host re-applies this each cull
 * pass: camera motion never re-runs renderer updates — which is also
 * where the §8.2 label zoom ceiling (AI-IMP-216) is re-derived, for
 * the same reason: a pure zoom glide runs no renderer update, so the
 * fade/hide must be recomputed here every cull pass, not just at
 * create/update. Presentation, not selection (unlike AI-IMP-192): the
 * label resurrects the instant zoom-in crosses back above the floor.
 */
export function syncPlacementLabelOffset(
  object: Container,
  item: ScenePlacement,
  zoom: number,
): void {
  const label = object.children.find((child) => child.label === 'label') as Text | undefined
  if (!label) return
  const plaque = object.children.find((child) => child.label === 'caption-plaque') as
    | Graphics
    | undefined
  const scale = Math.abs(item.scale) || 1
  const safeZoom = zoom > 0 ? zoom : 1
  const clearanceLocal = LABEL_CLEARANCE_PX / (safeZoom * scale)
  const offset = labelBasis(item).height / 2 + clearanceLocal
  // flipY negates the container's y-scale; negating the local offset
  // keeps the label below the body in world space (its own scale
  // sign, set in syncLabel, un-mirrors the glyphs).
  label.position.set(0, offset * (item.flipY === 1 ? -1 : 1))
  plaque?.position.copyFrom(label.position)
  const opacity = labelZoomOpacity(placementRenderedMaxEdge(item, zoom))
  label.alpha = opacity
  if (plaque) plaque.alpha = opacity
  // At opacity 0, also drop `visible` (not just alpha 0): pixi's
  // global-bounds walk skips !visible nodes, so getBounds collapses
  // to a zero rect — the observable "the label is gone" the e2e/debug
  // seam (labelBounds) polls for, and a small render-cost saving.
  label.visible = opacity > 0
  if (plaque) plaque.visible = label.visible
  // AI-IMP-262: keep the glyph raster tracking the effective scale so
  // zooming in never upscales a small texture into blur. Guarded —
  // the resolution setter re-rasters unconditionally, so assign only
  // on a bucket change, and never for a hidden label (it re-derives
  // the moment visibility returns, on this same cull-pass hook).
  if (label.visible) {
    const next = labelTextResolution(Number(label.style.fontSize), safeZoom * scale)
    if (label.resolution !== next) label.resolution = next
  }
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
    syncLabel(container, item, resources, resources.getZoom?.() ?? 1)
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
        item.caption !== previous.caption ||
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
    syncLabel(object, item, resources, resources.getZoom?.() ?? 1)
  },
}
