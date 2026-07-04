import type { ReorderContentPayload } from '@ew/commands'
import type { SceneItem } from './types'

/**
 * Reorder planning (§6.8): turns a bring-to-front / bring-forward /
 * send-backward / send-to-back intent over a mixed placement/
 * decoration selection into a sequence of ReorderContent payloads.
 * Payloads address NEIGHBORS (afterId directly below, beforeId
 * directly above) and are computed against a simulation of the
 * render_order-sorted scene, so each payload is valid at its
 * execution time when the caller issues them in order. Selected
 * items keep their relative order; a selection already at its target
 * (e.g. already frontmost) yields no payloads.
 */

export type ReorderOp = 'front' | 'forward' | 'backward' | 'back'

export function reorderPayloads(
  canvasId: string,
  items: readonly SceneItem[],
  selectedIds: readonly string[],
  op: ReorderOp,
): ReorderContentPayload[] {
  const order = items.map((item) => item.id)
  const wanted = new Set(selectedIds)
  // Scene order (bottom-up), not selection-set insertion order.
  const selected = order.filter((id) => wanted.has(id))
  if (selected.length === 0 || selected.length === order.length) return []
  switch (op) {
    case 'front':
      return toEdge(canvasId, order, selected, 'front')
    case 'back':
      return toEdge(canvasId, order, selected, 'back')
    case 'forward':
      return byOneStep(canvasId, order, new Set(selected), 'forward')
    case 'backward':
      return byOneStep(canvasId, order, new Set(selected), 'backward')
  }
}

function move(order: string[], id: string, toIndex: number): void {
  const from = order.indexOf(id)
  order.splice(from, 1)
  order.splice(toIndex, 0, id)
}

/**
 * Front: walk the selection top-down; the topmost selected goes to
 * the very front, each next one directly below the previous — so a
 * block already stacked at the edge emits nothing. Back mirrors it.
 */
function toEdge(
  canvasId: string,
  order: string[],
  selected: string[],
  edge: 'front' | 'back',
): ReorderContentPayload[] {
  const payloads: ReorderContentPayload[] = []
  const walk = edge === 'front' ? [...selected].reverse() : selected
  let previous: string | null = null
  for (const id of walk) {
    const index = order.indexOf(id)
    if (edge === 'front') {
      const target = previous === null ? order.length - 1 : order.indexOf(previous) - 1
      if (index !== target) {
        move(order, id, target)
        payloads.push({
          canvasId,
          itemId: id,
          afterId: order[target - 1] ?? null,
          beforeId: order[target + 1] ?? null,
        })
      }
    } else {
      const target = previous === null ? 0 : order.indexOf(previous) + 1
      if (index !== target) {
        move(order, id, target)
        payloads.push({
          canvasId,
          itemId: id,
          afterId: order[target - 1] ?? null,
          beforeId: order[target + 1] ?? null,
        })
      }
    }
    previous = id
  }
  return payloads
}

/**
 * Forward/backward: each selected item swaps past its neighbor unless
 * blocked by the plane edge or by an already-blocked selected item, so
 * a contiguous block at the edge stays put and blocks behind it.
 */
function byOneStep(
  canvasId: string,
  order: string[],
  selected: Set<string>,
  direction: 'forward' | 'backward',
): ReorderContentPayload[] {
  const payloads: ReorderContentPayload[] = []
  if (direction === 'forward') {
    let ceiling = order.length
    for (let i = order.length - 1; i >= 0; i -= 1) {
      const id = order[i]!
      if (!selected.has(id)) continue
      if (i + 1 >= ceiling) {
        ceiling = i
        continue
      }
      const neighbor = order[i + 1]!
      payloads.push({ canvasId, itemId: id, afterId: neighbor, beforeId: order[i + 2] ?? null })
      order[i] = neighbor
      order[i + 1] = id
    }
  } else {
    let floor = -1
    for (let i = 0; i < order.length; i += 1) {
      const id = order[i]!
      if (!selected.has(id)) continue
      if (i - 1 <= floor) {
        floor = i
        continue
      }
      const neighbor = order[i - 1]!
      payloads.push({ canvasId, itemId: id, afterId: order[i - 2] ?? null, beforeId: neighbor })
      order[i] = neighbor
      order[i - 1] = id
    }
  }
  return payloads
}
