import { uuidv7 } from '@ew/domain'
import {
  CommandGateway,
  onCommittedAnywhere,
  type CommandGroupToken,
} from '@ew/canvas-engine'
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
/** The undo class of a durable command (AI-IMP-233 / Sol CA-008). */
export type UndoClass = 'captured' | 'group-only' | 'exempt'

/** One row of the {@link UNDO_POLICY} matrix: the class plus the reason,
 * so the table itself documents WHY a command is (or is not) undoable. */
export interface UndoPolicyEntry {
  class: UndoClass
  why: string
}

/**
 * The command→undo policy MATRIX (RFC §10.2, AI-IMP-233, Sol CA-008).
 *
 * The owner's ratified rule (AI-IMP-182, 2026-07-08): every DELIBERATE
 * verb joins Mod+Z EXCEPT node-trash. This literal table is the ONE place
 * that rule is encoded. The coordinator below consults it; `undo-policy.
 * test.ts` diffs it against the authoritative persistence command registry
 * so a command can never ship unclassified (a registry entry with no row =
 * red) and the table can never keep a stale row (a matrix key that is not a
 * real command = red). Every future command must declare its class here.
 *
 * Three classes:
 *  - 'captured'   — a deliberate standalone verb: captured by BARE TYPE
 *                   from any gateway (one commit = one undo entry), and
 *                   folded into a surrounding runAsUndoGroup when one
 *                   gesture emits several. Requires a real (non-null)
 *                   inverse; a null-inverse commit is skipped by `record`.
 *  - 'group-only' — captured ONLY inside a runAsUndoGroup window, never by
 *                   bare type: polysemous types (UpdateDecoration also
 *                   carries live Dock drags), §4.9 frame primitives, or a
 *                   verb whose UI gesture already wraps its commit so a
 *                   programmatic/import emission of the same type stays out
 *                   of undo (AI-IMP-154/182).
 *  - 'exempt'     — never enters Mod+Z; `why` names the carve-out
 *                   (node-trash · trash-is-recovery-home · editor-owned ·
 *                   internal-inverse · destructive-purge · not-a-renderer-
 *                   verb · deferred).
 */
export const UNDO_POLICY: Readonly<Record<string, UndoPolicyEntry>> = {
  // ── captured: deliberate standalone verbs (bare-type) ──────────────
  TransformContent: { class: 'captured', why: 'move / resize / rotate / align / distribute (§6.9)' },
  FlipPlacement: { class: 'captured', why: '§8.4 flip' },
  ReorderContent: { class: 'captured', why: 'z-order (§6.8)' },
  CreateDecoration: { class: 'captured', why: 'draw tools' },
  DeleteContent: { class: 'captured', why: '§9.2 delete (batch = one entry)' },
  CreatePlacement: { class: 'captured', why: 'place a node' },
  CreatePin: { class: 'captured', why: '§6.10 / §7.2 create-and-place materialization' },
  PlaceAsCard: { class: 'captured', why: '§8.5 place-on-board' },
  // §8.4 rev 0.55: "every verb = one undoable command" (AI-IMP-136).
  SetPlacementLock: { class: 'captured', why: '§8.4 menu verb; tested inverse' },
  SetPlacementLabelVisibility: { class: 'captured', why: '§8.4 menu verb; tested inverse' },
  SetPlacementCaption: { class: 'captured', why: '§4.5 caption edit; tested inverse' },
  SetCanvasBackground: { class: 'captured', why: '§8.4 menu verb; tested inverse' },
  SetCanvasBackgroundColor: { class: 'captured', why: '§8.4 menu verb; tested inverse' },
  // AI-IMP-233 / CA-008: the deliberate verbs the ruling required but that
  // were still uncaptured. Their UI sites (note/menus/decorations) are not
  // wrapped in a group, so they are captured by BARE TYPE — safe because
  // none is emitted programmatically in a burst (import emits none of
  // them). Each has a tested inverse; relink-create's compound inverse is
  // fixed in persistence/handlers/notes.ts (this ticket).
  AttachNoteToNode: { class: 'captured', why: 'CA-008 verb; inverse DetachNoteFromNode' },
  CreateNoteAndAttach: { class: 'captured', why: 'CA-008 verb; inverse removes note + attachment' },
  MakeNoteIndependent: { class: 'captured', why: 'CA-008 verb; inverse UnmakeNoteIndependent' },
  RelinkBrokenLinks: { class: 'captured', why: 'CA-008 verb; compound inverse (BreakNoteLinks + safe created-note removal)' },
  GroupDecorations: { class: 'captured', why: 'CA-008 verb; inverse UngroupDecorations' },
  UngroupDecorations: { class: 'captured', why: 'CA-008 verb; inverse GroupDecorations' },
  CreateCanvas: { class: 'captured', why: 'CA-008 verb; open-as-board / new board; inverse DeleteDraftCanvas' },

  // ── group-only: captured only inside a runAsUndoGroup window ────────
  // §4.9 frame primitives — only ever issued inside a group (AI-IMP-127).
  CreateNode: { class: 'group-only', why: '§4.9 frame/create composite member' },
  SetNodeAppearance: { class: 'group-only', why: '§4.9 create composite member' },
  CaptureInFrame: { class: 'group-only', why: '§4.9 frame membership; group member' },
  ReleaseFromFrame: { class: 'group-only', why: '§4.9 frame membership; group member' },
  // Polysemous: verbs (Lock/Hide/Show) AND live Dock drags / text commits
  // all commit UpdateDecoration; bare-type capture would spam entries per
  // drag, so capture at the gesture window only (AI-IMP-154).
  UpdateDecoration: { class: 'group-only', why: 'polysemous: §8.4 verbs share the type with live Dock drags (AI-IMP-154)' },
  // AI-IMP-182 breadth: captured at their gesture (the UI site wraps the
  // commit in runAsUndoGroup) so a programmatic/import emission stays out
  // and a create-and-assign gesture folds into one entry.
  RenameNote: { class: 'group-only', why: 'AI-IMP-182 verb; gesture-wrapped; inverse RenameNote' },
  AssignTagToNode: { class: 'group-only', why: 'AI-IMP-182 verb; inverse UnassignTagFromNode' },
  CreateTag: { class: 'group-only', why: 'AI-IMP-182 verb; inverse DeleteDraftTag' },
  RenameTag: { class: 'group-only', why: 'AI-IMP-182 verb; inverse RenameTag' },
  DeleteTag: {
    class: 'group-only',
    why: 'AI-IMP-271 delete-scope gesture member; inverse RestoreTag',
  },
  SuppressTagSync: {
    class: 'group-only',
    why: 'AI-IMP-271 delete-scope gesture member; inverse LiftTagSuppression',
  },
  LiftTagSuppression: {
    class: 'group-only',
    why: 'AI-IMP-271 suppression inverse / future gesture; inverse SuppressTagSync',
  },
  DetachNoteFromNode: { class: 'group-only', why: 'AI-IMP-182 verb; inverse AttachNoteToNode' },
  CreateBookmark: { class: 'group-only', why: 'AI-IMP-182 verb; inverse RemoveBookmark' },
  RemoveBookmark: { class: 'group-only', why: 'AI-IMP-182 verb; inverse CreateBookmark' },
  ReorderBookmark: { class: 'group-only', why: 'AI-IMP-182 verb; inverse ReorderBookmark' },

  // ── exempt: never enters Mod+Z ─────────────────────────────────────
  // Editor / persistence surfaces own their own history.
  UpdateNote: { class: 'exempt', why: 'editor-owned: CodeMirror owns note-body text history (§10.2 boundary)' },
  SetCanvasCamera: { class: 'exempt', why: 'camera persistence: null inverse, not a structural edit' },
  CommitAssetImport: { class: 'exempt', why: 'asset-import pipeline: programmatic materialization, not a verb' },
  // Lifecycle gestures are captured only in their explicit user group;
  // programmatic/system lifecycle writes stay outside the ledger.
  TrashNode: { class: 'group-only', why: '§9.7 bulk/solo user trash gesture; inverse RestoreRecord' },
  TrashNote: { class: 'group-only', why: '§9.7 user trash gesture; inverse RestoreRecord' },
  TrashCanvas: { class: 'group-only', why: '§9.7 user trash gesture; inverse RestoreRecord' },
  DetachAndTrashNote: { class: 'exempt', why: 'trash-is-recovery-home: sends a note to the Trash' },
  // Destructive/irreversible by design.
  PurgeRecord: { class: 'exempt', why: 'destructive-purge: permanent removal by design (invariant)' },
  PurgeDraftNote: { class: 'exempt', why: 'draft cleanup: removes an abandoned draft, not a durable verb' },
  // Internal inverses / draft rollback — only ever issued AS an inverse or
  // an internal composite step, never as a standalone deliberate verb.
  BreakNoteLinks: { class: 'exempt', why: 'internal-inverse of RelinkBrokenLinks (undo path only)' },
  DeleteDraftNode: { class: 'exempt', why: 'internal-inverse: CreateNode draft rollback' },
  DeleteDraftPlacement: { class: 'exempt', why: 'internal-inverse: CreatePlacement draft rollback' },
  DeleteDraftPin: { class: 'exempt', why: 'internal-inverse: CreatePin draft rollback' },
  DeleteDraftCanvas: { class: 'exempt', why: 'internal-inverse: CreateCanvas draft rollback' },
  DeleteDraftTag: { class: 'exempt', why: 'internal-inverse: CreateTag draft rollback' },
  UnplaceCard: { class: 'exempt', why: 'internal-inverse of PlaceAsCard' },
  UnmakeNoteIndependent: { class: 'exempt', why: 'internal-inverse of MakeNoteIndependent' },
  UnmergeTag: { class: 'exempt', why: 'internal-inverse of MergeTag' },
  UnassignTagFromNode: { class: 'exempt', why: 'internal-inverse of AssignTagToNode' },
  RestoreContent: { class: 'exempt', why: 'internal-inverse: DeleteContent undo path' },
  RestorePlacement: { class: 'exempt', why: 'internal-inverse: placement delete undo path' },
  RestoreRecord: { class: 'captured', why: '§9.7 user restore; inverse re-trashes the record' },
  RestoreTag: { class: 'exempt', why: 'internal-inverse: tag delete undo path' },
  RestoreFrameMembership: { class: 'exempt', why: 'internal-inverse: frame release/capture undo path' },
  // Registered but not issued from the renderer as a deliberate gesture
  // today (internal / lifecycle / superseded paths). If any becomes a UI
  // verb it must move to 'captured'/'group-only' — the diff test forces
  // the author to revisit this row.
  MovePlacement: { class: 'exempt', why: 'not-a-renderer-verb: board moves go through TransformContent' },
  DeletePlacement: { class: 'exempt', why: 'not-a-renderer-verb: deletion goes through DeleteContent' },
  DeleteDecoration: { class: 'exempt', why: 'not-a-renderer-verb: deletion goes through DeleteContent' },
  MergeTag: { class: 'exempt', why: 'deferred: no renderer gesture yet (flagged for owner ratification)' },
  SetTagAppearance: { class: 'exempt', why: 'deferred: no renderer gesture yet (flagged for owner ratification)' },
  SetTrashRetention: { class: 'exempt', why: 'settings verb: changed/reverted via Settings, not Mod+Z' },
  // CreateNote (loose-note creation, NotePanel) is a deliberate verb, but
  // capturing it shares relink-create's created-note-residue hazard (undo
  // would delete a note the user may have started editing). Capture is
  // DEFERRED pending owner ratification of the safe-removal rule (CA-008).
  CreateNote: { class: 'exempt', why: 'deferred: deliberate loose-note create; created-note-residue hazard, owner to ratify' },
}

/**
 * Commands captured standalone by bare type, derived from the matrix.
 * The coordinator records one undo entry per such commit (or folds it into
 * an open group).
 */
const CAPTURED_COMMANDS = new Set<string>(
  Object.entries(UNDO_POLICY)
    .filter(([, entry]) => entry.class === 'captured')
    .map(([type]) => type),
)

/**
 * Commands captured ONLY inside a runAsUndoGroup window (never by bare
 * type), derived from the matrix. A group collects both these and the
 * standing `captured` allowlist, provided the commit is invertible; this
 * keeps an interleaved autosave from being swept in.
 */
const GROUP_ONLY_COMMANDS = new Set<string>(
  Object.entries(UNDO_POLICY)
    .filter(([, entry]) => entry.class === 'group-only')
    .map(([type]) => type),
)

interface PendingGroup {
  commands: CapturedCommand[]
  order: number
  afterUndo?: () => Promise<void> | void
}

/** Explicit gesture identity replaces the old temporal global window. */
const pendingGroups = new Map<CommandGroupToken, PendingGroup>()

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
 * changes its membership — one Mod+Z returns both. A genuinely nested
 * composition explicitly reuses the outer token; temporal overlap mints a
 * different token. The gateway serializes executes per instance, so commits
 * from one callback arrive in issue order.
 */
export interface UndoGroupOptions {
  /** Reuse an owning gesture's token for a genuinely nested composition. */
  token?: CommandGroupToken
  /** Present-progress noun used when Undo reaches a still-open newest group. */
  operation?: string
  /** Optional renderer receipt applied after this group's undo succeeds. */
  afterUndo?: () => Promise<void> | void
}

export async function runAsUndoGroup<T>(
  fn: (token: CommandGroupToken) => Promise<T>,
  options: UndoGroupOptions = {},
): Promise<T> {
  if (options.token !== undefined) {
    if (!pendingGroups.has(options.token)) throw new Error('undo group token is not active')
    return fn(options.token)
  }
  const token = Symbol('undo-group')
  const order = stack?.reserveGroup(options.operation ?? 'working') ?? 0
  const group: PendingGroup = {
    commands: [],
    order,
    ...(options.afterUndo === undefined ? {} : { afterUndo: options.afterUndo }),
  }
  pendingGroups.set(token, group)
  try {
    return await fn(token)
  } finally {
    pendingGroups.delete(token)
    stack?.releaseGroup(order)
    // Every member already invalidated redo at COMMIT time. Finalization may
    // happen much later; clearing redo here would make completion itself look
    // like a new durable command.
    if (group.commands.length === 1) {
      stack?.record(group.commands[0]!, order, false, group.afterUndo)
    } else if (group.commands.length > 1) {
      stack?.recordGroup(group.commands, order, false, group.afterUndo)
    }
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
      // §10.2 universal redo invalidation (AI-IMP-230 / Sol CA-005): a
      // new durable, non-undo/non-redo commit ALWAYS clears redo, decided
      // here — before capture — so it covers uncaptured commits (note
      // autosave, project verbs), null-inverse commits, and commits that
      // land inside a group but are never recorded. Capture (below) then
      // decides only whether this commit ALSO becomes an undo entry.
      stack.invalidateRedo()
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
      const pendingGroup = notice.groupToken
        ? pendingGroups.get(notice.groupToken)
        : undefined
      if (pendingGroup) {
        // Inside a group window: collect the standing allowlist plus the
        // group-only frame commands, provided the commit is invertible.
        if (
          notice.result.inverse !== null &&
          (CAPTURED_COMMANDS.has(notice.commandType) ||
            GROUP_ONLY_COMMANDS.has(notice.commandType))
        ) {
          pendingGroup.commands.push(captured)
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
