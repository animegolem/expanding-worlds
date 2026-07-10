import {
  DomainError,
  validateEnvelope,
  type CommandEnvelope,
  type CommandRegistry,
  type CommandResult,
  type HandlerOutcome,
  type ProjectChangedEvent,
} from '@ew/commands'
import type { Db } from './db'
import type { ProjectHandle } from './project'

/** The context every command handler executes against. */
export interface CommandContext {
  db: Db
  projectId: string
  rootNodeId: string
  rootCanvasId: string
  now(): string
}

class RevisionConflict extends Error {
  constructor(
    readonly expected: number,
    readonly actual: number,
  ) {
    super('stale expected_project_revision')
  }
}

/**
 * The single write path per invariant 22: validate → resolve →
 * handler → revision bump → command_log, all inside one transaction
 * (§10.2). A failed command leaves no partial state and no revision
 * bump; a committed one emits exactly one project-changed event.
 */
export class Dispatcher {
  #handle: ProjectHandle
  #registry: CommandRegistry<CommandContext>
  #subscribers = new Set<(event: ProjectChangedEvent) => void>()

  constructor(handle: ProjectHandle, registry: CommandRegistry<CommandContext>) {
    this.#handle = handle
    this.#registry = registry
  }

  subscribe(fn: (event: ProjectChangedEvent) => void): () => void {
    this.#subscribers.add(fn)
    return () => this.#subscribers.delete(fn)
  }

  execute(envelope: CommandEnvelope): CommandResult {
    const commandId = (envelope as { commandId?: unknown }).commandId
    const idForResult = typeof commandId === 'string' ? commandId : 'invalid'

    const structural = validateEnvelope(envelope)
    if (structural.length > 0) {
      return {
        status: 'error',
        commandId: idForResult,
        code: 'VALIDATION_FAILED',
        message: structural.join('; '),
      }
    }
    if (envelope.projectId !== this.#handle.projectId) {
      return {
        status: 'error',
        commandId: envelope.commandId,
        code: 'PROJECT_MISMATCH',
        message: `envelope targets project ${envelope.projectId}`,
      }
    }

    // The transaction decides the committed result. Only the code
    // that can still roll back (resolve → handler → revision bump →
    // command_log) lives inside the error-mapping try; the moment
    // the transaction returns, the mutation is durable and its
    // result is fixed. Subscriber notification runs OUTSIDE this
    // block (CA-003) so a throwing subscriber can never rewrite a
    // committed result into a protocol lie about durable state.
    let committed: { outcome: HandlerOutcome; revision: number }
    try {
      const resolved = this.#registry.resolve(envelope.commandType, envelope.commandVersion)
      const payload = resolved.upcast(envelope.payload)
      resolved.validate(payload)
      const ctx: CommandContext = {
        db: this.#handle.db,
        projectId: this.#handle.projectId,
        rootNodeId: this.#handle.rootNodeId,
        rootCanvasId: this.#handle.rootCanvasId,
        now: () => new Date().toISOString(),
      }

      committed = ctx.db.transaction(() => {
        const current = ctx.db.get<{ project_revision: number }>(
          'SELECT project_revision FROM project WHERE id = ?',
          ctx.projectId,
        )!.project_revision
        if (
          envelope.expectedProjectRevision !== undefined &&
          envelope.expectedProjectRevision !== current
        ) {
          throw new RevisionConflict(envelope.expectedProjectRevision, current)
        }

        const outcome = resolved.handler(ctx, payload, {
          ...envelope,
          commandVersion: resolved.targetVersion,
          payload,
        })

        const next = current + 1
        ctx.db.run(
          'UPDATE project SET project_revision = ?, updated_at = ? WHERE id = ?',
          next,
          ctx.now(),
          ctx.projectId,
        )
        ctx.db.run(
          `INSERT INTO command_log
             (command_id, project_id, command_type, command_version,
              issued_at, resulting_revision)
           VALUES (?, ?, ?, ?, ?, ?)`,
          envelope.commandId,
          ctx.projectId,
          envelope.commandType,
          resolved.targetVersion,
          envelope.issuedAt,
          next,
        )
        return { outcome, revision: next }
      })
    } catch (err) {
      if (err instanceof RevisionConflict) {
        return {
          status: 'conflict',
          commandId: envelope.commandId,
          expectedRevision: err.expected,
          actualRevision: err.actual,
        }
      }
      if (err instanceof DomainError) {
        const result: CommandResult = {
          status: 'error',
          commandId: envelope.commandId,
          code: err.code,
          message: err.message,
        }
        if (err.details) result.details = err.details
        return result
      }
      // Failure before or during the transaction: SQLite rolled it
      // back (or it never began), so no durable state changed. Surface
      // it structurally so the IPC seam never rejects.
      return {
        status: 'error',
        commandId: envelope.commandId,
        code: 'INTERNAL',
        message: err instanceof Error ? err.message : String(err),
      }
    }

    // Past this point the mutation is durably committed. Notification
    // failure is refresh/service-health debt, never a rewritten
    // command result.
    const { outcome, revision } = committed
    const event: ProjectChangedEvent = {
      type: 'project-changed',
      projectId: this.#handle.projectId,
      revision,
      commandId: envelope.commandId,
      commandType: envelope.commandType,
      affected: outcome.affected,
    }
    this.#notify(event)

    return {
      status: 'committed',
      commandId: envelope.commandId,
      revision,
      affected: outcome.affected,
      inverse: outcome.inverse,
    }
  }

  /**
   * Deliver a committed change to every subscriber, each isolated in
   * its own try/catch so one throw never starves the rest (CA-003).
   * Production's subscriber posts over the utility parent port, which
   * can throw during shutdown/transport failure — that is delivery
   * debt against a durable mutation, not a command failure.
   */
  #notify(event: ProjectChangedEvent): void {
    for (const subscriber of this.#subscribers) {
      try {
        subscriber(event)
      } catch (err) {
        // TODO(service-health): when a health/refresh seam lands,
        // count this as delivery debt (stale renderer needs a resync)
        // instead of only logging. No such seam exists yet.
        console.error(
          `[dispatcher] project-changed subscriber threw for ` +
            `${event.commandType} ${event.commandId} at revision ${event.revision}; ` +
            `mutation is durable, this notification was dropped`,
          err,
        )
      }
    }
  }
}
