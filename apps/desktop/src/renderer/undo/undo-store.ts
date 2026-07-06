import { uuidv7 } from '@ew/domain'
import { CommandGateway, onCommittedAnywhere } from '@ew/canvas-engine'
import { toast } from '../chrome/status'
import { UndoStack } from './undo-stack'

/**
 * Renderer singleton that wires the pure {@link UndoStack} to the app
 * (RFC-0001 §10.2, AI-IMP-114): capture, a gateway to re-run inverses,
 * the active-canvas fence, board names, and toasts. Mounted once from
 * App.svelte; the ☰ Undo/Redo rows and the Mod+Z driver read it.
 *
 * Capture spans EVERY gateway via `onCommittedAnywhere` because the
 * note pane runs its own (place-on-board §8.5 commits there), but only
 * a fixed allowlist of STRUCTURAL canvas commands enters the stack.
 * Note-body autosaves (UpdateNote — CodeMirror owns text history),
 * camera persistence (inverse:null anyway), and gallery envelopes
 * (hand-rolled, no gateway) are excluded by construction. The allowlist
 * is deliberately conservative for v1; §10.2's broader "all structural
 * commands" is a superset later commands opt into by name.
 */
const CAPTURED_COMMANDS = new Set<string>([
  'TransformContent', // move / resize / rotate / align / distribute
  'FlipPlacement', // §8.4 flip
  'ReorderContent', // z-order
  'CreateDecoration', // draw tools
  'DeleteContent', // §9.2 delete (batch = one entry)
  'CreatePlacement', // place a node
  'CreatePin', // §6.10 / §7.2 create-and-place materialization
  'PlaceAsCard', // §8.5 place-on-board
])

interface OutlineRow {
  canvasId: string
  noteTitle: string | null
}

let stack: UndoStack | null = null
const listeners = new Set<() => void>()

function notify(): void {
  for (const listener of listeners) listener()
}

/** Subscribe to depth changes (☰ rows). Fires immediately; returns unsub. */
export function onUndoChanged(listener: () => void): () => void {
  listeners.add(listener)
  listener()
  return () => listeners.delete(listener)
}

export function canUndo(): boolean {
  return stack?.canUndo() ?? false
}

export function canRedo(): boolean {
  return stack?.canRedo() ?? false
}

export function undo(): void {
  void stack?.undo()
}

export function redo(): void {
  void stack?.redo()
}

/** The board currently mounted by the canvas host (debug seam, §13.1). */
function activeCanvasId(): string {
  return window.__ewDebug?.canvasId() ?? ''
}

async function boardLabel(canvasId: string): Promise<string> {
  try {
    const response = await window.ew.project.query('getOutlineTree')
    if (response.ok) {
      const rows = response.result as OutlineRow[]
      const row = rows.find((r) => r.canvasId === canvasId)
      if (row?.noteTitle) return `“${row.noteTitle}”`
    }
  } catch {
    // Fall through to the generic phrasing.
  }
  return 'another board'
}

/**
 * Mount the undo stack. Returns a teardown. Async gateway setup runs in
 * the background so the mount line stays synchronous; capture and the
 * public API no-op until the gateway is ready.
 */
export function attachUndo(): () => void {
  let disposed = false
  let offCommitted: (() => void) | null = null
  let offChanged: (() => void) | null = null

  void (async () => {
    const response = await window.ew.project.query('getProject')
    if (!response.ok || disposed) return
    const project = response.result as { id: string; revision: number }
    // A dedicated gateway threads its OWN observed revision, exactly as
    // the note pane's does (project-port.ts): undoing re-runs an inverse
    // through the §10 pipeline with the optimistic check ON, so a stale
    // inverse returns a conflict/UNDO_STALE the stack turns into a toast.
    const gateway = new CommandGateway(
      { execute: (envelope) => window.ew.project.execute(envelope) },
      project.id,
      project.revision,
      uuidv7,
    )
    offChanged = window.ew.project.onChanged((event) => gateway.noteRevision(event.revision))

    stack = new UndoStack({
      execute: (command) =>
        gateway.execute(command.commandType, command.payload, {
          commandVersion: command.commandVersion,
        }),
      currentCanvasId: activeCanvasId,
      boardLabel,
      toast: (message) => void toast(message, { surface: 'undo' }),
      onChanged: notify,
    })

    offCommitted = onCommittedAnywhere((notice) => {
      // Ignore commits produced by the stack's own inverse/redo runs.
      if (!stack || stack.applying) return
      if (!CAPTURED_COMMANDS.has(notice.commandType)) return
      const payload = notice.payload as { canvasId?: unknown }
      const canvasId =
        typeof payload?.canvasId === 'string' && payload.canvasId.length > 0
          ? payload.canvasId
          : activeCanvasId()
      stack.record({
        commandType: notice.commandType,
        commandVersion: notice.commandVersion,
        payload: notice.payload,
        inverse: notice.result.inverse,
        canvasId,
      })
    })

    // e2e/debug seam, in the __ewNav/__ewDebug mold.
    window.__ewUndo = {
      undo: () => stack?.undo() ?? Promise.resolve(),
      redo: () => stack?.redo() ?? Promise.resolve(),
      canUndo,
      canRedo,
      undoDepth: () => stack?.undoDepth() ?? 0,
      redoDepth: () => stack?.redoDepth() ?? 0,
    }
    notify()
  })()

  return () => {
    disposed = true
    offCommitted?.()
    offChanged?.()
    stack?.clear()
    stack = null
    delete window.__ewUndo
    notify()
  }
}

declare global {
  interface Window {
    __ewUndo?: {
      undo: () => Promise<void>
      redo: () => Promise<void>
      canUndo: () => boolean
      canRedo: () => boolean
      undoDepth: () => number
      redoDepth: () => number
    }
  }
}
