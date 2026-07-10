import { uuidv7 } from '@ew/domain'
import { CommandGateway, onCommittedAnywhere } from '@ew/canvas-engine'
import { toast } from '../chrome/status'
import { UndoStack, type CapturedCommand } from './undo-stack'

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
  // §8.4 rev 0.55: "every verb = one undoable command" — the menu
  // grammar obligates these four the moment they became menu verbs
  // (AI-IMP-136). All four handlers emit tested inverses.
  'SetPlacementLock',
  'SetPlacementLabelVisibility',
  'SetCanvasBackground',
  'SetCanvasBackgroundColor',
])

/**
 * Commands captured ONLY inside a runAsUndoGroup window — never
 * standalone-undoable, so they stay out of CAPTURED_COMMANDS, but ARE
 * captured while a group is open. Two reasons a command lands here:
 *
 *  - §4.9 frame commands (AI-IMP-127): only ever issued inside a group,
 *    so the whole frame edit (create composite, or move + capture/
 *    release) collapses to one Mod+Z.
 *  - `UpdateDecoration` is POLYSEMOUS (AI-IMP-154): the §8.4 discrete
 *    verbs (Lock/Unlock, Hide, Show) commit it, but so do live Dock
 *    style drags and text commits. Allowlisting the bare type would put
 *    one undo entry per intermediate style drag on the stack. Capturing
 *    at the GESTURE instead (the verb handlers wrap their commit in
 *    runAsUndoGroup — a group of one) enters exactly one entry per verb
 *    and leaves the ungrouped Dock/text-entry traffic untouched.
 *
 * Restricting the group to this set (plus the standing allowlist) keeps
 * an interleaved autosave from being swept in.
 */
const GROUP_ONLY_COMMANDS = new Set<string>([
  'CreateNode',
  'SetNodeAppearance',
  // AI-IMP-239 (§8.4 New board): the create-board composition wraps
  // CreateNode + CreateNoteAndAttach + CreateCanvas + CreatePlacement in
  // one runAsUndoGroup so a single Mod+Z reverses the whole act (the
  // placement is issued LAST, so the group fences to the ORIGIN board it
  // lives on). Both commands below are captured ONLY inside a group —
  // their tested inverses are DeleteDraftCanvas and DetachAndTrashNote —
  // so the ungrouped make-canvas charm, on-demand open-as-board, and the
  // "Attach New Note…" prompt (none wrapped in a group) stay exactly as
  // they were; only a deliberate grouped composition opts them in by name
  // (the §10.2 "structural commands opt in by name" extension the header
  // notes).
  'CreateCanvas',
  'CreateNoteAndAttach',
  'CaptureInFrame',
  'ReleaseFromFrame',
  'UpdateDecoration',
  // AI-IMP-182 breadth (owner ruling 2026-07-08: every deliberate verb
  // joins Mod+Z EXCEPT node-trash). Each is captured ONLY at its gesture
  // (the UI site wraps the commit in runAsUndoGroup), never by bare type,
  // so programmatic/import commits of the same command stay out of undo
  // and a create-and-assign gesture (CreateTag + AssignTagToNode) folds
  // into one entry. TrashNode/purge are deliberately ABSENT — the Trash
  // is a trashed node's recovery home. Every command below has a tested
  // inverse (RenameNote↔RenameNote, AssignTagToNode↔UnassignTagFromNode,
  // CreateTag↔DeleteDraftTag, RenameTag↔RenameTag, DetachNoteFromNode↔
  // AttachNoteToNode, Create/RemoveBookmark reciprocal, ReorderBookmark↔
  // ReorderBookmark).
  'RenameNote',
  'AssignTagToNode',
  'CreateTag',
  'RenameTag',
  'DetachNoteFromNode',
  'CreateBookmark',
  'RemoveBookmark',
  'ReorderBookmark',
])

/** Commits accumulate here while a group window is open (see runAsUndoGroup). */
let pendingGroup: CapturedCommand[] | null = null

/** The slice of getOutlineTree's rows boardLabel reads — `label` is
 * the projection's quick-open-convention name (title ?? short code),
 * never null (AI-IMP-172: `noteTitle` was a cast-hidden field that
 * never existed, so every decline said "another board"). */
interface OutlineRow {
  canvasId: string
  label: string
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

/**
 * Run `fn` (which issues several gateway commands) so every captured
 * commit it produces lands as ONE undo entry (AI-IMP-127). Used for a
 * §4.9 frame create composite and for a drag that moves an item AND
 * changes its membership — one Mod+Z returns both. Nested calls run
 * inline (the outer window owns the grouping). The gateway serializes
 * executes, so commits from `fn` arrive in order within the window.
 */
export async function runAsUndoGroup<T>(fn: () => Promise<T>): Promise<T> {
  if (pendingGroup) {
    return fn()
  }
  const group: CapturedCommand[] = []
  pendingGroup = group
  try {
    return await fn()
  } finally {
    pendingGroup = null
    if (group.length === 1) stack?.record(group[0]!)
    else if (group.length > 1) stack?.recordGroup(group)
  }
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
      if (row?.label) return `“${row.label}”`
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
      const payload = notice.payload as { canvasId?: unknown }
      const canvasId =
        typeof payload?.canvasId === 'string' && payload.canvasId.length > 0
          ? payload.canvasId
          : activeCanvasId()
      const captured: CapturedCommand = {
        commandType: notice.commandType,
        commandVersion: notice.commandVersion,
        payload: notice.payload,
        inverse: notice.result.inverse,
        canvasId,
      }
      if (pendingGroup) {
        // Inside a group window: collect the standing allowlist plus the
        // group-only frame commands, provided the commit is invertible.
        if (
          notice.result.inverse !== null &&
          (CAPTURED_COMMANDS.has(notice.commandType) ||
            GROUP_ONLY_COMMANDS.has(notice.commandType))
        ) {
          pendingGroup.push(captured)
        }
        return
      }
      if (!CAPTURED_COMMANDS.has(notice.commandType)) return
      stack.record(captured)
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
