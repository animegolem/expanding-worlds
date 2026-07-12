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
  /** Monotonic user-gesture start order. */
  order: number
  /** Renderer-side receipt effect that follows this action across redo. */
  afterUndo?: () => Promise<void> | void
  /** A partial-step repair replays the committed prefix. Once that
   * succeeds, restore this exact grouped action instead of deriving a
   * smaller opposite from the repair commands. */
  repairOf?: StackAction
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
export const PARTIAL_UNDO_TOAST = 'That change was only partly undone — Redo will restore it'
export const PARTIAL_REDO_TOAST = 'That change was only partly redone — Undo will restore it'
export const openGroupToast = (operation: string): string =>
  `still ${operation} — that step isn't ready to undo`

export class UndoStack {
  #deps: UndoStackDeps
  #undo: StackAction[] = []
  #redo: StackAction[] = []
  #nextOrder = 0
  #openGroups = new Map<number, string>()
  /**
   * True for the WHOLE duration of a #step's member execution: the
   * resulting commits are the stack's OWN re-applied inverse/forward and
   * must NOT be captured as fresh forward commands (undo-store's
   * `onCommittedAnywhere` gates capture on this flag).
   *
   * CONTRACT (AI-IMP-181): this is one shared boolean, so it is only
   * truthful while exactly one #step runs at a time. #step is therefore
   * serialized behind {@link #inFlight} — never start a second step, and
   * never clear this flag, while a step is still applying. Observing or
   * flipping it mid-await across overlapping steps reintroduces the race
   * this ticket fixed (the first step's completion cleared the flag while
   * a second's commits were still landing → phantom capture, redo wipe).
   */
  #applying = false
  /** Non-null while a #step is applying; a re-entrant undo/redo awaits it
   * instead of starting a second overlapping step (AI-IMP-181). */
  #inFlight: Promise<void> | null = null

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
    return this.#undo.length > 0 || this.#openGroups.size > 0
  }

  canRedo(): boolean {
    return this.#redo.length > 0
  }

  /**
   * Record one committed forward command. Commands with a null inverse
   * are non-undoable by design (invariant 31) and skipped. A new
   * durable command clears the redo stack (§10.2).
   */
  record(
    command: CapturedCommand,
    order = this.nextOrder(),
    clearRedo = true,
    afterUndo?: () => Promise<void> | void,
  ): void {
    if (command.inverse === null) return
    this.#insertUndo({
      members: [memberFor(command)],
      canvasId: command.canvasId,
      order,
      ...(afterUndo === undefined ? {} : { afterUndo }),
    })
    if (clearRedo) this.#redo = []
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
  recordGroup(
    commands: CapturedCommand[],
    order = this.nextOrder(),
    clearRedo = true,
    afterUndo?: () => Promise<void> | void,
  ): void {
    const undoable = commands.filter((c) => c.inverse !== null)
    if (undoable.length === 0) return
    // Reverse so undo executes the last forward's inverse first (LIFO).
    const members = undoable.map(memberFor).reverse()
    this.#insertUndo({
      members,
      canvasId: undoable[undoable.length - 1]!.canvasId,
      order,
      ...(afterUndo === undefined ? {} : { afterUndo }),
    })
    if (clearRedo) this.#redo = []
    this.#deps.onChanged()
  }

  async undo(): Promise<void> {
    const newestOpen = this.#newestOpen()
    const newestAction = this.#undo[this.#undo.length - 1]
    if (newestOpen && (!newestAction || newestOpen.order > newestAction.order)) {
      this.#deps.toast(openGroupToast(newestOpen.operation))
      return
    }
    await this.#serialize(this.#undo, this.#redo, 'undo')
  }

  async redo(): Promise<void> {
    await this.#serialize(this.#redo, this.#undo, 'redo')
  }

  /**
   * Serialize undo/redo so a second call cannot begin while the first's
   * bookkeeping is still landing (AI-IMP-181). DROP, not queue: a
   * re-entrant call (OS key-repeat on a held Mod+Z, or a double-clicked ☰
   * row) expresses no additional intent, so it awaits the step already in
   * flight rather than enqueuing another — matching the latest-intent
   * navigation fix (AI-IMP-176). The keyboard binding also filters
   * `event.repeat`, so the overlap rarely reaches here; this is the belt
   * to that suspenders (and covers the ☰ row / fire-and-forget paths).
   */
  #serialize(from: StackAction[], to: StackAction[], verb: 'undo' | 'redo'): Promise<void> {
    if (this.#inFlight) return this.#inFlight
    const done = this.#step(from, to, verb).finally(() => {
      this.#inFlight = null
    })
    this.#inFlight = done
    return done
  }

  /**
   * Clear the redo stack unconditionally (RFC §10.2, AI-IMP-230 /
   * Sol CA-005). ANY new durable, non-undo/non-redo commit invalidates
   * redo — even an UNCAPTURED one, even one with a null inverse, even one
   * that lands inside a group but is never recorded. The coordinator
   * (undo-store) calls this for every foreign commit BEFORE deciding
   * whether it also becomes an undo entry, so Mod+Shift+Z can never
   * replay onto a world that already moved on. Kept separate from
   * {@link record}/{@link recordGroup} precisely because most
   * invalidating commits never produce an undo entry (the old
   * null-inverse early return in `record` skipped this, standing redo
   * stale — the exact CA-005 defect).
   */
  invalidateRedo(): void {
    if (this.#redo.length === 0) return
    this.#redo = []
    this.#deps.onChanged()
  }

  /** Drop everything — project switch (§10.2) or teardown. */
  clear(): void {
    const had = this.#undo.length > 0 || this.#redo.length > 0 || this.#openGroups.size > 0
    this.#undo = []
    this.#redo = []
    this.#openGroups.clear()
    if (had) this.#deps.onChanged()
  }

  async #step(from: StackAction[], to: StackAction[], verb: 'undo' | 'redo'): Promise<void> {
    const action = from[from.length - 1]
    if (!action) return

    // V1 same-canvas fence: decline cross-board entries with a toast
    // naming the board AND the direction being declined (AI-IMP-181 M-38:
    // a declined redo says "redo it," not "undo it"); leave the entry so
    // it is actionable once the user is on that canvas (navigation-on-undo
    // is deferred).
    if (action.canvasId !== this.#deps.currentCanvasId()) {
      const name = await this.#deps.boardLabel(action.canvasId)
      this.#deps.toast(`That change was made on ${name} — open that board to ${verb} it`)
      return
    }

    from.pop()
    // Execute every member in order; each yields its opposite step.
    // A failure before the first commit is stale and drops the entry. A
    // failure after a prefix committed exposes a repair action on the
    // opposite stack; completing it restores this exact grouped action.
    const opposites: StackMember[] = []
    this.#applying = true
    try {
      for (const member of action.members) {
        let result: CommandResult
        try {
          result = await this.#deps.execute(member.command)
        } catch {
          this.#recordFailureRepair(action, opposites, to, verb)
          return
        }
        if (result.status !== 'committed') {
          this.#recordFailureRepair(action, opposites, to, verb)
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
    } finally {
      this.#applying = false
    }

    // Reverse so the opposite action replays its members in original
    // forward order (undo of undo = redo runs forwards).
    to.push(
      action.repairOf ?? {
        members: opposites.reverse(),
        canvasId: action.canvasId,
        order: action.order,
        ...(action.afterUndo === undefined ? {} : { afterUndo: action.afterUndo }),
      },
    )
    if (verb === 'undo' && action.afterUndo) {
      try {
        await action.afterUndo()
      } catch {
        // Domain undo already committed. A view-local receipt effect must not
        // turn that success into a stale/partial domain failure.
      }
    }
    this.#deps.onChanged()
  }

  #recordFailureRepair(
    action: StackAction,
    opposites: StackMember[],
    to: StackAction[],
    verb: 'undo' | 'redo',
  ): void {
    if (opposites.length === 0) {
      this.#deps.toast(UNDO_STALE_TOAST)
    } else {
      to.push({
        members: opposites.reverse(),
        canvasId: action.canvasId,
        order: action.order,
        ...(action.afterUndo === undefined ? {} : { afterUndo: action.afterUndo }),
        repairOf: action,
      })
      this.#deps.toast(verb === 'undo' ? PARTIAL_UNDO_TOAST : PARTIAL_REDO_TOAST)
    }
    this.#deps.onChanged()
  }

  /** Reserve undo chronology when a gesture starts, not when it finishes. */
  reserveGroup(operation: string): number {
    const order = this.nextOrder()
    this.#openGroups.set(order, operation)
    this.#deps.onChanged()
    return order
  }

  releaseGroup(order: number): void {
    if (!this.#openGroups.delete(order)) return
    this.#deps.onChanged()
  }

  nextOrder(): number {
    this.#nextOrder += 1
    return this.#nextOrder
  }

  #insertUndo(action: StackAction): void {
    const index = this.#undo.findIndex((candidate) => candidate.order > action.order)
    if (index === -1) this.#undo.push(action)
    else this.#undo.splice(index, 0, action)
  }

  #newestOpen(): { order: number; operation: string } | null {
    let newest: { order: number; operation: string } | null = null
    for (const [order, operation] of this.#openGroups) {
      if (!newest || order > newest.order) newest = { order, operation }
    }
    return newest
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
