import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { uuidv7 } from '@ew/domain'
import { CommandRegistry, type CommittedResult, type InverseCommand } from '@ew/commands'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Dispatcher, type CommandContext } from '../dispatcher'
import { createProject, type ProjectHandle } from '../project'
import { orderedCanvasContent } from '../render-order'
import { registerCanvasHandlers } from './canvases'
import { registerDecorationHandlers } from './decorations'
import { registerNodeHandlers } from './nodes'
import { registerPlacementHandlers, releaseConnectorAnchors } from './placements'

let dir: string
let handle: ProjectHandle
let dispatcher: Dispatcher
let ctx: CommandContext

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'ew-placement-'))
  handle = createProject(dir, 'Placement Test')
  const registry = new CommandRegistry<CommandContext>()
  registerNodeHandlers(registry)
  registerCanvasHandlers(registry)
  registerPlacementHandlers(registry)
  registerDecorationHandlers(registry)
  dispatcher = new Dispatcher(handle, registry)
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
  rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
})

function exec(commandType: string, payload: unknown) {
  return dispatcher.execute({
    commandId: uuidv7(),
    projectId: handle.projectId,
    commandType,
    commandVersion: 1,
    issuedAt: new Date().toISOString(),
    payload,
  })
}

function committed(commandType: string, payload: unknown): CommittedResult {
  const result = exec(commandType, payload)
  expect(result).toMatchObject({ status: 'committed' })
  return result as CommittedResult
}

function undo(inverse: InverseCommand | null): CommittedResult {
  expect(inverse).not.toBeNull()
  return committed(inverse!.commandType, inverse!.payload)
}

function createPlacement(overrides: Record<string, unknown> = {}): string {
  const placementId = uuidv7()
  committed('CreatePlacement', {
    placementId,
    canvasId: handle.rootCanvasId,
    nodeId: handle.rootNodeId,
    ...overrides,
  })
  return placementId
}

function createDecoration(overrides: Record<string, unknown> = {}): string {
  const decorationId = uuidv7()
  committed('CreateDecoration', {
    decorationId,
    canvasId: handle.rootCanvasId,
    kind: 'shape',
    data: {},
    ...overrides,
  })
  return decorationId
}

function placementRow(id: string) {
  return handle.db.get<Record<string, unknown>>('SELECT * FROM placement WHERE id = ?', id)
}

function visibleOrder(): string[] {
  return orderedCanvasContent(ctx, handle.rootCanvasId).map((item) => item.id)
}

describe('CreatePlacement', () => {
  it('rejects malformed and non-finite geometry before SQLite', () => {
    expect(exec('CreatePlacement', null)).toMatchObject({
      status: 'error',
      code: 'VALIDATION_FAILED',
    })
    const placementId = uuidv7()
    expect(
      exec('CreatePlacement', {
        placementId,
        canvasId: handle.rootCanvasId,
        nodeId: handle.rootNodeId,
        x: Number.POSITIVE_INFINITY,
      }),
    ).toMatchObject({ status: 'error', code: 'VALIDATION_FAILED' })
    expect(placementRow(placementId)).toBeUndefined()
    expect(
      exec('CreatePlacement', {
        placementId,
        canvasId: handle.rootCanvasId,
        nodeId: handle.rootNodeId,
        scale: 0,
      }),
    ).toMatchObject({ status: 'error', code: 'VALIDATION_FAILED' })
  })

  it('enforces FK-valid canvas and node (invariant 7)', () => {
    expect(
      exec('CreatePlacement', {
        placementId: uuidv7(),
        canvasId: uuidv7(),
        nodeId: handle.rootNodeId,
      }),
    ).toMatchObject({ status: 'error', code: 'CANVAS_NOT_FOUND' })
    expect(
      exec('CreatePlacement', {
        placementId: uuidv7(),
        canvasId: handle.rootCanvasId,
        nodeId: uuidv7(),
      }),
    ).toMatchObject({ status: 'error', code: 'NODE_NOT_FOUND' })
  })

  it('defaults per §4.5: label visible, identity transform, allocated render_order', () => {
    const first = createPlacement({ x: 10, y: 20 })
    const second = createPlacement()
    const a = placementRow(first)!
    const b = placementRow(second)!
    expect(a).toMatchObject({ x: 10, y: 20, scale: 1, rotation: 0, label_visible: 1, flip_x: 0 })
    expect(b.render_order as number).toBeGreaterThan(a.render_order as number)
  })

  it('allows several placements of one node on one canvas (invariant 9)', () => {
    const ids = [createPlacement(), createPlacement(), createPlacement()]
    const rows = handle.db.all<{ id: string }>(
      'SELECT id FROM placement WHERE node_id = ? AND canvas_id = ?',
      handle.rootNodeId,
      handle.rootCanvasId,
    )
    expect(rows.map((r) => r.id).sort()).toEqual([...ids].sort())
  })

  it('undoes creation via DeleteDraftPlacement and restores exactly on redo', () => {
    const placementId = createPlacement({ x: 5, y: 6, scale: 2 })
    const create = committed('MovePlacement', {
      placementId,
      x: 5,
      y: 6,
      width: 100,
      height: 50,
      scale: 2,
      rotation: 0.5,
    })
    const removed = undo(
      // Undoing the creation itself.
      { commandType: 'DeleteDraftPlacement', commandVersion: 1, payload: { placementId } },
    )
    expect(placementRow(placementId)).toBeUndefined()
    undo(removed.inverse)
    expect(placementRow(placementId)).toMatchObject({
      x: 5,
      y: 6,
      width: 100,
      height: 50,
      scale: 2,
      rotation: 0.5,
    })
    expect(create.status).toBe('committed')
  })
})

describe('MovePlacement', () => {
  it('rejects non-finite or non-positive transforms without changing the placement', () => {
    const placementId = createPlacement({ x: 10, y: 20 })
    const before = placementRow(placementId)
    expect(
      exec('MovePlacement', {
        placementId,
        x: Number.NEGATIVE_INFINITY,
        y: 20,
        width: null,
        height: null,
        scale: 1,
        rotation: 0,
      }),
    ).toMatchObject({ status: 'error', code: 'VALIDATION_FAILED' })
    expect(placementRow(placementId)).toEqual(before)
  })

  it('applies the completed-gesture transform and round-trips its inverse', () => {
    const placementId = createPlacement({ x: 1, y: 2 })
    const move = committed('MovePlacement', {
      placementId,
      x: 100,
      y: 200,
      width: 40,
      height: 30,
      scale: 1.5,
      rotation: 90,
    })
    expect(placementRow(placementId)).toMatchObject({ x: 100, y: 200, scale: 1.5, rotation: 90 })

    undo(move.inverse)
    expect(placementRow(placementId)).toMatchObject({
      x: 1,
      y: 2,
      width: null,
      height: null,
      scale: 1,
      rotation: 0,
    })
  })

  it('rejects a missing placement', () => {
    expect(
      exec('MovePlacement', {
        placementId: uuidv7(),
        x: 0,
        y: 0,
        width: null,
        height: null,
        scale: 1,
        rotation: 0,
      }),
    ).toMatchObject({ status: 'error', code: 'PLACEMENT_NOT_FOUND' })
  })
})

describe('placement presentation state', () => {
  it('toggles label visibility with inverse (§4.5 default visible)', () => {
    const placementId = createPlacement()
    expect(placementRow(placementId)!.label_visible).toBe(1)
    const hide = committed('SetPlacementLabelVisibility', { placementId, visible: false })
    expect(placementRow(placementId)!.label_visible).toBe(0)
    undo(hide.inverse)
    expect(placementRow(placementId)!.label_visible).toBe(1)
  })

  it('FlipPlacement toggles one axis and is self-inverse', () => {
    const placementId = createPlacement()
    const flip = committed('FlipPlacement', { placementId, axis: 'x' })
    expect(placementRow(placementId)).toMatchObject({ flip_x: 1, flip_y: 0 })
    committed('FlipPlacement', { placementId, axis: 'y' })
    expect(placementRow(placementId)).toMatchObject({ flip_x: 1, flip_y: 1 })
    undo(flip.inverse)
    expect(placementRow(placementId)).toMatchObject({ flip_x: 0, flip_y: 1 })
  })

  it('SetPlacementLock persists the flag with inverse (§6.9 rev 0.17, default unlocked)', () => {
    const placementId = createPlacement()
    expect(placementRow(placementId)!.locked).toBe(0)
    const lock = committed('SetPlacementLock', { placementId, locked: true })
    expect(placementRow(placementId)!.locked).toBe(1)
    // Lock is enforced at the gesture surface, not the handler: a
    // pre-lock transform's undo must still apply while locked.
    committed('MovePlacement', {
      placementId,
      x: 9,
      y: 9,
      width: null,
      height: null,
      scale: 1,
      rotation: 0,
    })
    expect(placementRow(placementId)).toMatchObject({ x: 9, locked: 1 })
    undo(lock.inverse)
    expect(placementRow(placementId)!.locked).toBe(0)
  })

  it('SetPlacementLock validates payload and target', () => {
    const placementId = createPlacement()
    expect(exec('SetPlacementLock', { placementId, locked: 1 })).toMatchObject({
      status: 'error',
      code: 'VALIDATION_FAILED',
    })
    expect(exec('SetPlacementLock', { placementId: uuidv7(), locked: true })).toMatchObject({
      status: 'error',
      code: 'PLACEMENT_NOT_FOUND',
    })
  })

  it('DeleteDraftPlacement restores the lock flag on redo', () => {
    const placementId = createPlacement()
    committed('SetPlacementLock', { placementId, locked: true })
    const removed = committed('DeleteDraftPlacement', { placementId })
    expect(placementRow(placementId)).toBeUndefined()
    undo(removed.inverse)
    expect(placementRow(placementId)!.locked).toBe(1)
  })
})

describe('ReorderContent (§4.4 shared plane)', () => {
  it('reorders placements and decorations against each other with inverses', () => {
    const p1 = createPlacement()
    const d1 = createDecoration()
    const p2 = createPlacement()
    expect(visibleOrder()).toEqual([p1, d1, p2])

    // Send p2 between p1 and d1.
    const between = committed('ReorderContent', {
      canvasId: handle.rootCanvasId,
      itemId: p2,
      afterId: p1,
      beforeId: d1,
    })
    expect(visibleOrder()).toEqual([p1, p2, d1])

    // Bring the decoration to the very back, then to the very front.
    committed('ReorderContent', {
      canvasId: handle.rootCanvasId,
      itemId: d1,
      afterId: null,
      beforeId: p1,
    })
    expect(visibleOrder()).toEqual([d1, p1, p2])
    committed('ReorderContent', {
      canvasId: handle.rootCanvasId,
      itemId: d1,
      afterId: p2,
      beforeId: null,
    })
    expect(visibleOrder()).toEqual([p1, p2, d1])

    // The captured inverse returns p2 to its original neighbors.
    undo(between.inverse)
    expect(visibleOrder()).toEqual([p1, d1, p2])
  })

  it('rejects unknown items and self-referential bounds', () => {
    const p1 = createPlacement()
    expect(
      exec('ReorderContent', {
        canvasId: handle.rootCanvasId,
        itemId: uuidv7(),
        afterId: p1,
        beforeId: null,
      }),
    ).toMatchObject({ status: 'error', code: 'CONTENT_NOT_FOUND' })
    expect(
      exec('ReorderContent', {
        canvasId: handle.rootCanvasId,
        itemId: p1,
        afterId: p1,
        beforeId: null,
      }),
    ).toMatchObject({ status: 'error', code: 'VALIDATION_FAILED' })
    expect(
      exec('ReorderContent', {
        canvasId: handle.rootCanvasId,
        itemId: p1,
        afterId: null,
        beforeId: null,
      }),
    ).toMatchObject({ status: 'error', code: 'VALIDATION_FAILED' })
  })

  it('rebalances transactionally when midpoints exhaust, preserving visible order', () => {
    const anchor = createPlacement()
    const top = createDecoration()
    // Repeatedly wedge a fresh decoration directly above `anchor`.
    // Every insertion halves the available gap; float64 runs out of
    // midpoints after ~52 halvings, forcing at least one rebalance.
    const inserted: string[] = []
    let previous = top
    for (let i = 0; i < 60; i += 1) {
      const d = createDecoration()
      committed('ReorderContent', {
        canvasId: handle.rootCanvasId,
        itemId: d,
        afterId: anchor,
        beforeId: previous,
      })
      inserted.push(d)
      previous = d
    }

    const expected = [anchor, ...[...inserted].reverse(), top]
    const items = orderedCanvasContent(ctx, handle.rootCanvasId)
    expect(items.map((item) => item.id)).toEqual(expected)
    // Deterministic total order survives: keys are strictly increasing
    // (no ties left behind by the rebalance).
    const keys = items.map((item) => item.renderOrder)
    for (let i = 1; i < keys.length; i += 1) {
      expect(keys[i]!).toBeGreaterThan(keys[i - 1]!)
    }
  })
})

describe('releaseConnectorAnchors (helper for AI-IMP-013)', () => {
  it('frees anchored endpoints at the placement position, keeping the connector', () => {
    const placementId = createPlacement({ x: 33, y: 44 })
    const other = createPlacement({ x: 0, y: 0 })
    const connector = createDecoration({
      kind: 'connector',
      data: { end: { x: 9, y: 9 } },
      anchorStartPlacementId: placementId,
      anchorEndPlacementId: other,
    })

    const freed = handle.db.transaction(() => releaseConnectorAnchors(ctx, placementId))
    expect(freed).toEqual([connector])

    const row = handle.db.get<{
      data: string
      anchor_start_placement_id: string | null
      anchor_end_placement_id: string | null
    }>(
      'SELECT data, anchor_start_placement_id, anchor_end_placement_id FROM decoration WHERE id = ?',
      connector,
    )!
    // §4.9: the endpoint becomes a free point at its last position;
    // the other anchor and the connector itself survive.
    expect(row.anchor_start_placement_id).toBeNull()
    expect(row.anchor_end_placement_id).toBe(other)
    expect(JSON.parse(row.data)).toEqual({ start: { x: 33, y: 44 }, end: { x: 9, y: 9 } })
  })

  it('is a no-op for placements nothing anchors to', () => {
    const placementId = createPlacement()
    expect(handle.db.transaction(() => releaseConnectorAnchors(ctx, placementId))).toEqual([])
  })

  it('runs inside DeleteDraftPlacement so undoing a create never strands anchors', () => {
    const placementId = createPlacement({ x: 1, y: 2 })
    const connector = createDecoration({
      kind: 'connector',
      data: {},
      anchorStartPlacementId: placementId,
    })
    const removed = committed('DeleteDraftPlacement', { placementId })
    expect(removed.affected).toContainEqual({ kind: 'decoration', id: connector })
    const row = handle.db.get<{ data: string; anchor_start_placement_id: string | null }>(
      'SELECT data, anchor_start_placement_id FROM decoration WHERE id = ?',
      connector,
    )!
    expect(row.anchor_start_placement_id).toBeNull()
    expect(JSON.parse(row.data)).toEqual({ start: { x: 1, y: 2 } })
  })
})

describe('TransformContent (invariant 25: one command per gesture)', () => {
  it('validates every placement and decoration number before writing the batch', () => {
    const placementId = createPlacement({ x: 1, y: 2 })
    const decorationId = createDecoration({ data: { x: 3, y: 4 } })
    const before = placementRow(placementId)
    expect(
      exec('TransformContent', {
        canvasId: handle.rootCanvasId,
        items: [
          {
            kind: 'placement',
            placementId,
            x: 100,
            y: 200,
            width: null,
            height: null,
            scale: 1,
            rotation: 0,
          },
          {
            kind: 'decoration',
            decorationId,
            data: { x: Number.POSITIVE_INFINITY, y: 4 },
          },
        ],
      }),
    ).toMatchObject({ status: 'error', code: 'VALIDATION_FAILED' })
    expect(placementRow(placementId)).toEqual(before)
  })

  function transform(placementId: string, x: number, y: number) {
    return {
      kind: 'placement' as const,
      placementId,
      x,
      y,
      width: null,
      height: null,
      scale: 1,
      rotation: 0,
    }
  }

  it('applies mixed placement and decoration transforms atomically', () => {
    const p1 = createPlacement({ x: 0, y: 0 })
    const p2 = createPlacement({ x: 10, y: 10 })
    const d = createDecoration({ data: { x: 5, y: 5, text: 'note' } })
    const result = committed('TransformContent', {
      canvasId: handle.rootCanvasId,
      items: [
        transform(p1, 100, 50),
        transform(p2, 110, 60),
        { kind: 'decoration', decorationId: d, data: { x: 105, y: 55, text: 'note' } },
      ],
    })
    expect(placementRow(p1)).toMatchObject({ x: 100, y: 50 })
    expect(placementRow(p2)).toMatchObject({ x: 110, y: 60 })
    const data = handle.db.get<{ data: string }>('SELECT data FROM decoration WHERE id = ?', d)!
    expect(JSON.parse(data.data)).toEqual({ x: 105, y: 55, text: 'note' })
    expect(result.affected).toHaveLength(3)
  })

  it('round-trips through its inverse', () => {
    const p = createPlacement({ x: 1, y: 2 })
    const d = createDecoration({ data: { x: 3, y: 4 } })
    const result = committed('TransformContent', {
      canvasId: handle.rootCanvasId,
      items: [
        transform(p, 200, 300),
        { kind: 'decoration', decorationId: d, data: { x: 9, y: 9 } },
      ],
    })
    undo(result.inverse)
    expect(placementRow(p)).toMatchObject({ x: 1, y: 2 })
    const data = handle.db.get<{ data: string }>('SELECT data FROM decoration WHERE id = ?', d)!
    expect(JSON.parse(data.data)).toEqual({ x: 3, y: 4 })
  })

  it('rejects cross-canvas items and leaves no partial state', () => {
    const nodeId = uuidv7()
    committed('CreateNode', { nodeId })
    const canvasId = uuidv7()
    committed('CreateCanvas', { canvasId, nodeId })
    const local = createPlacement({ x: 0, y: 0 })
    const foreign = uuidv7()
    committed('CreatePlacement', { placementId: foreign, canvasId, nodeId })

    const result = exec('TransformContent', {
      canvasId: handle.rootCanvasId,
      items: [transform(local, 50, 50), transform(foreign, 60, 60)],
    })
    expect(result).toMatchObject({ status: 'error', code: 'CROSS_CANVAS_TRANSFORM' })
    // The transaction rolled back the first item too.
    expect(placementRow(local)).toMatchObject({ x: 0, y: 0 })
  })

  it('rejects empty payloads, duplicates, and stale revisions', () => {
    const p = createPlacement()
    expect(exec('TransformContent', { canvasId: handle.rootCanvasId, items: [] })).toMatchObject({
      status: 'error',
      code: 'EMPTY_TRANSFORM',
    })
    expect(
      exec('TransformContent', {
        canvasId: handle.rootCanvasId,
        items: [transform(p, 1, 1), transform(p, 2, 2)],
      }),
    ).toMatchObject({ status: 'error', code: 'DUPLICATE_TRANSFORM_ITEM' })

    const stale = dispatcher.execute({
      commandId: uuidv7(),
      projectId: handle.projectId,
      commandType: 'TransformContent',
      commandVersion: 1,
      expectedProjectRevision: 0,
      issuedAt: new Date().toISOString(),
      payload: { canvasId: handle.rootCanvasId, items: [transform(p, 1, 1)] },
    })
    expect(stale).toMatchObject({ status: 'conflict' })
  })
})
