import { describe, expect, it, vi } from 'vitest'
import type { CommandResult, InverseCommand } from '@ew/commands'
import { UndoStack, UNDO_STALE_TOAST, type StackCommand, type UndoStackDeps } from './undo-stack'

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
