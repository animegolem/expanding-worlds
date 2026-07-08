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

/** A committed result carrying a reciprocal inverse (so it is captured). */
function committed(revision: number): Extract<CommandResult, { status: 'committed' }> {
  return {
    status: 'committed',
    commandId: `cmd-${revision}`,
    revision,
    affected: [],
    inverse: { commandType: 'UpdateDecoration', commandVersion: 1, payload: {} },
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
    const execute = vi.fn(async (): Promise<CommandResult> => committed(++revision))
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
