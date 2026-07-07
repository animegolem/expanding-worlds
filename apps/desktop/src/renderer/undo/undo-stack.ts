import type { CommandResult, InverseCommand } from '@ew/commands'

/**
 * In-renderer structural undo/redo (RFC-0001 §10.2, AI-IMP-114).
 *
 * The stack is per-project and session-only (§10.2: held in memory,
 * never survives restart; Trash owns cross-session recovery). It is
 * driven entirely by INVERSE COMMANDS re-executed through the same
 * pipeline (invariant 24) — it never pops raw database state.
 *
 * Model. Each captured forward command F carries an inverse I. An
 * action is an ordered list of MEMBERS `{ command, fallback }` executed
 * in order; undo runs I, redo re-runs F. A single command is a
 * one-member action; a GROUP (AI-IMP-127 — a §4.9 frame drag that moves
 * position AND membership, or the create-node+appearance+placement
 * composite) is many members that undo/redo as ONE Mod+Z. Group
 * members are stored REVERSED (last-committed forward undone first —
 * LIFO within the transaction). After executing a member, its OPPOSITE
 * is derived uniformly:
 *   opposite.command  = result.inverse ?? member.fallback
 *   opposite.fallback = member.command
 * `result.inverse` is the committed inverse's own inverse; when it is
 * null (internal-composite inverses such as UnplaceCard/DeleteDraftPin
 * do not self-invert), redo re-issues the ORIGINAL forward command via
 * the fallback. The opposite action reverses the collected opposites so
 * the redo replays forwards in original order. This makes undo→redo and
 * redo→undo symmetric for single commands and groups alike.
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

/** One executable step of an action: run `command`; when its result
 * carries no inverse, the opposite step re-issues `fallback`. */
export interface StackMember {
  command: StackCommand
  fallback: StackCommand
}

export interface StackAction {
  /** Executed in order; a single command is a one-member list. */
  members: StackMember[]
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
    this.#undo.push({ members: [memberFor(command)], canvasId: command.canvasId })
    this.#redo = []
    this.#deps.onChanged()
  }

  /**
   * Record several committed forward commands as ONE undo entry
   * (AI-IMP-127). The list is in FORWARD (commit) order; members with a
   * null inverse are dropped (non-undoable by design). Undo runs the
   * survivors' inverses in reverse order, redo replays the forwards.
   * A group that reduces to a single member behaves exactly like
   * `record`.
   */
  recordGroup(commands: CapturedCommand[]): void {
    const undoable = commands.filter((c) => c.inverse !== null)
    if (undoable.length === 0) return
    // Reverse so undo executes the last forward's inverse first (LIFO).
    const members = undoable.map(memberFor).reverse()
    this.#undo.push({ members, canvasId: undoable[undoable.length - 1]!.canvasId })
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
    // Execute every member in order; each yields its opposite step. Any
    // non-committed member drops the whole entry (§10.2) — a group that
    // fails partway leaves earlier members applied (inverses are trusted
    // LIFO against the state the forward produced, so this is rare).
    const opposites: StackMember[] = []
    this.#applying = true
    for (const member of action.members) {
      let result: CommandResult
      try {
        result = await this.#deps.execute(member.command)
      } catch {
        this.#applying = false
        this.#deps.toast(UNDO_STALE_TOAST)
        this.#deps.onChanged()
        return
      }
      if (result.status !== 'committed') {
        this.#applying = false
        this.#deps.toast(UNDO_STALE_TOAST)
        this.#deps.onChanged()
        return
      }
      opposites.push({
        command:
          result.inverse === null
            ? member.fallback
            : {
                commandType: result.inverse.commandType,
                commandVersion: result.inverse.commandVersion,
                payload: result.inverse.payload,
              },
        fallback: member.command,
      })
    }
    this.#applying = false

    // Reverse so the opposite action replays its members in original
    // forward order (undo of undo = redo runs forwards).
    to.push({ members: opposites.reverse(), canvasId: action.canvasId })
    this.#deps.onChanged()
  }
}

/** One member (inverse to run on undo, forward as its fallback). */
function memberFor(command: CapturedCommand): StackMember {
  return {
    command: {
      commandType: command.inverse!.commandType,
      commandVersion: command.inverse!.commandVersion,
      payload: command.inverse!.payload,
    },
    fallback: {
      commandType: command.commandType,
      commandVersion: command.commandVersion,
      payload: command.payload,
    },
  }
}
