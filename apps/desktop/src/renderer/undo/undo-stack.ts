import type { CommandResult, InverseCommand } from '@ew/commands'

/**
 * In-renderer structural undo/redo (RFC-0001 §10.2, AI-IMP-114).
 *
 * The stack is per-project and session-only (§10.2: held in memory,
 * never survives restart; Trash owns cross-session recovery). It is
 * driven entirely by INVERSE COMMANDS re-executed through the same
 * pipeline (invariant 24) — it never pops raw database state.
 *
 * Model. Each captured forward command F carries an inverse I. We push
 * an UNDO action `{ command: I, fallback: F }`: undo executes I. After
 * executing an action A, the OPPOSITE action is derived uniformly:
 *   opposite.command  = result.inverse ?? A.fallback
 *   opposite.fallback = A.command
 * `result.inverse` is the committed inverse's own inverse; when it is
 * null (internal-composite inverses such as UnplaceCard/DeleteDraftPin
 * do not self-invert), redo re-issues the ORIGINAL forward command via
 * the fallback. This one rule makes undo→redo and redo→undo symmetric.
 *
 * Failure discipline (§10.2). Any non-committed inverse result
 * (UNDO_STALE, conflict, domain error) drops the entry and toasts
 * "That change can no longer be undone" — the stack never crashes.
 *
 * V1 same-canvas fence. Entries record the canvas they acted on.
 * Undoing/redoing an entry that belongs to another board is declined
 * with a toast naming that board and the entry is LEFT in place (so it
 * is still undoable once the user is on that canvas). Navigation-on-undo
 * (§10.2's navigate-and-center behavior) is deliberately deferred.
 *
 * This class is pure — all IO (executing commands, reading the active
 * canvas, board names, toasts) is injected — so it unit-tests without a
 * DOM or a live project. The renderer wiring lives in undo-store.ts.
 */

export interface StackCommand {
  commandType: string
  commandVersion: number
  payload: unknown
}

export interface StackAction {
  /** Command executed to perform this action (an undo or a redo). */
  command: StackCommand
  /** Re-issued as the opposite action when `command`'s result has a
   * null inverse (the opposite is re-applying the original forward). */
  fallback: StackCommand
  /** Board the originating command acted on (v1 same-canvas fence). */
  canvasId: string
}

/** One committed forward command offered to the stack for capture. */
export interface CapturedCommand {
  commandType: string
  commandVersion: number
  payload: unknown
  inverse: InverseCommand | null
  canvasId: string
}

export interface UndoStackDeps {
  /** Execute a command through a revision-threading gateway; a
   * non-committed result drops the entry (§10.2). */
  execute: (command: StackCommand) => Promise<CommandResult>
  /** The board currently in view — the fence compares against it. */
  currentCanvasId: () => string
  /** Human name for a board, for the cross-canvas skip toast. */
  boardLabel: (canvasId: string) => Promise<string> | string
  toast: (message: string) => void
  /** Fires after any depth change so chrome (☰ rows) re-reads. */
  onChanged: () => void
}

export const UNDO_STALE_TOAST = 'That change can no longer be undone'

export class UndoStack {
  #deps: UndoStackDeps
  #undo: StackAction[] = []
  #redo: StackAction[] = []
  /** True while an inverse/forward is being re-executed: the resulting
   * commit must NOT be captured as a fresh forward command. */
  #applying = false

  constructor(deps: UndoStackDeps) {
    this.#deps = deps
  }

  get applying(): boolean {
    return this.#applying
  }

  undoDepth(): number {
    return this.#undo.length
  }

  redoDepth(): number {
    return this.#redo.length
  }

  canUndo(): boolean {
    return this.#undo.length > 0
  }

  canRedo(): boolean {
    return this.#redo.length > 0
  }

  /**
   * Record one committed forward command. Commands with a null inverse
   * are non-undoable by design (invariant 31) and skipped. A new
   * durable command clears the redo stack (§10.2).
   */
  record(command: CapturedCommand): void {
    if (command.inverse === null) return
    this.#undo.push({
      command: {
        commandType: command.inverse.commandType,
        commandVersion: command.inverse.commandVersion,
        payload: command.inverse.payload,
      },
      fallback: {
        commandType: command.commandType,
        commandVersion: command.commandVersion,
        payload: command.payload,
      },
      canvasId: command.canvasId,
    })
    this.#redo = []
    this.#deps.onChanged()
  }

  async undo(): Promise<void> {
    await this.#step(this.#undo, this.#redo)
  }

  async redo(): Promise<void> {
    await this.#step(this.#redo, this.#undo)
  }

  /** Drop everything — project switch (§10.2) or teardown. */
  clear(): void {
    const had = this.#undo.length > 0 || this.#redo.length > 0
    this.#undo = []
    this.#redo = []
    if (had) this.#deps.onChanged()
  }

  async #step(from: StackAction[], to: StackAction[]): Promise<void> {
    const action = from[from.length - 1]
    if (!action) return

    // V1 same-canvas fence: decline cross-board entries with a toast
    // naming the board; leave the entry so it is undoable once the user
    // is on that canvas (navigation-on-undo is deferred).
    if (action.canvasId !== this.#deps.currentCanvasId()) {
      const name = await this.#deps.boardLabel(action.canvasId)
      this.#deps.toast(`That change was made on ${name} — open that board to undo it`)
      return
    }

    from.pop()
    let result: CommandResult
    this.#applying = true
    try {
      result = await this.#deps.execute(action.command)
    } catch {
      // A thrown execute (IPC death) is treated like any failed inverse:
      // the entry is already dropped; tell the user and carry on.
      this.#applying = false
      this.#deps.toast(UNDO_STALE_TOAST)
      this.#deps.onChanged()
      return
    }
    this.#applying = false

    if (result.status !== 'committed') {
      this.#deps.toast(UNDO_STALE_TOAST)
      this.#deps.onChanged()
      return
    }

    to.push({
      command:
        result.inverse === null
          ? action.fallback
          : {
              commandType: result.inverse.commandType,
              commandVersion: result.inverse.commandVersion,
              payload: result.inverse.payload,
            },
      fallback: action.command,
      canvasId: action.canvasId,
    })
    this.#deps.onChanged()
  }
}
