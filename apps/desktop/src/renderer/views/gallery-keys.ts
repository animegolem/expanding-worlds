/**
 * Gallery cursor math (RFC-0001 §14.4 rev 0.25, AI-IMP-080): the
 * pure index arithmetic behind the keyboard model. Everything here
 * works on INDICES into the current document order (the gallery
 * index array), never on DOM geometry — virtualization means the
 * cursor's cell may not even be rendered when a key lands.
 *
 * Document order is the current sort/filter's flat order; bucket
 * boundaries are presentation. Left/Right therefore walk plain
 * index ±1 (which IS the row/bucket wrap), while Up/Down need the
 * visual row structure: rows are chunks of `columns` cells, and
 * under date sort every bucket starts a fresh row run — so the
 * last row of a bucket can be short, exactly like the grid draws.
 */

import type { GalleryBucket } from './gallery-buckets'

/** One visual row of cells: an index range into document order. */
export interface KeyRow {
  start: number
  count: number
}

/**
 * The visual row structure the grid renders: per bucket under date
 * sort (buckets non-empty), one flat run otherwise. Mirrors
 * GalleryView's layout loop — same chunking, no tops.
 */
export function cellRows(
  total: number,
  columns: number,
  buckets: readonly GalleryBucket[],
): KeyRow[] {
  const rows: KeyRow[] = []
  const chunk = (start: number, end: number): void => {
    for (let i = start; i < end; i += columns) {
      rows.push({ start: i, count: Math.min(columns, end - i) })
    }
  }
  if (buckets.length > 0) {
    for (const bucket of buckets) chunk(bucket.startIndex, bucket.startIndex + bucket.count)
  } else {
    chunk(0, total)
  }
  return rows
}

/** The row containing a document index, or -1. */
export function rowOf(rows: readonly KeyRow[], index: number): number {
  for (let r = 0; r < rows.length; r += 1) {
    const row = rows[r]!
    if (index >= row.start && index < row.start + row.count) return r
  }
  return -1
}

/** Visual column of a document index (0 when the index is orphan). */
export function columnOf(rows: readonly KeyRow[], index: number): number {
  const r = rowOf(rows, index)
  return r === -1 ? 0 : index - rows[r]!.start
}

/**
 * Left/Right walk document order, wrapping across rows and bucket
 * boundaries by construction; the ends clamp (no torus).
 */
export function horizontalTarget(total: number, index: number, dir: -1 | 1): number {
  return Math.min(Math.max(index + dir, 0), Math.max(total - 1, 0))
}

/**
 * Up/Down move by visual column into the adjacent row, taking the
 * nearest column when that row is short (ragged last rows,
 * cross-bucket hops). `preferredCol` is the remembered column from
 * the start of the vertical run, so a trip through a short row
 * comes back out in the original column. Null at the grid's edges.
 */
export function verticalTarget(
  rows: readonly KeyRow[],
  index: number,
  dir: -1 | 1,
  preferredCol: number,
): number | null {
  const r = rowOf(rows, index)
  if (r === -1) return null
  const target = rows[r + dir]
  if (!target) return null
  return target.start + Math.min(preferredCol, target.count - 1)
}

/** Shift range: the inclusive linear document-order span. */
export function linearRange(a: number, b: number): [number, number] {
  return a <= b ? [a, b] : [b, a]
}

/**
 * Mod+Up/Down (§14.4): the keyboard twin of the header's period
 * list — first entry of the previous/next bucket. Null on flat
 * sorts (no buckets) and past the ends.
 */
export function bucketJumpTarget(
  buckets: readonly GalleryBucket[],
  index: number,
  dir: -1 | 1,
): number | null {
  if (buckets.length === 0) return null
  let current = -1
  for (let b = 0; b < buckets.length; b += 1) {
    const bucket = buckets[b]!
    if (index >= bucket.startIndex && index < bucket.startIndex + bucket.count) {
      current = b
      break
    }
  }
  if (current === -1) return null
  const target = buckets[current + dir]
  return target ? target.startIndex : null
}
