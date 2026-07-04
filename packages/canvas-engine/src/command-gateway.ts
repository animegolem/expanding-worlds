import type { CommandEnvelope, CommandResult } from '@ew/commands'

/**
 * The single door between canvas UI and the Project API: builds
 * envelopes, threads expectedProjectRevision from the observed event
 * stream, and surfaces conflicts as typed results (§10.1). Every
 * canvas command path goes through here so revision handling and
 * conflict UX live in exactly one place.
 */

export interface ProjectExecutor {
  execute(envelope: CommandEnvelope): Promise<CommandResult>
}

declare const crypto: { randomUUID(): string }

export class CommandGateway {
  #executor: ProjectExecutor
  #projectId: string
  #revision: number
  #conflict = new Set<(result: Extract<CommandResult, { status: 'conflict' }>) => void>()

  constructor(executor: ProjectExecutor, projectId: string, revision: number) {
    this.#executor = executor
    this.#projectId = projectId
    this.#revision = revision
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
    const result = await this.#executor.execute({
      commandId: crypto.randomUUID(),
      projectId: this.#projectId,
      commandType,
      commandVersion: opts.commandVersion ?? 1,
      ...(opts.checkRevision === false ? {} : { expectedProjectRevision: this.#revision }),
      issuedAt: new Date().toISOString(),
      payload,
    })
    if (result.status === 'committed') this.noteRevision(result.revision)
    else if (result.status === 'conflict') {
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
