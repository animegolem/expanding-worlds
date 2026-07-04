import type { CommandContext } from './dispatcher'

/**
 * render_order key allocation per RFC-0001 §4.4: placements and
 * decorations share one canvas-scoped REAL order space forming a
 * deterministic total order (stable UUID order breaks ties).
 * New content lands on top with GAP-spaced keys; between-insertions
 * take midpoints; when float precision exhausts the gap, the canvas
 * is rebalanced transactionally without changing visible order
 * (invariant 21).
 */

export const RENDER_ORDER_GAP = 1024

/** One row of the shared content plane, minimally typed for ordering. */
export interface OrderedItem {
  itemKind: 'placement' | 'decoration'
  id: string
  renderOrder: number
}

/**
 * Every content row of the canvas (all lifecycle states — trashed
 * rows keep their slot so restore returns them to the same visible
 * position) sorted by (render_order, id).
 */
export function orderedCanvasContent(ctx: CommandContext, canvasId: string): OrderedItem[] {
  const placements = ctx.db.all<{ id: string; render_order: number }>(
    'SELECT id, render_order FROM placement WHERE canvas_id = ?',
    canvasId,
  )
  const decorations = ctx.db.all<{ id: string; render_order: number }>(
    'SELECT id, render_order FROM decoration WHERE canvas_id = ?',
    canvasId,
  )
  const items: OrderedItem[] = [
    ...placements.map((p) => ({
      itemKind: 'placement' as const,
      id: p.id,
      renderOrder: p.render_order,
    })),
    ...decorations.map((d) => ({
      itemKind: 'decoration' as const,
      id: d.id,
      renderOrder: d.render_order,
    })),
  ]
  items.sort(compareOrder)
  return items
}

/** Deterministic total order: render_order, then UUID as tiebreak. */
export function compareOrder(
  a: { renderOrder: number; id: string },
  b: { renderOrder: number; id: string },
): number {
  if (a.renderOrder !== b.renderOrder) return a.renderOrder - b.renderOrder
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

/** Key for new content: on top of everything on the canvas. */
export function nextRenderOrder(ctx: CommandContext, canvasId: string): number {
  const row = ctx.db.get<{ m: number | null }>(
    `SELECT max(m) AS m FROM (
       SELECT max(render_order) AS m FROM placement WHERE canvas_id = ?1
       UNION ALL
       SELECT max(render_order) AS m FROM decoration WHERE canvas_id = ?1
     )`,
    canvasId,
  )
  const max = row?.m ?? null
  return max === null ? RENDER_ORDER_GAP : max + RENDER_ORDER_GAP
}

/**
 * Midpoint between two keys. Callers MUST verify the result is
 * strictly between its bounds (float precision can exhaust the gap)
 * and rebalance when it is not.
 */
export function orderBetween(a: number, b: number): number {
  return a + (b - a) / 2
}

/**
 * Reassigns evenly spaced keys (GAP, 2*GAP, ...) to every content row
 * on the canvas in its current deterministic order. Visible order is
 * unchanged by construction; runs inside the caller's transaction.
 */
export function rebalanceCanvas(ctx: CommandContext, canvasId: string): void {
  const items = orderedCanvasContent(ctx, canvasId)
  const now = ctx.now()
  items.forEach((item, i) => {
    const key = (i + 1) * RENDER_ORDER_GAP
    if (key === item.renderOrder) return
    if (item.itemKind === 'placement') {
      ctx.db.run(
        'UPDATE placement SET render_order = ?, updated_at = ? WHERE id = ?',
        key,
        now,
        item.id,
      )
    } else {
      ctx.db.run(
        'UPDATE decoration SET render_order = ?, updated_at = ? WHERE id = ?',
        key,
        now,
        item.id,
      )
    }
  })
}
