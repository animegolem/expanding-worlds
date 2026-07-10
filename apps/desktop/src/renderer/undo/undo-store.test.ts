import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CommandGateway, type CommittedNotice } from '@ew/canvas-engine'
import type { CommandResult } from '@ew/commands'
import { attachUndo, runAsUndoGroup } from './undo-store'

/**
 * AI-IMP-154: the capture seam must enter the §8.4 decoration VERBS
 * (Lock/Unlock, Hide, Show — all `UpdateDecoration`) into Mod+Z as one
 * entry per gesture, while leaving the SAME command type uncaptured
 * when it arrives from a Dock style drag or a text commit. The seam
 * discriminates by GESTURE (a runAsUndoGroup window), never by the bare
 * command type, so a style-drag-shaped UpdateDecoration lands zero undo
 * entries and a verb-shaped one lands exactly one.
 */

/** Commands the persistence layer commits with a NULL inverse (not
 * undoable by design): note-body autosave (CodeMirror owns text history)
 * and camera persistence. The mock mirrors that so the CA-005 tests
 * exercise the real null-inverse path (AI-IMP-230). */
const NULL_INVERSE_COMMANDS = new Set(['UpdateNote', 'SetCanvasCamera'])

/** A committed result; carries a reciprocal inverse unless the command
 * type is one persistence commits without one. */
function committed(
  revision: number,
  commandType = 'UpdateDecoration',
): Extract<CommandResult, { status: 'committed' }> {
  return {
    status: 'committed',
    commandId: `cmd-${revision}`,
    revision,
    affected: [],
    inverse: NULL_INVERSE_COMMANDS.has(commandType)
      ? null
      : { commandType: 'UpdateDecoration', commandVersion: 1, payload: {} },
  }
}

describe('undo-store capture seam (AI-IMP-154)', () => {
  let teardown: (() => void) | null = null
  let revision = 0
  let emitGateway: CommandGateway

  beforeEach(async () => {
    revision = 0
    // A mock Project API: getProject bootstraps the stack's gateway,
    // execute commits with a rising revision, onChanged is inert.
    const execute = vi.fn(
      async (envelope: { commandType: string }): Promise<CommandResult> =>
        committed(++revision, envelope.commandType),
    )
    vi.stubGlobal('window', {
      ew: {
        project: {
          query: vi.fn(async (name: string) =>
            name === 'getProject'
              ? { ok: true, result: { id: 'proj', revision: 0 } }
              : { ok: false },
          ),
          execute,
          onChanged: vi.fn(() => () => {}),
        },
      },
      __ewDebug: { canvasId: () => 'canvas-1' },
    })

    teardown = attachUndo()
    // attachUndo's gateway setup is async (awaits getProject); poll until
    // the debug seam appears so capture is live before we emit notices.
    for (let i = 0; i < 50 && !window.__ewUndo; i++) {
      await Promise.resolve()
    }
    expect(window.__ewUndo).toBeDefined()

    // A SEPARATE gateway stands in for any UI surface (the Dock, the
    // decoration verb handlers): its commits broadcast to onCommittedAnywhere.
    emitGateway = new CommandGateway(
      { execute: (envelope) => window.ew.project.execute(envelope) },
      'proj',
      0,
      () => `id-${revision}`,
    )
  })

  afterEach(() => {
    teardown?.()
    teardown = null
    vi.unstubAllGlobals()
  })

  it('a bare (style-drag-shaped) UpdateDecoration adds NO undo entry', async () => {
    // A style patch as the Dock emits it (raw hex color literals are
    // confined to theme.css by theme.test.ts, so width stands in).
    await emitGateway.execute('UpdateDecoration', {
      decorationId: 'd1',
      set: { strokeWidth: 3.5 },
    })
    expect(window.__ewUndo!.undoDepth()).toBe(0)
  })

  it('a gesture-captured UpdateDecoration verb adds exactly one entry', async () => {
    await runAsUndoGroup(async () => {
      await emitGateway.execute('UpdateDecoration', { decorationId: 'd1', set: { locked: true } })
    })
    expect(window.__ewUndo!.undoDepth()).toBe(1)
  })

  it('a Lock-all gesture (placement + decoration) collapses to one entry', async () => {
    await runAsUndoGroup(async () => {
      await emitGateway.execute('SetPlacementLock', { placementId: 'p1', locked: true })
      await emitGateway.execute('UpdateDecoration', { decorationId: 'd1', set: { locked: true } })
    })
    expect(window.__ewUndo!.undoDepth()).toBe(1)
  })

  it('interleaved bare UpdateDecorations never accumulate entries', async () => {
    // Simulate a live Dock drag: many intermediate style commits.
    for (let i = 0; i < 5; i++) {
      await emitGateway.execute('UpdateDecoration', { decorationId: 'd1', set: { strokeWidth: i } })
    }
    expect(window.__ewUndo!.undoDepth()).toBe(0)
  })

  it('the notice type carried by the group is UpdateDecoration (sanity)', async () => {
    const seen: CommittedNotice[] = []
    const off = (
      await import('@ew/canvas-engine')
    ).onCommittedAnywhere((n) => seen.push(n))
    await runAsUndoGroup(async () => {
      await emitGateway.execute('UpdateDecoration', { decorationId: 'd1', set: { hidden: true } })
    })
    off()
    expect(seen.map((n) => n.commandType)).toContain('UpdateDecoration')
    expect(window.__ewUndo!.undoDepth()).toBe(1)
  })

  // AI-IMP-182 breadth (owner ruling: every deliberate verb joins Mod+Z
  // EXCEPT node-trash). Each verb is GROUP_ONLY — captured at its gesture
  // window as exactly one entry, never by bare type. One case per capture
  // class asserts the allowlist membership through the same seam the UI
  // sites drive.
  const CAPTURED_VERBS: ReadonlyArray<{ verb: string; payload: unknown }> = [
    { verb: 'RenameNote', payload: { noteId: 'n1', title: 'x' } },
    { verb: 'AssignTagToNode', payload: { tagId: 't1', nodeId: 'n1' } },
    { verb: 'RenameTag', payload: { tagId: 't1', name: 'x' } },
    { verb: 'DetachNoteFromNode', payload: { nodeId: 'n1' } },
    { verb: 'CreateBookmark', payload: { bookmarkId: 'b1' } },
    { verb: 'RemoveBookmark', payload: { bookmarkId: 'b1' } },
    { verb: 'ReorderBookmark', payload: { bookmarkId: 'b1' } },
  ]
  for (const { verb, payload } of CAPTURED_VERBS) {
    it(`${verb} inside a gesture group records exactly one entry`, async () => {
      await runAsUndoGroup(async () => {
        await emitGateway.execute(verb, payload)
      })
      expect(window.__ewUndo!.undoDepth()).toBe(1)
    })
  }

  it('a create-and-assign tag gesture (CreateTag + AssignTagToNode) folds to one entry', async () => {
    await runAsUndoGroup(async () => {
      await emitGateway.execute('CreateTag', { tagId: 't1', name: 'harbor' })
      await emitGateway.execute('AssignTagToNode', { tagId: 't1', nodeId: 'n1' })
    })
    expect(window.__ewUndo!.undoDepth()).toBe(1)
  })

  // AI-IMP-230 / Sol CA-005: §10.2 requires ANY new durable command after
  // an undo to clear redo. The coordinator sees every gateway commit, but
  // used to forward only captured ones — an uncaptured or null-inverse
  // commit returned before the stack could invalidate redo, so redo stayed
  // stale and Mod+Shift+Z could replay onto a moved world.
  it('an UNCAPTURED commit after an undo clears redo (CA-005 probe)', async () => {
    // Capture a real structural command, undo it → redoDepth 1.
    await runAsUndoGroup(async () => {
      await emitGateway.execute('CreatePlacement', { placementId: 'p1', canvasId: 'canvas-1' })
    })
    expect(window.__ewUndo!.undoDepth()).toBe(1)
    await window.__ewUndo!.undo()
    expect(window.__ewUndo!.redoDepth()).toBe(1)

    // Now commit an UNCAPTURED durable command (note-body autosave). It is
    // not in the capture set, yet redo must drop to 0.
    await emitGateway.execute('UpdateNote', { noteId: 'n1', body: 'edited' })
    expect(window.__ewUndo!.redoDepth()).toBe(0)
    // The undo entry that produced the redo is gone too (it was consumed by
    // the undo); the uncaptured commit created no new undo entry.
    expect(window.__ewUndo!.undoDepth()).toBe(0)
  })

  it('a null-inverse commit after an undo still clears redo (CA-005)', async () => {
    await runAsUndoGroup(async () => {
      await emitGateway.execute('CreatePlacement', { placementId: 'p1', canvasId: 'canvas-1' })
    })
    await window.__ewUndo!.undo()
    expect(window.__ewUndo!.redoDepth()).toBe(1)
    // SetCanvasCamera commits with a null inverse (persistence, not
    // undoable) — the old `record` early-return skipped redo invalidation.
    await emitGateway.execute('SetCanvasCamera', { canvasId: 'canvas-1', x: 1, y: 2, zoom: 1 })
    expect(window.__ewUndo!.redoDepth()).toBe(0)
  })

  it("the stack's OWN undo/redo commits never invalidate redo (self-cycle)", async () => {
    // Two captured entries; undo BOTH. Each undo re-executes an inverse
    // through the gateway, whose commit broadcasts back through the same
    // seam. Those self-commits are gated by `applying`, so they must NOT
    // clear the redo the undos are building: redoDepth climbs to 2.
    await runAsUndoGroup(async () => {
      await emitGateway.execute('CreatePlacement', { placementId: 'p1', canvasId: 'canvas-1' })
    })
    await runAsUndoGroup(async () => {
      await emitGateway.execute('CreatePlacement', { placementId: 'p2', canvasId: 'canvas-1' })
    })
    expect(window.__ewUndo!.undoDepth()).toBe(2)
    await window.__ewUndo!.undo()
    await window.__ewUndo!.undo()
    expect(window.__ewUndo!.undoDepth()).toBe(0)
    expect(window.__ewUndo!.redoDepth()).toBe(2)
  })

  // AI-IMP-231 / Sol CA-006: overlapping asynchronous undo groups must NOT
  // merge — a note edit made while a multi-file import holds its group open
  // must be its OWN single undo entry. SKIPPED: the fix is BLOCKED. Robust
  // token-scoping needs either AsyncLocalStorage (unavailable in the
  // sandboxed renderer — sandbox:true / nodeIntegration:false) or explicit
  // per-command token threading through ~15 runAsUndoGroup call sites, all
  // in files this ticket may not touch (import-surfaces / note / menus /
  // tags / chrome). The current global `pendingGroup` MERGES these into one
  // entry. See AI-IMP-231 Issues Encountered for the full diagnosis. This
  // stays as the executable spec for whoever lands the mechanism.
  it.skip('overlapping groups stay separate: each Mod+Z reverses only its own (CA-006)', async () => {
    let releaseImport!: () => void
    const gate = new Promise<void>((r) => (releaseImport = r))
    // Import group: open, commit A, then PARK on an await (interactive gap).
    const importGroup = runAsUndoGroup(async () => {
      await emitGateway.execute('CreatePlacement', { placementId: 'imp', canvasId: 'canvas-1' })
      await gate
      await emitGateway.execute('CreatePlacement', { placementId: 'imp2', canvasId: 'canvas-1' })
    })
    // While import is parked, an unrelated note edit runs its OWN group.
    await runAsUndoGroup(async () => {
      await emitGateway.execute('RenameNote', { noteId: 'n1', title: 'x' })
    })
    releaseImport()
    await importGroup
    // Desired: TWO entries (import, note edit) — not one merged blob.
    expect(window.__ewUndo!.undoDepth()).toBe(2)
  })

  it('TrashNode stays OUT of Mod+Z — never captured, even inside a group', async () => {
    // The Trash is a trashed node's recovery home (owner ruling), so the
    // node-trash verb is absent from both allowlists.
    await emitGateway.execute('TrashNode', { nodeId: 'n1' })
    expect(window.__ewUndo!.undoDepth()).toBe(0)
    await runAsUndoGroup(async () => {
      await emitGateway.execute('TrashNode', { nodeId: 'n1' })
    })
    expect(window.__ewUndo!.undoDepth()).toBe(0)
  })
})
