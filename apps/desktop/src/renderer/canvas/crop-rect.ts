/**
 * Crop rect math (RFC §4.6, AI-IMP-159). A crop is a NORMALIZED
 * source-space rectangle — {x, y, width, height} all in 0..1 against
 * the FULL image — so it is resolution-independent and survives the
 * asset being served at any pixel size (the asset itself is never
 * touched; §8.4 "charms are UI, never pixels"). This module is pure
 * geometry (no DOM, no Pixi) so the overlay's drag handling and the
 * vitest suite share one clamp/normalize/reset/min-size definition.
 */

import { isAppearanceCrop, MIN_APPEARANCE_CROP_SIZE } from '@ew/domain'

export interface CropRect {
  x: number
  y: number
  width: number
  height: number
}

/** The whole image — the identity crop the editor opens on and Reset
 * restores. A crop equal to this is "uncropped" and stores as null. */
export const FULL_CROP: CropRect = { x: 0, y: 0, width: 1, height: 1 }

/** Minimum normalized edge length: a crop can never collapse past this
 * (both as a handle-drag floor and a validation floor). */
export const MIN_CROP_SIZE = MIN_APPEARANCE_CROP_SIZE

/** The eight drag handles: four corners + four edge midpoints. */
export type CropHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'

export const CROP_HANDLES: readonly CropHandle[] = [
  'nw',
  'n',
  'ne',
  'e',
  'se',
  's',
  'sw',
  'w',
]

function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0
  return value < 0 ? 0 : value > 1 ? 1 : value
}

/**
 * Force a rect fully inside the unit square with positive, at-least-
 * minimum edges. Used after every drag so the committed rect is always
 * legal regardless of how the pointer moved.
 */
export function clampCrop(rect: CropRect): CropRect {
  let x = clamp01(rect.x)
  let y = clamp01(rect.y)
  let width = Math.max(MIN_CROP_SIZE, rect.width)
  let height = Math.max(MIN_CROP_SIZE, rect.height)
  // Keep the far edge inside the image; if the near edge left no room,
  // pull it back so the min-size box still fits.
  if (x + width > 1) {
    if (width > 1) width = 1
    x = Math.min(x, 1 - width)
  }
  if (y + height > 1) {
    if (height > 1) height = 1
    y = Math.min(y, 1 - height)
  }
  return { x: clamp01(x), y: clamp01(y), width, height }
}

/** Whether a rect is (within epsilon) the full frame — the uncropped
 * state, which commits as `null` on the appearance. */
export function isFullCrop(rect: CropRect, epsilon = 1e-4): boolean {
  return (
    Math.abs(rect.x) < epsilon &&
    Math.abs(rect.y) < epsilon &&
    Math.abs(rect.width - 1) < epsilon &&
    Math.abs(rect.height - 1) < epsilon
  )
}

/**
 * The value the commit sends on the appearance: `null` for a full frame
 * (uncropped), otherwise the clamped rect. Storing null for the full
 * frame keeps "cropped to everything" and "never cropped" the same
 * state (and lets the renderer skip sub-texture work).
 */
export function normalizeCrop(rect: CropRect): CropRect | null {
  const clamped = clampCrop(rect)
  return isFullCrop(clamped) ? null : clamped
}

/** Reset always restores the full frame. */
export function resetCrop(): CropRect {
  return { ...FULL_CROP }
}

/**
 * Apply a handle drag by a normalized delta. Corner handles move both
 * touched edges; edge handles move one. Opposite edges are held fixed,
 * and each moving edge is bounded so the box keeps its MIN_CROP_SIZE
 * without flipping. The result is clamped into the unit square.
 */
export function resizeCropByHandle(
  rect: CropRect,
  handle: CropHandle,
  dx: number,
  dy: number,
): CropRect {
  let left = rect.x
  let top = rect.y
  let right = rect.x + rect.width
  let bottom = rect.y + rect.height

  const movesLeft = handle === 'nw' || handle === 'w' || handle === 'sw'
  const movesRight = handle === 'ne' || handle === 'e' || handle === 'se'
  const movesTop = handle === 'nw' || handle === 'n' || handle === 'ne'
  const movesBottom = handle === 'sw' || handle === 's' || handle === 'se'

  if (movesLeft) left = Math.min(left + dx, right - MIN_CROP_SIZE)
  if (movesRight) right = Math.max(right + dx, left + MIN_CROP_SIZE)
  if (movesTop) top = Math.min(top + dy, bottom - MIN_CROP_SIZE)
  if (movesBottom) bottom = Math.max(bottom + dy, top + MIN_CROP_SIZE)

  return clampCrop({ x: left, y: top, width: right - left, height: bottom - top })
}

/** Slide the whole rect by a normalized delta, clamped so it stays
 * wholly inside the image (its size is preserved). */
export function moveCrop(rect: CropRect, dx: number, dy: number): CropRect {
  const x = clamp01Ranged(rect.x + dx, 0, 1 - rect.width)
  const y = clamp01Ranged(rect.y + dy, 0, 1 - rect.height)
  return { x, y, width: rect.width, height: rect.height }
}

function clamp01Ranged(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min
  const lo = Math.min(min, max)
  const hi = Math.max(min, max)
  return value < lo ? lo : value > hi ? hi : value
}

/**
 * Whether a rect is a legal committed crop: finite, inside the unit
 * square, and at least the minimum size on each edge. The command
 * handler mirrors this (validation lives in the handler, never a SQLite
 * CHECK — the growing-domain convention).
 */
export function isValidCrop(rect: CropRect, epsilon = 1e-6): boolean {
  return isAppearanceCrop(rect, epsilon)
}
