import { placementTransformOf } from './gesture'
import { translateDecorationData } from './gestures/decoration-data'
import { itemWorldAABB, placementSize } from './hit-test'
import type { TransformContentItem, TransformContentPayload } from '@ew/commands'
import type { Rect } from './camera'
import type { SceneItem, ScenePlacement } from './types'

/**
 * Align/distribute planning (§6.9): each operation computes target
 * positions over the selection's world AABBs and yields exactly ONE
 * TransformContent payload containing only the items that actually
 * move (null when nothing moves, so callers issue zero commands for a
 * no-op). Placements translate by center delta keeping every other
 * transform field; decorations translate the coordinates inside their
 * data JSON. Rotation is honored through the rotation-expanded AABB.
 */

export type AlignOp = 'left' | 'hcenter' | 'right' | 'top' | 'vmiddle' | 'bottom'
export type DistributeAxis = 'horizontal' | 'vertical'

/** Float slack so re-running an op on its own output is a no-op. */
const EPSILON = 1e-6

interface Entry {
  item: SceneItem
  aabb: Rect
}

function entriesOf(items: readonly SceneItem[]): Entry[] {
  const entries: Entry[] = []
  for (const item of items) {
    const aabb = itemWorldAABB(item)
    if (aabb) entries.push({ item, aabb })
  }
  return entries
}

function movedItem(item: SceneItem, dx: number, dy: number): TransformContentItem | null {
  if (Math.abs(dx) < EPSILON && Math.abs(dy) < EPSILON) return null
  if (item.itemKind === 'placement') {
    const t = placementTransformOf(item)
    return { kind: 'placement', placementId: item.id, ...t, x: t.x + dx, y: t.y + dy }
  }
  return { kind: 'decoration', decorationId: item.id, data: translateDecorationData(item.data, dx, dy) }
}

function payloadOf(canvasId: string, moved: Array<TransformContentItem | null>): TransformContentPayload | null {
  const items = moved.filter((item): item is TransformContentItem => item !== null)
  return items.length === 0 ? null : { canvasId, items }
}

export function alignPayload(
  canvasId: string,
  items: readonly SceneItem[],
  op: AlignOp,
): TransformContentPayload | null {
  const entries = entriesOf(items)
  if (entries.length < 2) return null
  const horizontal = op === 'left' || op === 'hcenter' || op === 'right'
  const min = Math.min(...entries.map(({ aabb }) => (horizontal ? aabb.x : aabb.y)))
  const max = Math.max(
    ...entries.map(({ aabb }) => (horizontal ? aabb.x + aabb.width : aabb.y + aabb.height)),
  )
  const moved = entries.map(({ item, aabb }) => {
    let delta: number
    switch (op) {
      case 'left':
        delta = min - aabb.x
        break
      case 'hcenter':
        delta = (min + max) / 2 - (aabb.x + aabb.width / 2)
        break
      case 'right':
        delta = max - (aabb.x + aabb.width)
        break
      case 'top':
        delta = min - aabb.y
        break
      case 'vmiddle':
        delta = (min + max) / 2 - (aabb.y + aabb.height / 2)
        break
      case 'bottom':
        delta = max - (aabb.y + aabb.height)
        break
    }
    return horizontal ? movedItem(item, delta, 0) : movedItem(item, 0, delta)
  })
  return payloadOf(canvasId, moved)
}

/**
 * Even GAP spacing along one axis: the outermost items stay fixed and
 * the space between the extremes is divided into equal gaps, walking
 * the items in axis order. Two items are always a no-op (both are
 * extremes), matching the ≥3 UI gate.
 */
export function distributePayload(
  canvasId: string,
  items: readonly SceneItem[],
  axis: DistributeAxis,
): TransformContentPayload | null {
  const entries = entriesOf(items)
  if (entries.length < 3) return null
  const horizontal = axis === 'horizontal'
  const lo = ({ aabb }: Entry): number => (horizontal ? aabb.x : aabb.y)
  const size = ({ aabb }: Entry): number => (horizontal ? aabb.width : aabb.height)
  const sorted = [...entries].sort(
    (a, b) => lo(a) - lo(b) || size(a) - size(b) || a.item.id.localeCompare(b.item.id),
  )
  const first = sorted[0]!
  const last = sorted[sorted.length - 1]!
  const span = lo(last) + size(last) - lo(first)
  const occupied = sorted.reduce((sum, entry) => sum + size(entry), 0)
  const gap = (span - occupied) / (sorted.length - 1)
  let cursor = lo(first)
  const moved = sorted.map((entry) => {
    const delta = cursor - lo(entry)
    cursor += size(entry) + gap
    return horizontal ? movedItem(entry.item, delta, 0) : movedItem(entry.item, 0, delta)
  })
  return payloadOf(canvasId, moved)
}

// ---------------------------------------------------------------- arrange
//
// §4.9 rev 0.38 / §6.9 "Arrange and normalize vocabulary": the deferred
// auto-arrange (compact pack) lands here as a shelf packer whose INPUT
// ORDER is chosen by a sort key. The packer preserves each item's world
// size and reflows the selection into a compact, non-overlapping,
// roughly-square block anchored at the selection's current top-left, so
// the result stays where the content already was. One TransformContent
// payload (invariant 25 — one undo entry per invocation); re-running the
// same key is idempotent (deltas collapse to zero → null). Frame-scoped
// invocation (AI-IMP-129) reuses `sortItemsForArrange` and drives this
// packer with an explicit `origin`/`rowWidth` (the frame's inner box).

/**
 * Arrange sort keys. Additive by design (EPIC-016 menus and 129's modal
 * will grow the set — validate in handlers, never a schema CHECK).
 * - `default`: current visual reading order (row-major: top-to-bottom,
 *   then left-to-right). Deterministic and shuffle-stable — this is the
 *   preserved "no explicit ordering" behavior.
 * - `name`: by node title / identifier (placements), kind (decorations).
 * - `importDate`: creation/import order. The scene wire (§11.1) carries
 *   no import timestamp and this module may not add one, so renderOrder
 *   — assigned incrementally at placement creation — is the available
 *   proxy for "when it entered the board".
 * - `area`: largest visual footprint first (AABB area, descending).
 */
export type ArrangeSortKey = 'default' | 'name' | 'importDate' | 'area'

export interface ArrangeOptions {
  /** Gap between packed items (world units). Default: 8% of the median
   *  short edge, so the spacing tracks the selection's own scale. */
  gap?: number
  /** AABB top-left the pack starts from. Default: selection union
   *  top-left, so arrange never teleports the block away from itself. */
  origin?: { x: number; y: number }
  /** Wrap width (world units): a new shelf starts once a row would
   *  exceed it. Default: √(total area), for a roughly-square block. */
  rowWidth?: number
}

function nameKeyOf(item: SceneItem): string {
  if (item.itemKind === 'placement') return (item.noteTitle ?? '').toLowerCase()
  return item.kind.toLowerCase()
}

/**
 * Order the selection for arrange. Pure and stable: every key breaks
 * final ties on `id` so the result never depends on input order. AABBs
 * are passed alongside so callers (the packer, 129) share one sort.
 */
export function sortItemsForArrange<T extends { item: SceneItem; aabb: Rect }>(
  entries: readonly T[],
  key: ArrangeSortKey,
): T[] {
  const byId = (a: T, b: T): number => a.item.id.localeCompare(b.item.id)
  const sorted = [...entries]
  switch (key) {
    case 'name':
      sorted.sort((a, b) => nameKeyOf(a.item).localeCompare(nameKeyOf(b.item)) || byId(a, b))
      break
    case 'importDate':
      sorted.sort((a, b) => a.item.renderOrder - b.item.renderOrder || byId(a, b))
      break
    case 'area':
      sorted.sort(
        (a, b) => b.aabb.width * b.aabb.height - a.aabb.width * a.aabb.height || byId(a, b),
      )
      break
    case 'default':
      // Row-major reading order over the current layout.
      sorted.sort((a, b) => a.aabb.y - b.aabb.y || a.aabb.x - b.aabb.x || byId(a, b))
      break
  }
  return sorted
}

function median(values: readonly number[]): number {
  const s = [...values].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 === 1 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2
}

/**
 * §6.9 auto-arrange: sort by `key`, then shelf-pack the selection into a
 * compact non-overlapping block, preserving every item's world size.
 * Yields ONE TransformContent (items that actually move) or null for a
 * no-op. Decorations pack by translation exactly like align/distribute;
 * placements keep every transform field but their center.
 */
export function arrangePayload(
  canvasId: string,
  items: readonly SceneItem[],
  key: ArrangeSortKey,
  options: ArrangeOptions = {},
): TransformContentPayload | null {
  const entries = entriesOf(items)
  if (entries.length < 2) return null
  const sorted = sortItemsForArrange(entries, key)

  const origin =
    options.origin ??
    {
      x: Math.min(...sorted.map(({ aabb }) => aabb.x)),
      y: Math.min(...sorted.map(({ aabb }) => aabb.y)),
    }
  const gap =
    options.gap ?? median(sorted.map(({ aabb }) => Math.min(aabb.width, aabb.height))) * 0.08
  const maxWidth = Math.max(...sorted.map(({ aabb }) => aabb.width))
  // Target a roughly-square block: the row width is √(gap-inflated
  // footprint area), so N equal tiles settle into a √N grid rather than
  // a single tall column (raw area undershoots once gaps are added).
  const paddedArea = sorted.reduce(
    (sum, { aabb }) => sum + (aabb.width + gap) * (aabb.height + gap),
    0,
  )
  // A gentle bias toward wider rows so small counts fill out (3 tiles
  // read as 2+1, not a tall stack) while large counts stay near-square.
  const rowWidth = options.rowWidth ?? Math.max(maxWidth, Math.sqrt(paddedArea) * 1.2)

  let cursorX = origin.x
  let cursorY = origin.y
  let shelfHeight = 0
  const moved: Array<TransformContentItem | null> = []
  for (const { item, aabb } of sorted) {
    // Wrap to a new shelf once the row would overflow (but never leave a
    // shelf empty — the widest item always takes its own row if needed).
    if (cursorX > origin.x && cursorX + aabb.width > origin.x + rowWidth) {
      cursorX = origin.x
      cursorY += shelfHeight + gap
      shelfHeight = 0
    }
    moved.push(movedItem(item, cursorX - aabb.x, cursorY - aabb.y))
    cursorX += aabb.width + gap
    shelfHeight = Math.max(shelfHeight, aabb.height)
  }
  return payloadOf(canvasId, moved)
}

// -------------------------------------------------------------- normalize
//
// §4.9 rev 0.38: equalize dimensions across a multi-selection so a messy
// pinboard of mixed-size images reads evenly. Scale-to-match with the
// selection MEDIAN as the reference (invariant against a single outlier),
// aspect ALWAYS preserved (one uniform factor per item), center held so
// nothing jumps. Placements only — decorations carry no uniform-scale
// verb and pass through untouched; locked placements refuse resize
// (§6.9 rev 0.17) and are excluded from both the reference and the move.

export type NormalizeMode = 'height' | 'width' | 'size' | 'area'

function metricOf(size: { width: number; height: number }, mode: NormalizeMode): number {
  switch (mode) {
    case 'height':
      return size.height
    case 'width':
      return size.width
    case 'size':
      return Math.max(size.width, size.height)
    case 'area':
      return size.width * size.height
  }
}

/** Uniform scale that maps `metric` onto `reference` for the mode. */
function factorOf(mode: NormalizeMode, metric: number, reference: number): number {
  // Area is a squared quantity, so its linear scale is the square root.
  return mode === 'area' ? Math.sqrt(reference / metric) : reference / metric
}

/**
 * §6.9 normalize: scale each selected placement (aspect preserved,
 * center fixed) so its `mode` metric matches the selection median. ONE
 * TransformContent or null. Single normalizable item, or an already-even
 * selection, is a no-op. Mixed aspect ratios stay correct because the
 * factor is uniform on each item.
 */
export function normalizeSelection(
  canvasId: string,
  items: readonly SceneItem[],
  mode: NormalizeMode,
): TransformContentPayload | null {
  const placements = items.filter(
    (item): item is ScenePlacement => item.itemKind === 'placement' && item.locked !== 1,
  )
  const sized = placements
    .map((item) => ({ item, metric: metricOf(placementSize(item), mode) }))
    .filter((entry) => entry.metric > 0)
  if (sized.length < 2) return null
  const reference = median(sized.map((entry) => entry.metric))
  const moved: Array<TransformContentItem | null> = sized.map(({ item, metric }) => {
    const factor = factorOf(mode, metric, reference)
    if (Math.abs(factor - 1) < EPSILON) return null
    const t = placementTransformOf(item)
    return { kind: 'placement', placementId: item.id, ...t, scale: t.scale * factor }
  })
  return payloadOf(canvasId, moved)
}
