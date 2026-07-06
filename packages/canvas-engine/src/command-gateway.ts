import type { CommandEnvelope, CommandResult } from '@ew/commands'

/**
 * The single door between canvas UI and the Project API: builds
 * envelopes, threads expectedProjectRevision from the observed event
 * stream, and surfaces conflicts as typed results (§10.1). Every
 * canvas command path goes through here so revision handling and
 * conflict UX live in exactly one place.
 *
 * Burst serialization (AI-IMP-112). `expectedProjectRevision` is read
 * at envelope-build time and only advances once a command commits, so
 * a burst of N *parallel* executes against one gateway instance would
 * all stamp the SAME stale revision and every commit after the first
 * would fail the §10.2 optimistic check. To make fire-and-forget
 * parallel callers "just work", each execute chains off the previous
 * one on this instance (`#tail`): a command builds its envelope only
 * after the prior execute has settled and advanced `#revision`. A
 * failed or rejected command is contained — it settles the chain
 * without poisoning it, so later queued executes still run, and its
 * own failure (typed result or thrown error) is returned/rejected to
 * ITS caller unchanged. The public signature and result contract are
 * identical; the ordering is the only added guarantee.
 *
 * Standing checkRevision:false rule (AI-IMP-044/064). An id-targeted
 * mutation of a stable, already-existing record — UpdateNote autosave,
 * RenameNote, SetCanvasCamera persistence — MAY legitimately pass
 * `checkRevision:false`. Such commands address a specific record by id
 * rather than racing to occupy shared structure, so a stale project
 * revision is not a real conflict for them. This is NOT a workaround
 * for the burst defect above: it exists because two gateway instances
 * (e.g. an editor pane and the board) learn each other's commits only
 * via the ASYNC project-changed push, so between a commit and that
 * push their observed revisions diverge; the optimistic check would
 * false-conflict on an edit that is genuinely safe. The burst chain
 * fixes intra-instance racing; checkRevision:false covers this
 * inter-instance skew for id-scoped edits.
 */

export interface ProjectExecutor {
  execute(envelope: CommandEnvelope): Promise<CommandResult>
}

/**
 * Surfaced to the in-renderer undo stack (EPIC-007, AI-IMP-114) for
 * every committed command: the type and payload rebuild a redo, and
 * `result.inverse` is what an undo re-executes.
 */
export interface CommittedNotice {
  commandType: string
  commandVersion: number
  payload: unknown
  result: Extract<CommandResult, { status: 'committed' }>
}

/**
 * Committed-command listeners at MODULE scope, not per instance. The
 * note pane runs its OWN gateway (renderer note/project-port.ts,
 * "deliberately independent of the canvas host's gateway"), so a
 * §8.5 place-on-board — a canvas command issued through that gateway —
 * is invisible to any single instance's hook. An app-wide undo stack
 * needs to see commits from every gateway, so each `#run` broadcasts
 * here. This copies the instance `#conflict` listener-set idiom below
 * (add → unsubscribe closure, iterate on the event) but hoists it to
 * the module because the capture must span gateways; conflict UX
 * stays per-surface and therefore per-instance.
 */
const committedListeners = new Set<(notice: CommittedNotice) => void>()

/** Subscribe to every gateway's committed commands; returns unsub. */
export function onCommittedAnywhere(listener: (notice: CommittedNotice) => void): () => void {
  committedListeners.add(listener)
  return () => committedListeners.delete(listener)
}

export class CommandGateway {
  #executor: ProjectExecutor
  #projectId: string
  #revision: number
  #newId: () => string
  #conflict = new Set<(result: Extract<CommandResult, { status: 'conflict' }>) => void>()
  /** Serialization chain: each execute awaits the prior one's settle
   * so its envelope reads a fresh `#revision`. Kept alive across
   * failures — see the burst-serialization note above. */
  #tail: Promise<void> = Promise.resolve()

  /** `newId` mints command ids — invariant 1 requires UUIDv7, so
   * callers inject @ew/domain's uuidv7 (this package stays
   * domain-free; AI-IMP-058). */
  constructor(executor: ProjectExecutor, projectId: string, revision: number, newId: () => string) {
    this.#executor = executor
    this.#projectId = projectId
    this.#revision = revision
    this.#newId = newId
  }

  get revision(): number {
    return this.#revision
  }

  /** Feed from project-changed events so optimistic checks stay fresh. */
  noteRevision(revision: number): void {
    if (revision > this.#revision) this.#revision = revision
  }

  async execute(
    commandType: string,
    payload: unknown,
    opts: { commandVersion?: number; checkRevision?: boolean } = {},
  ): Promise<CommandResult> {
    // Chain off the prior execute so the envelope below reads a
    // #revision already advanced by everything queued before it.
    const run = this.#tail.then(() => this.#run(commandType, payload, opts))
    // Settle the chain on both fulfilment and rejection so one
    // command's failure never stalls the next queued execute.
    this.#tail = run.then(
      () => undefined,
      () => undefined,
    )
    return run
  }

  async #run(
    commandType: string,
    payload: unknown,
    opts: { commandVersion?: number; checkRevision?: boolean },
  ): Promise<CommandResult> {
    const result = await this.#executor.execute({
      commandId: this.#newId(),
      projectId: this.#projectId,
      commandType,
      commandVersion: opts.commandVersion ?? 1,
      ...(opts.checkRevision === false ? {} : { expectedProjectRevision: this.#revision }),
      issuedAt: new Date().toISOString(),
      payload,
    })
    if (result.status === 'committed') {
      this.noteRevision(result.revision)
      if (committedListeners.size > 0) {
        const notice: CommittedNotice = {
          commandType,
          commandVersion: opts.commandVersion ?? 1,
          payload,
          result,
        }
        for (const listener of committedListeners) listener(notice)
      }
    } else if (result.status === 'conflict') {
      this.noteRevision(result.actualRevision)
      for (const listener of this.#conflict) listener(result)
    }
    return result
  }

  onConflict(
    listener: (result: Extract<CommandResult, { status: 'conflict' }>) => void,
  ): () => void {
    this.#conflict.add(listener)
    return () => this.#conflict.delete(listener)
  }
}
