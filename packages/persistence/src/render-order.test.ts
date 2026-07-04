import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { uuidv7 } from '@ew/domain'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { CommandContext } from './dispatcher'
import { createProject, type ProjectHandle } from './project'
import {
  compareOrder,
  nextRenderOrder,
  orderBetween,
  orderedCanvasContent,
  rebalanceCanvas,
  RENDER_ORDER_GAP,
} from './render-order'

let dir: string
let handle: ProjectHandle
let ctx: CommandContext

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'ew-order-'))
  handle = createProject(dir, 'Order Test')
  ctx = {
    db: handle.db,
    projectId: handle.projectId,
    rootNodeId: handle.rootNodeId,
    rootCanvasId: handle.rootCanvasId,
    now: () => new Date().toISOString(),
  }
})

afterEach(() => {
  handle.close()
  rmSync(dir, { recursive: true, force: true })
})

function insertPlacement(id: string, renderOrder: number): void {
  const now = ctx.now()
  ctx.db.run(
    `INSERT INTO placement (id, project_id, canvas_id, node_id, render_order,
       created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    id,
    ctx.projectId,
    ctx.rootCanvasId,
    ctx.rootNodeId,
    renderOrder,
    now,
    now,
  )
}

function insertDecoration(id: string, renderOrder: number): void {
  const now = ctx.now()
  ctx.db.run(
    `INSERT INTO decoration (id, project_id, canvas_id, kind, render_order,
       created_at, updated_at)
     VALUES (?, ?, ?, 'shape', ?, ?, ?)`,
    id,
    ctx.projectId,
    ctx.rootCanvasId,
    renderOrder,
    now,
    now,
  )
}

describe('render-order', () => {
  it('allocates the first key at one gap and stacks new content on top', () => {
    expect(nextRenderOrder(ctx, ctx.rootCanvasId)).toBe(RENDER_ORDER_GAP)
    insertPlacement(uuidv7(), RENDER_ORDER_GAP)
    expect(nextRenderOrder(ctx, ctx.rootCanvasId)).toBe(2 * RENDER_ORDER_GAP)
    // §4.4: the order space is shared — a decoration raises the top too.
    insertDecoration(uuidv7(), 5000)
    expect(nextRenderOrder(ctx, ctx.rootCanvasId)).toBe(5000 + RENDER_ORDER_GAP)
  })

  it('orderBetween returns the midpoint', () => {
    expect(orderBetween(0, 10)).toBe(5)
    expect(orderBetween(1024, 2048)).toBe(1536)
  })

  it('compareOrder breaks render_order ties by UUID', () => {
    const a = { renderOrder: 1, id: '00000000-0000-7000-8000-000000000001' }
    const b = { renderOrder: 1, id: '00000000-0000-7000-8000-000000000002' }
    expect(compareOrder(a, b)).toBeLessThan(0)
    expect(compareOrder(b, a)).toBeGreaterThan(0)
    expect(compareOrder(a, a)).toBe(0)
  })

  it('rebalances interleaved kinds evenly without changing visible order (invariant 21)', () => {
    // Deliberately pathological keys, including an exact tie that only
    // UUID order disambiguates, interleaving placements + decorations.
    const p1 = uuidv7()
    const d1 = uuidv7()
    const p2 = uuidv7()
    const d2 = uuidv7()
    const d3 = uuidv7()
    insertPlacement(p1, 0.0000001)
    insertDecoration(d1, 0.0000002)
    insertPlacement(p2, 7.5)
    insertDecoration(d2, 7.5)
    insertDecoration(d3, 1e12)

    const before = orderedCanvasContent(ctx, ctx.rootCanvasId).map((item) => item.id)
    ctx.db.transaction(() => rebalanceCanvas(ctx, ctx.rootCanvasId))
    const after = orderedCanvasContent(ctx, ctx.rootCanvasId)

    expect(after.map((item) => item.id)).toEqual(before)
    expect(after.map((item) => item.renderOrder)).toEqual(
      before.map((_, i) => (i + 1) * RENDER_ORDER_GAP),
    )
    // The tie is gone: the total order is deterministic by key alone.
    expect(new Set(after.map((item) => item.renderOrder)).size).toBe(after.length)
  })
})
