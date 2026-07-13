/**
 * The bound page's geometry (RFC §8.5 rev 0.55 "the open book", §8.8
 * region math; AI-IMP-134). Pure functions only — no DOM, no Svelte,
 * no camera object — so the side choice, the shared-edge sizing, and
 * the ring count are all unit-testable in node. NotePanel.svelte reads
 * these to place the bound page; panels.ts re-exports the side chooser
 * (the store owns the presentation contract).
 */

/** Which side of its image a page binds to. Chosen once at open and
 * stable for the panel's life (§8.5). */
export type BindSide = 'left' | 'right' | 'below'

/** A wide image (≳1.4:1) opens BELOW like a calendar rather than to a
 * side; below this aspect the page binds to the freer viewport side
 * (§8.5). Aspect is image width / height. */
export const WIDE_ASPECT = 1.4

/** Default extent (world units) of the page's FREE axis — a side-bound
 * page's width, a bottom-bound page's height. The SHARED axis is locked
 * to the image edge; this is the other one. A feel constant mirroring
 * DEFAULT_PANEL_SIZE, never model state (§8.5 rev 0.31). */
export const DEFAULT_PAGE_EXTENT = 300

export interface Size {
  width: number
  height: number
}

export interface Rect extends Size {
  x: number
  y: number
}

export interface BindSideInput {
  /** Image aspect ratio: width / height. */
  aspect: number
  /** The image's left/right edges in viewport (screen) px. */
  imageLeft: number
  imageRight: number
  /** The viewport (canvas host) width in px. */
  viewportWidth: number
}

/**
 * The binding side for a freshly opened image-anchored page (§8.5,
 * §8.8). A wide image binds BELOW; otherwise the page takes the side
 * of the image with more free viewport room. Ties resolve to the RIGHT
 * — the shipped tethered panel's side, so unchanged images keep their
 * habit.
 */
export function chooseBindSide({
  aspect,
  imageLeft,
  imageRight,
  viewportWidth,
}: BindSideInput): BindSide {
  if (aspect >= WIDE_ASPECT) return 'below'
  const roomLeft = imageLeft
  const roomRight = viewportWidth - imageRight
  return roomRight >= roomLeft ? 'right' : 'left'
}

/**
 * The page's base (unscaled, world-unit) size. The SHARED edge is
 * locked to the image — height when side-bound, width when bottom-bound
 * — and the free axis takes `freeExtent`. The panel then rides the
 * rev-0.47 world-scale transform (scale = camera zoom), so the locked
 * edge renders at exactly the image's rendered size at every zoom.
 */
export function pageBaseSize(side: BindSide, image: Size, freeExtent = DEFAULT_PAGE_EXTENT): Size {
  if (side === 'below') return { width: image.width, height: freeExtent }
  return { width: freeExtent, height: image.height }
}

/** The whole open book in world coordinates: print plus its bound page.
 * Reading flight fits this rect, so the target is independent of the
 * current camera and Escape can restore an exact camera snapshot. */
export function openBookBounds(side: BindSide, image: Rect, page: Size): Rect {
  if (side === 'left') {
    return { x: image.x - page.width, y: image.y, width: image.width + page.width, height: image.height }
  }
  if (side === 'below') {
    return { x: image.x, y: image.y, width: image.width, height: image.height + page.height }
  }
  return { x: image.x, y: image.y, width: image.width + page.width, height: image.height }
}

/** The bound edge whose length the rings straddle: the image height for
 * a side binding, the image width for a bottom binding. */
export function boundEdgeLength(side: BindSide, image: Size): number {
  return side === 'below' ? image.width : image.height
}

/** Binder ring radius in world units — the hardware straddles the seam
 * at ±this. A feel constant echoing the 9px page corner radius. */
export const RING_RADIUS = 9

/** World units of bound edge per binder ring: one ring per this much
 * seam. A feel constant — dial for ring density. */
export const RING_SPACING = 64
export const MIN_RINGS = 2
export const MAX_RINGS = 14

/**
 * How many binder rings straddle a bound edge of the given length
 * (world units). Grows with the edge, clamped to a sane band so a
 * postage-stamp image still reads as bound and a mural does not sprout
 * a hundred rings. A binder's ring count is fixed hardware — keyed on
 * the world edge, so it does not change as the camera zooms.
 */
export function ringCount(edgeLength: number): number {
  if (!Number.isFinite(edgeLength) || edgeLength <= 0) return MIN_RINGS
  return Math.max(MIN_RINGS, Math.min(MAX_RINGS, Math.round(edgeLength / RING_SPACING)))
}

/**
 * The along-edge centers (world units, in [0, edgeLength]) of `count`
 * evenly distributed rings — each ring sits at the midpoint of its
 * even share of the edge, so the first and last rings inset from the
 * corners rather than sitting on them.
 */
export function ringOffsets(edgeLength: number, count: number): number[] {
  if (count <= 0) return []
  const offsets: number[] = []
  for (let i = 0; i < count; i += 1) offsets.push((edgeLength * (i + 0.5)) / count)
  return offsets
}
