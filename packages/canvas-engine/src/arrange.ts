import { placementTransformOf } from './gesture'
import { translateDecorationData } from './gestures/decoration-data'
import { itemWorldAABB } from './hit-test'
import type { TransformContentItem, TransformContentPayload } from '@ew/commands'
import type { Rect } from './camera'
import type { SceneItem } from './types'

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
