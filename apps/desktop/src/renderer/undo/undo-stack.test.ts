import { describe, expect, it, vi } from 'vitest'
import type { CommandResult, InverseCommand } from '@ew/commands'
import {
  PARTIAL_UNDO_TOAST,
  UndoStack,
  UNDO_STALE_TOAST,
  openGroupToast,
  type StackCommand,
  type UndoStackDeps,
} from './undo-stack'

/**
 * A scriptable executor. Each `execute(command)` returns a committed
 * result whose own inverse comes from `inverseFor(command)`; the log
 * records what actually ran so ordering assertions read like the user's
 * gesture history. `fail(type)` marks a command type as UNDO_STALE.
 */
function harness(
  inverseFor: (command: StackCommand) => InverseCommand | null,
  opts: { canvasId?: string; boardLabel?: string } = {},
) {
  const log: string[] = []
  const toasts: string[] = []
  const failing = new Set<string>()
  let canvasId = opts.canvasId ?? 'board-1'
  const execute = vi.fn(async (command: StackCommand): Promise<CommandResult> => {
    log.push(command.commandType)
    if (failing.has(command.commandType)) {
      return { status: 'error', commandId: 'x', code: 'UNDO_STALE', message: 'gone' }
    }
    return {
      status: 'committed',
      commandId: 'x',
      revision: 1,
      affected: [],
      inverse: inverseFor(command),
    }
  })
  const deps: UndoStackDeps = {
    execute,
    currentCanvasId: () => canvasId,
    boardLabel: () => opts.boardLabel ?? 'Some Board',
    toast: (m) => toasts.push(m),
    onChanged: vi.fn(),
  }
  return {
    stack: new UndoStack(deps),
    log,
    toasts,
    execute,
    onChanged: deps.onChanged as ReturnType<typeof vi.fn>,
    fail: (type: string) => failing.add(type),
    unfail: (type: string) => failing.delete(type),
    setCanvas: (id: string) => (canvasId = id),
  }
}

// A self-inverting move: TransformContent's inverse is a TransformContent
// back to the prior transform, whose own inverse restores the new one.
const selfInverting = (command: StackCommand): InverseCommand => ({
  commandType: command.commandType,
  commandVersion: 1,
  payload: { back: !(command.payload as { back?: boolean }).back },
})

describe('UndoStack (RFC §10.2)', () => {
  it('declines an open newest operation with its exact present-progress toast', async () => {
    const h = harness(selfInverting)
    const order = h.stack.reserveGroup('importing files')

    expect(h.stack.canUndo()).toBe(true)
    await h.stack.undo()
    expect(h.log).toEqual([])
    expect(h.toasts).toEqual([openGroupToast('importing files')])
    expect(h.toasts[0]).toBe("still importing files — that step isn't ready to undo")

    h.stack.releaseGroup(order)
    expect(h.stack.canUndo()).toBe(false)
  })

  it('undoes then redoes a self-inverting command, tracking depth', async () => {
    const h = harness(selfInverting)
    h.stack.record({
      commandType: 'TransformContent',
      commandVersion: 1,
      payload: { back: false },
      inverse: { commandType: 'TransformContent', commandVersion: 1, payload: { back: true } },
      canvasId: 'board-1',
    })
    expect(h.stack.canUndo()).toBe(true)
    expect(h.stack.canRedo()).toBe(false)

    await h.stack.undo()
    // The inverse ran; the entry moved to the redo stack.
    expect(h.log).toEqual(['TransformContent'])
    expect(h.stack.canUndo()).toBe(false)
    expect(h.stack.canRedo()).toBe(true)

    await h.stack.redo()
    expect(h.log).toEqual(['TransformContent', 'TransformContent'])
    expect(h.stack.canUndo()).toBe(true)
    expect(h.stack.canRedo()).toBe(false)
  })

  it('reverts a three-step burst in reverse order, one step each', async () => {
    const h = harness(selfInverting)
    for (const type of ['MoveA', 'MoveB', 'MoveC']) {
      h.stack.record({
        commandType: type,
        commandVersion: 1,
        payload: {},
        inverse: { commandType: `inv-${type}`, commandVersion: 1, payload: {} },
        canvasId: 'board-1',
      })
    }
    await h.stack.undo()
    await h.stack.undo()
    await h.stack.undo()
    // LIFO: C, then B, then A.
    expect(h.log).toEqual(['inv-MoveC', 'inv-MoveB', 'inv-MoveA'])
    expect(h.stack.canUndo()).toBe(false)
  })

  it('redo of an internal-composite inverse re-issues the forward command', async () => {
    // PlaceAsCard → UnplaceCard (inverse); UnplaceCard has a null inverse,
    // so redo must re-run PlaceAsCard (the fallback).
    const inverseFor = (command: StackCommand): InverseCommand | null =>
      command.commandType === 'UnplaceCard'
        ? null
        : { commandType: 'UnplaceCard', commandVersion: 1, payload: {} }
    const h = harness(inverseFor)
    h.stack.record({
      commandType: 'PlaceAsCard',
      commandVersion: 1,
      payload: { placementId: 'p' },
      inverse: { commandType: 'UnplaceCard', commandVersion: 1, payload: {} },
      canvasId: 'board-1',
    })
    await h.stack.undo()
    expect(h.log).toEqual(['UnplaceCard'])
    await h.stack.redo()
    expect(h.log).toEqual(['UnplaceCard', 'PlaceAsCard'])
    // And it is undoable again (symmetry restored).
    expect(h.stack.canUndo()).toBe(true)
    await h.stack.undo()
    expect(h.log).toEqual(['UnplaceCard', 'PlaceAsCard', 'UnplaceCard'])
  })

  it('skips commands whose inverse is null (non-undoable by design)', () => {
    const h = harness(selfInverting)
    h.stack.record({
      commandType: 'SetCanvasCamera',
      commandVersion: 1,
      payload: {},
      inverse: null,
      canvasId: 'board-1',
    })
    expect(h.stack.canUndo()).toBe(false)
    expect(h.onChanged).not.toHaveBeenCalled()
  })

  it('drops the entry and toasts when an inverse is UNDO_STALE', async () => {
    const h = harness(selfInverting)
    h.fail('inv-Move')
    h.stack.record({
      commandType: 'Move',
      commandVersion: 1,
      payload: {},
      inverse: { commandType: 'inv-Move', commandVersion: 1, payload: {} },
      canvasId: 'board-1',
    })
    await h.stack.undo()
    expect(h.toasts).toEqual([UNDO_STALE_TOAST])
    // Entry dropped, no redo offered, stack still usable.
    expect(h.stack.canUndo()).toBe(false)
    expect(h.stack.canRedo()).toBe(false)
  })

  it('declines a cross-canvas entry with a board-naming toast, leaving it in place', async () => {
    const h = harness(selfInverting, { boardLabel: 'Harbor' })
    h.stack.record({
      commandType: 'Move',
      commandVersion: 1,
      payload: {},
      inverse: { commandType: 'inv-Move', commandVersion: 1, payload: {} },
      canvasId: 'board-2',
    })
    await h.stack.undo()
    expect(h.execute).not.toHaveBeenCalled()
    expect(h.toasts[0]).toContain('Harbor')
    // The entry survives so it can be undone from its own board.
    expect(h.stack.canUndo()).toBe(true)
    // Once the user navigates there, the undo goes through.
    h.setCanvas('board-2')
    await h.stack.undo()
    expect(h.log).toEqual(['inv-Move'])
  })

  it('names the direction in a cross-canvas decline: redo says "redo it" (AI-IMP-181 M-38)', async () => {
    const h = harness(selfInverting, { boardLabel: 'Harbor' })
    // Record on board-1, undo it here (moves to redo), then navigate away
    // so the redo target is now cross-canvas.
    h.stack.record({
      commandType: 'Move',
      commandVersion: 1,
      payload: {},
      inverse: { commandType: 'inv-Move', commandVersion: 1, payload: {} },
      canvasId: 'board-1',
    })
    await h.stack.undo()
    expect(h.stack.canRedo()).toBe(true)
    h.setCanvas('board-2')
    await h.stack.redo()
    // Declined from the wrong board — the verb is REDO, not undo.
    expect(h.stack.canRedo()).toBe(true) // entry left in place
    const declineToast = h.toasts[h.toasts.length - 1]!
    expect(declineToast).toContain('Harbor')
    expect(declineToast).toContain('to redo it')
    expect(declineToast).not.toContain('to undo it')
  })

  it('clears both stacks (project switch)', async () => {
    const h = harness(selfInverting)
    h.stack.record({
      commandType: 'Move',
      commandVersion: 1,
      payload: {},
      inverse: { commandType: 'inv-Move', commandVersion: 1, payload: {} },
      canvasId: 'board-1',
    })
    await h.stack.undo()
    expect(h.stack.canRedo()).toBe(true)
    h.stack.clear()
    expect(h.stack.canUndo()).toBe(false)
    expect(h.stack.canRedo()).toBe(false)
  })

  it('undoes a group as ONE entry, inverses in reverse order (AI-IMP-127)', async () => {
    // A frame create composite: CreateNode → SetAppearance → CreatePlacement.
    // The internal inverses (inv-*) don't self-invert (like
    // DeleteDraftNode/DeleteDraftPlacement), so redo re-issues the
    // forwards via the fallback — exactly the real create case.
    const inverseFor = (command: StackCommand): InverseCommand | null =>
      command.commandType.startsWith('inv-')
        ? null
        : { commandType: `inv-${command.commandType}`, commandVersion: 1, payload: {} }
    const h = harness(inverseFor)
    const cap = (type: string) => ({
      commandType: type,
      commandVersion: 1,
      payload: {},
      inverse: { commandType: `inv-${type}`, commandVersion: 1, payload: {} },
      canvasId: 'board-1',
    })
    h.stack.recordGroup([cap('CreateNode'), cap('SetAppearance'), cap('CreatePlacement')])
    expect(h.stack.undoDepth()).toBe(1)

    await h.stack.undo()
    // One undo, inverses run last-forward-first (LIFO within the group).
    expect(h.log).toEqual(['inv-CreatePlacement', 'inv-SetAppearance', 'inv-CreateNode'])
    expect(h.stack.canUndo()).toBe(false)
    expect(h.stack.canRedo()).toBe(true)

    await h.stack.redo()
    // Redo replays the forwards in ORIGINAL order, still one entry.
    expect(h.log.slice(3)).toEqual(['CreateNode', 'SetAppearance', 'CreatePlacement'])
    expect(h.stack.undoDepth()).toBe(1)
    expect(h.stack.redoDepth()).toBe(0)
  })

  it('offers a repair after a grouped undo fails behind a committed prefix', async () => {
    const inverseFor = (command: StackCommand): InverseCommand | null =>
      command.commandType.startsWith('inv-')
        ? null
        : { commandType: `inv-${command.commandType}`, commandVersion: 1, payload: {} }
    const h = harness(inverseFor)
    const cap = (type: string) => ({
      commandType: type,
      commandVersion: 1,
      payload: {},
      inverse: { commandType: `inv-${type}`, commandVersion: 1, payload: {} },
      canvasId: 'board-1',
    })
    h.stack.recordGroup([cap('A'), cap('B'), cap('C')])
    h.fail('inv-B')

    await h.stack.undo()

    expect(h.log).toEqual(['inv-C', 'inv-B'])
    expect(h.toasts).toEqual([PARTIAL_UNDO_TOAST])
    expect(h.stack.undoDepth()).toBe(0)
    expect(h.stack.redoDepth()).toBe(1)

    // Redo is now an explicit repair of the committed prefix. Once it
    // succeeds, the ORIGINAL three-member group returns to undo intact.
    h.unfail('inv-B')
    await h.stack.redo()
    expect(h.log).toEqual(['inv-C', 'inv-B', 'C'])
    expect(h.stack.undoDepth()).toBe(1)
    expect(h.stack.redoDepth()).toBe(0)

    await h.stack.undo()
    expect(h.log.slice(3)).toEqual(['inv-C', 'inv-B', 'inv-A'])
  })

  it('drops null-inverse members and records a one-member group like a single', async () => {
    const h = harness(selfInverting)
    h.stack.recordGroup([
      { commandType: 'A', commandVersion: 1, payload: {}, inverse: null, canvasId: 'board-1' },
      {
        commandType: 'B',
        commandVersion: 1,
        payload: {},
        inverse: { commandType: 'inv-B', commandVersion: 1, payload: {} },
        canvasId: 'board-1',
      },
    ])
    await h.stack.undo()
    expect(h.log).toEqual(['inv-B'])
  })

  it('serializes overlapping undo() calls: the second is dropped, no phantom, no redo wipe (AI-IMP-181)', async () => {
    // A gated executor: execute() blocks until the test releases it, so a
    // second undo() genuinely overlaps the first across the "IPC" await —
    // the exact window the old shared #applying boolean got misread in.
    let release!: () => void
    const gate = new Promise<void>((r) => (release = r))
    const log: string[] = []
    const applyingSamples: boolean[] = []
    const execute = vi.fn(async (command: StackCommand): Promise<CommandResult> => {
      log.push(command.commandType)
      await gate
      return { status: 'committed', commandId: 'x', revision: 1, affected: [], inverse: null }
    })
    const deps: UndoStackDeps = {
      execute,
      currentCanvasId: () => 'board-1',
      boardLabel: () => 'Some Board',
      toast: () => {},
      onChanged: vi.fn(),
    }
    const stack = new UndoStack(deps)
    const rec = (type: string) =>
      stack.record({
        commandType: type,
        commandVersion: 1,
        payload: {},
        inverse: { commandType: `inv-${type}`, commandVersion: 1, payload: {} },
        canvasId: 'board-1',
      })
    rec('A')
    rec('B')
    expect(stack.undoDepth()).toBe(2)

    // Fire two undos WITHOUT awaiting the first — the key-repeat overlap.
    const first = stack.undo()
    applyingSamples.push(stack.applying) // in flight: must be true
    const second = stack.undo() // re-entrant: dropped, no second execute
    applyingSamples.push(stack.applying) // still applying across the drop

    // Only ONE inverse has been dispatched despite two undo() calls.
    expect(execute).toHaveBeenCalledTimes(1)
    expect(log).toEqual(['inv-B'])

    release()
    await Promise.all([first, second])

    // The overlap collapsed to a single step: exactly one entry moved to
    // redo, none re-captured, redo intact (undoDepth + redoDepth stayed 2).
    expect(execute).toHaveBeenCalledTimes(1)
    expect(stack.undoDepth()).toBe(1)
    expect(stack.redoDepth()).toBe(1)
    // #applying was continuously true through the whole in-flight window —
    // the capture gate (undo-store) never opened for the re-applied commit.
    expect(applyingSamples).toEqual([true, true])
    expect(stack.applying).toBe(false)

    // And the next physical press still undoes the remaining entry.
    await stack.undo()
    expect(log).toEqual(['inv-B', 'inv-A'])
    expect(stack.undoDepth()).toBe(0)
    expect(stack.redoDepth()).toBe(2)
  })

  it('recording a new command clears the redo stack (§10.2)', async () => {
    const h = harness(selfInverting)
    const rec = (type: string) =>
      h.stack.record({
        commandType: type,
        commandVersion: 1,
        payload: {},
        inverse: { commandType: `inv-${type}`, commandVersion: 1, payload: {} },
        canvasId: 'board-1',
      })
    rec('A')
    await h.stack.undo()
    expect(h.stack.canRedo()).toBe(true)
    rec('B')
    expect(h.stack.canRedo()).toBe(false)
  })
})
