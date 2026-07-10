import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { uuidv7 } from '@ew/domain'
import {
  CommandRegistry,
  type CommittedResult,
  type InverseCommand,
  type CaptureInFramePayload,
} from '@ew/commands'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Dispatcher, type CommandContext } from '../dispatcher'
import { createProject, type ProjectHandle } from '../project'
import { QueryRegistry } from '../queries'
import { registerFrameQueries, type FrameTransitiveMembers, type FrameTree } from '../queries-frames'
import { registerCanvasHandlers } from './canvases'
import { registerFrameHandlers } from './frames'
import { registerLifecycleHandlers } from './lifecycle'
import { registerNodeHandlers } from './nodes'
import { registerPlacementHandlers } from './placements'

let dir: string
let handle: ProjectHandle
let dispatcher: Dispatcher
let queries: QueryRegistry

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'ew-frame-'))
  handle = createProject(dir, 'Frame Test')
  const registry = new CommandRegistry<CommandContext>()
  registerNodeHandlers(registry)
  registerPlacementHandlers(registry)
  registerCanvasHandlers(registry)
  registerLifecycleHandlers(registry)
  registerFrameHandlers(registry)
  dispatcher = new Dispatcher(handle, registry)
  queries = new QueryRegistry()
  registerFrameQueries(queries)
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
  expect(result, JSON.stringify(result)).toMatchObject({ status: 'committed' })
  return result as CommittedResult
}

function undo(inverse: InverseCommand | null): CommittedResult {
  expect(inverse).not.toBeNull()
  return committed(inverse!.commandType, inverse!.payload)
}

function runQuery<T>(name: string, args: unknown): T {
  const ctx = {
    db: handle.db,
    projectId: handle.projectId,
    rootNodeId: handle.rootNodeId,
    rootCanvasId: handle.rootCanvasId,
  }
  const result = queries.run(ctx, name, args)
  expect(result.ok, JSON.stringify(result)).toBe(true)
  return (result as { ok: true; result: T }).result
}

/** A frame placement on the given canvas (default the root canvas). */
function frame(canvasId: string = handle.rootCanvasId): { nodeId: string; placementId: string } {
  const nodeId = uuidv7()
  committed('CreateNode', { nodeId })
  committed('SetNodeAppearance', { nodeId, appearance: { kind: 'frame' } })
  const placementId = uuidv7()
  committed('CreatePlacement', { placementId, canvasId, nodeId })
  return { nodeId, placementId }
}

/** A plain (dot) item placement on the given canvas. */
function item(canvasId: string = handle.rootCanvasId): { nodeId: string; placementId: string } {
  const nodeId = uuidv7()
  committed('CreateNode', { nodeId })
  committed('SetNodeAppearance', { nodeId, appearance: { kind: 'dot', color: '#abc' } })
  const placementId = uuidv7()
  committed('CreatePlacement', { placementId, canvasId, nodeId })
  return { nodeId, placementId }
}

function secondCanvas(): string {
  const nodeId = uuidv7()
  committed('CreateNode', { nodeId })
  const canvasId = uuidv7()
  committed('CreateCanvas', { canvasId, nodeId })
  return canvasId
}

function parentOf(memberPlacementId: string): string | null {
  const row = handle.db.get<{ frame_placement_id: string }>(
    'SELECT frame_placement_id FROM frame_member WHERE member_placement_id = ?',
    memberPlacementId,
  )
  return row?.frame_placement_id ?? null
}

function memberRowCount(): number {
  return handle.db.get<{ n: number }>('SELECT count(*) AS n FROM frame_member')!.n
}

// ---------------------------------------------------------------- appearance

describe("'frame' appearance kind (§4.9)", () => {
  it('SetNodeAppearance accepts frame and round-trips through its inverse', () => {
    const nodeId = uuidv7()
    committed('CreateNode', { nodeId })
    const set = committed('SetNodeAppearance', { nodeId, appearance: { kind: 'frame' } })
    expect(
      handle.db.get<{ appearance_kind: string }>(
        'SELECT appearance_kind FROM node WHERE id = ?',
        nodeId,
      )!.appearance_kind,
    ).toBe('frame')
    // The reconstruction switch must not silently drop 'frame': its
    // inverse restores the prior (null) appearance, and re-running the
    // forward again lands back on frame.
    undo(set.inverse)
    expect(
      handle.db.get<{ appearance_kind: string | null }>(
        'SELECT appearance_kind FROM node WHERE id = ?',
        nodeId,
      )!.appearance_kind,
    ).toBeNull()
  })

  it('setting frame OVER a prior appearance restores that prior on undo', () => {
    const nodeId = uuidv7()
    committed('CreateNode', { nodeId })
    committed('SetNodeAppearance', { nodeId, appearance: { kind: 'dot', color: '#123456' } })
    const toFrame = committed('SetNodeAppearance', { nodeId, appearance: { kind: 'frame' } })
    undo(toFrame.inverse)
    expect(
      handle.db.get<{ appearance_kind: string; appearance_color: string }>(
        'SELECT appearance_kind, appearance_color FROM node WHERE id = ?',
        nodeId,
      ),
    ).toMatchObject({ appearance_kind: 'dot', appearance_color: '#123456' })
  })
})

// ------------------------------------------------------------------ capture

describe('CaptureInFrame / ReleaseFromFrame', () => {
  it('captures a batch and getFrameTree lists them under the frame', () => {
    const f = frame()
    const a = item()
    const b = item()
    const c = item()
    committed('CaptureInFrame', {
      framePlacementId: f.placementId,
      memberPlacementIds: [a.placementId, b.placementId, c.placementId],
    } satisfies CaptureInFramePayload)

    const tree = runQuery<FrameTree>('getFrameTree', { canvasId: handle.rootCanvasId })
    expect(tree.roots).toHaveLength(1)
    expect(tree.roots[0]!.placementId).toBe(f.placementId)
    expect(tree.roots[0]!.depth).toBe(0)
    expect(tree.roots[0]!.members.map((m) => m.placementId).sort()).toEqual(
      [a.placementId, b.placementId, c.placementId].sort(),
    )
    expect(tree.roots[0]!.members.every((m) => m.depth === 1 && !m.isFrame)).toBe(true)
  })

  it('re-capture re-parents (one row, single parent) and undoes exactly', () => {
    const f1 = frame()
    const f2 = frame()
    const a = item()

    const first = committed('CaptureInFrame', {
      framePlacementId: f1.placementId,
      memberPlacementIds: [a.placementId],
    })
    expect(parentOf(a.placementId)).toBe(f1.placementId)

    const second = committed('CaptureInFrame', {
      framePlacementId: f2.placementId,
      memberPlacementIds: [a.placementId],
    })
    // Single parent: still exactly one row, now under f2.
    expect(memberRowCount()).toBe(1)
    expect(parentOf(a.placementId)).toBe(f2.placementId)

    // Undo the re-capture → back under f1 (exact prior parent).
    undo(second.inverse)
    expect(parentOf(a.placementId)).toBe(f1.placementId)

    // Undo the first capture → uncaptured (no row).
    undo(first.inverse)
    expect(parentOf(a.placementId)).toBeNull()
    expect(memberRowCount()).toBe(0)
  })

  it('release removes membership and its inverse restores the exact frame', () => {
    const f = frame()
    const a = item()
    committed('CaptureInFrame', {
      framePlacementId: f.placementId,
      memberPlacementIds: [a.placementId],
    })
    const released = committed('ReleaseFromFrame', { memberPlacementIds: [a.placementId] })
    expect(parentOf(a.placementId)).toBeNull()
    undo(released.inverse)
    expect(parentOf(a.placementId)).toBe(f.placementId)
  })

  it('rejects capture into a non-frame placement', () => {
    const notAFrame = item()
    const a = item()
    const result = exec('CaptureInFrame', {
      framePlacementId: notAFrame.placementId,
      memberPlacementIds: [a.placementId],
    })
    expect(result).toMatchObject({ status: 'error', code: 'VALIDATION_FAILED' })
  })

  it('rejects capture across canvases', () => {
    const f = frame()
    const other = secondCanvas()
    const elsewhere = item(other)
    const result = exec('CaptureInFrame', {
      framePlacementId: f.placementId,
      memberPlacementIds: [elsewhere.placementId],
    })
    expect(result).toMatchObject({ status: 'error', code: 'VALIDATION_FAILED' })
    expect(memberRowCount()).toBe(0)
  })

  it('rejects an empty or duplicated member batch', () => {
    const f = frame()
    const a = item()
    expect(exec('CaptureInFrame', { framePlacementId: f.placementId, memberPlacementIds: [] })).toMatchObject(
      { status: 'error', code: 'VALIDATION_FAILED' },
    )
    expect(
      exec('CaptureInFrame', {
        framePlacementId: f.placementId,
        memberPlacementIds: [a.placementId, a.placementId],
      }),
    ).toMatchObject({ status: 'error', code: 'VALIDATION_FAILED' })
  })

  it('rejects releasing a placement that is not captured', () => {
    const a = item()
    expect(exec('ReleaseFromFrame', { memberPlacementIds: [a.placementId] })).toMatchObject({
      status: 'error',
      code: 'FRAME_MEMBER_NOT_FOUND',
    })
  })

  it('a failing member aborts the whole batch (validate before write)', () => {
    const f = frame()
    const good = item()
    const other = secondCanvas()
    const bad = item(other)
    const result = exec('CaptureInFrame', {
      framePlacementId: f.placementId,
      memberPlacementIds: [good.placementId, bad.placementId],
    })
    expect(result).toMatchObject({ status: 'error' })
    // Nothing was captured — not even the valid member.
    expect(memberRowCount()).toBe(0)
  })
})

// -------------------------------------------------------------------- cycles

describe('cycle rejection (§4.9 single-parent tree, never a graph)', () => {
  it('rejects capturing a frame into itself', () => {
    const f = frame()
    expect(
      exec('CaptureInFrame', {
        framePlacementId: f.placementId,
        memberPlacementIds: [f.placementId],
      }),
    ).toMatchObject({ status: 'error', code: 'FRAME_CYCLE' })
  })

  it('rejects capturing an outer frame into its own descendant', () => {
    const outer = frame()
    const inner = frame()
    // inner is a member of outer.
    committed('CaptureInFrame', {
      framePlacementId: outer.placementId,
      memberPlacementIds: [inner.placementId],
    })
    // Capturing outer into inner would close the loop.
    expect(
      exec('CaptureInFrame', {
        framePlacementId: inner.placementId,
        memberPlacementIds: [outer.placementId],
      }),
    ).toMatchObject({ status: 'error', code: 'FRAME_CYCLE' })
    expect(parentOf(outer.placementId)).toBeNull()
  })

  it('rejects a deeper transitive cycle', () => {
    const a = frame()
    const b = frame()
    const c = frame()
    committed('CaptureInFrame', { framePlacementId: a.placementId, memberPlacementIds: [b.placementId] })
    committed('CaptureInFrame', { framePlacementId: b.placementId, memberPlacementIds: [c.placementId] })
    // a → b → c ; capturing a into c must fail.
    expect(
      exec('CaptureInFrame', { framePlacementId: c.placementId, memberPlacementIds: [a.placementId] }),
    ).toMatchObject({ status: 'error', code: 'FRAME_CYCLE' })
  })
})

// ---------------------------------------------------------------- nested tree

describe('getFrameTree + getFrameTransitiveMembers (nesting)', () => {
  it('reads a 3-level nest as outer → [items, inner → [item]]', () => {
    const outer = frame()
    const inner = frame()
    const d = item()
    const e = item()
    const c = item()

    committed('CaptureInFrame', {
      framePlacementId: outer.placementId,
      memberPlacementIds: [d.placementId, e.placementId, inner.placementId],
    })
    committed('CaptureInFrame', {
      framePlacementId: inner.placementId,
      memberPlacementIds: [c.placementId],
    })

    const tree = runQuery<FrameTree>('getFrameTree', { canvasId: handle.rootCanvasId })
    expect(tree.roots).toHaveLength(1)
    const root = tree.roots[0]!
    expect(root.placementId).toBe(outer.placementId)

    const innerNode = root.members.find((m) => m.placementId === inner.placementId)!
    expect(innerNode.isFrame).toBe(true)
    expect(innerNode.depth).toBe(1)
    expect(innerNode.members.map((m) => m.placementId)).toEqual([c.placementId])
    expect(innerNode.members[0]!.depth).toBe(2)

    const items = root.members.filter((m) => !m.isFrame).map((m) => m.placementId)
    expect(items.sort()).toEqual([d.placementId, e.placementId].sort())

    const transitive = runQuery<FrameTransitiveMembers>('getFrameTransitiveMembers', {
      framePlacementId: outer.placementId,
    })
    expect(transitive.memberPlacementIds.sort()).toEqual(
      [inner.placementId, c.placementId, d.placementId, e.placementId].sort(),
    )
    // The inner frame's transitive set is just its own descendant.
    const innerTransitive = runQuery<FrameTransitiveMembers>('getFrameTransitiveMembers', {
      framePlacementId: inner.placementId,
    })
    expect(innerTransitive.memberPlacementIds).toEqual([c.placementId])
  })

  it('a re-parented member has exactly one parent in the tree', () => {
    const outer = frame()
    const inner = frame()
    const x = item()
    committed('CaptureInFrame', { framePlacementId: outer.placementId, memberPlacementIds: [inner.placementId, x.placementId] })
    // Move x from outer into inner.
    committed('CaptureInFrame', { framePlacementId: inner.placementId, memberPlacementIds: [x.placementId] })

    const tree = runQuery<FrameTree>('getFrameTree', { canvasId: handle.rootCanvasId })
    const root = tree.roots[0]!
    // x is NO LONGER a direct member of outer.
    expect(root.members.map((m) => m.placementId)).not.toContain(x.placementId)
    const innerNode = root.members.find((m) => m.placementId === inner.placementId)!
    expect(innerNode.members.map((m) => m.placementId)).toEqual([x.placementId])
  })
})

// ----------------------------------------------------------------- lifecycle

describe('lifecycle (§9.6 aggregate)', () => {
  it('trashing the frame NODE preserves membership; restore rejoins', () => {
    const f = frame()
    const a = item()
    const b = item()
    committed('CaptureInFrame', {
      framePlacementId: f.placementId,
      memberPlacementIds: [a.placementId, b.placementId],
    })

    committed('TrashNode', { nodeId: f.nodeId })
    // Membership rows survive the trash (they key on the placement,
    // which trash never deletes).
    expect(memberRowCount()).toBe(2)
    // Members are independent nodes — still active on the board.
    expect(
      handle.db.get<{ lifecycle_state: string }>(
        'SELECT lifecycle_state FROM placement WHERE id = ?',
        a.placementId,
      )!.lifecycle_state,
    ).toBe('active')
    // The trashed frame's region drops out of the render tree.
    expect(runQuery<FrameTree>('getFrameTree', { canvasId: handle.rootCanvasId }).roots).toHaveLength(0)

    committed('RestoreRecord', { kind: 'node', id: f.nodeId })
    const tree = runQuery<FrameTree>('getFrameTree', { canvasId: handle.rootCanvasId })
    expect(tree.roots).toHaveLength(1)
    expect(tree.roots[0]!.members.map((m) => m.placementId).sort()).toEqual(
      [a.placementId, b.placementId].sort(),
    )
  })

  it('trashing a MEMBER node keeps its row for restore, hides it live', () => {
    const f = frame()
    const a = item()
    const b = item()
    committed('CaptureInFrame', {
      framePlacementId: f.placementId,
      memberPlacementIds: [a.placementId, b.placementId],
    })
    committed('TrashNode', { nodeId: a.nodeId })
    // Row survives.
    expect(parentOf(a.placementId)).toBe(f.placementId)
    // The trashed member drops from the grouping tree...
    let root = runQuery<FrameTree>('getFrameTree', { canvasId: handle.rootCanvasId }).roots[0]!
    expect(root.members.map((m) => m.placementId)).toEqual([b.placementId])
    // ...and rejoins on restore.
    committed('RestoreRecord', { kind: 'node', id: a.nodeId })
    root = runQuery<FrameTree>('getFrameTree', { canvasId: handle.rootCanvasId }).roots[0]!
    expect(root.members.map((m) => m.placementId).sort()).toEqual(
      [a.placementId, b.placementId].sort(),
    )
  })

  it('purging the frame node deletes its membership rows (FK cascade)', () => {
    const f = frame()
    const a = item()
    committed('CaptureInFrame', {
      framePlacementId: f.placementId,
      memberPlacementIds: [a.placementId],
    })
    committed('TrashNode', { nodeId: f.nodeId })
    committed('PurgeRecord', { kind: 'node', id: f.nodeId })
    expect(memberRowCount()).toBe(0)
    // The member node itself survives a frame purge (independent node).
    expect(
      handle.db.get<{ id: string }>('SELECT id FROM node WHERE id = ?', a.nodeId),
    ).toBeDefined()
  })

  it('deleting a member placement cascades its membership row away', () => {
    const f = frame()
    const a = item()
    const b = item()
    committed('CaptureInFrame', {
      framePlacementId: f.placementId,
      memberPlacementIds: [a.placementId, b.placementId],
    })
    committed('DeletePlacement', { placementId: a.placementId })
    // a's row is gone; b's row remains.
    expect(parentOf(a.placementId)).toBeNull()
    expect(parentOf(b.placementId)).toBe(f.placementId)
    expect(memberRowCount()).toBe(1)
  })
})

// -------------------------------------------------- membership undo (IMP-180)

describe('frame-membership undo (§4.9, AI-IMP-180)', () => {
  it('undoing a member delete restores its membership', () => {
    const f = frame()
    const a = item()
    const b = item()
    committed('CaptureInFrame', {
      framePlacementId: f.placementId,
      memberPlacementIds: [a.placementId, b.placementId],
    })
    const del = committed('DeletePlacement', { placementId: a.placementId })
    // The cascade wiped a's row; b's survives.
    expect(parentOf(a.placementId)).toBeNull()
    expect(memberRowCount()).toBe(1)

    undo(del.inverse)
    // a is back AND a member of f again — no longer permanently ungrouped.
    expect(parentOf(a.placementId)).toBe(f.placementId)
    expect(parentOf(b.placementId)).toBe(f.placementId)
    expect(memberRowCount()).toBe(2)
  })

  it('undoing a frame delete restores all its members', () => {
    const f = frame()
    const a = item()
    const b = item()
    committed('CaptureInFrame', {
      framePlacementId: f.placementId,
      memberPlacementIds: [a.placementId, b.placementId],
    })
    const del = committed('DeletePlacement', { placementId: f.placementId })
    // Deleting the frame's placement cascaded every member row.
    expect(memberRowCount()).toBe(0)

    undo(del.inverse)
    expect(parentOf(a.placementId)).toBe(f.placementId)
    expect(parentOf(b.placementId)).toBe(f.placementId)
    expect(memberRowCount()).toBe(2)
  })

  it('captures both directions: a nested frame rejoins its parent AND regains its own members', () => {
    const outer = frame()
    const inner = frame()
    const c = item()
    committed('CaptureInFrame', {
      framePlacementId: outer.placementId,
      memberPlacementIds: [inner.placementId],
    })
    committed('CaptureInFrame', {
      framePlacementId: inner.placementId,
      memberPlacementIds: [c.placementId],
    })
    // inner is simultaneously a MEMBER (of outer) and a FRAME (holding c).
    const del = committed('DeletePlacement', { placementId: inner.placementId })
    expect(memberRowCount()).toBe(0)

    undo(del.inverse)
    expect(parentOf(inner.placementId)).toBe(outer.placementId)
    expect(parentOf(c.placementId)).toBe(inner.placementId)
    expect(memberRowCount()).toBe(2)
  })

  it('batch delete of a frame with its members restores every row (FK ordering)', () => {
    const f = frame()
    const a = item()
    const b = item()
    committed('CaptureInFrame', {
      framePlacementId: f.placementId,
      memberPlacementIds: [a.placementId, b.placementId],
    })
    // One DeleteContent removes the frame AND both members — the same
    // rows are captured by multiple payloads; RestoreContent revives
    // placements one at a time, exercising the both-endpoints-live guard.
    const del = committed('DeleteContent', {
      canvasId: handle.rootCanvasId,
      placementIds: [f.placementId, a.placementId, b.placementId],
      decorationIds: [],
    })
    expect(memberRowCount()).toBe(0)

    undo(del.inverse)
    expect(parentOf(a.placementId)).toBe(f.placementId)
    expect(parentOf(b.placementId)).toBe(f.placementId)
    expect(memberRowCount()).toBe(2)
  })

  it('old command-log records without the field still restore (ungrouped)', () => {
    const f = frame()
    const a = item()
    committed('CaptureInFrame', {
      framePlacementId: f.placementId,
      memberPlacementIds: [a.placementId],
    })
    const del = committed('DeletePlacement', { placementId: a.placementId })
    // Simulate a pre-AI-IMP-180 undo step: strip the new field.
    const legacy = { ...(del.inverse!.payload as Record<string, unknown>) }
    delete legacy.capturedFrameMembers
    committed('RestorePlacement', legacy)
    // Restores the placement without error; membership treated as empty.
    expect(
      handle.db.get<{ id: string }>('SELECT id FROM placement WHERE id = ?', a.placementId),
    ).toBeDefined()
    expect(parentOf(a.placementId)).toBeNull()
    expect(memberRowCount()).toBe(0)
  })
})
