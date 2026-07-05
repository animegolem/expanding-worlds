import type { CommandContext } from './dispatcher'

export type QueryResult =
  | { ok: true; result: unknown }
  | { ok: false; code: string; message: string }

export type QueryFn = (ctx: Omit<CommandContext, 'now'>, args: unknown) => unknown

/**
 * Typed query surface per §11.3 "run typed query": the renderer asks
 * by name, never with SQL (§11.1). Later tickets append queries;
 * registration is append-only.
 */
export class QueryRegistry {
  #queries = new Map<string, QueryFn>()

  register(name: string, fn: QueryFn): this {
    if (this.#queries.has(name)) throw new Error(`duplicate query ${name}`)
    this.#queries.set(name, fn)
    return this
  }

  names(): string[] {
    return [...this.#queries.keys()]
  }

  run(ctx: Omit<CommandContext, 'now'>, name: string, args: unknown): QueryResult {
    const fn = this.#queries.get(name)
    if (!fn) {
      return { ok: false, code: 'UNKNOWN_QUERY', message: `no query named ${name}` }
    }
    try {
      return { ok: true, result: fn(ctx, args) }
    } catch (err) {
      return {
        ok: false,
        code: 'QUERY_FAILED',
        message: err instanceof Error ? err.message : String(err),
      }
    }
  }
}

export function registerCoreQueries(registry: QueryRegistry): void {
  registry.register('getProject', (ctx) =>
    ctx.db.get(
      `SELECT id, title, schema_version AS schemaVersion,
              project_revision AS revision, root_node_id AS rootNodeId
       FROM project WHERE id = ?`,
      ctx.projectId,
    ),
  )

  registry.register('getNode', (ctx, args) => {
    const { nodeId } = args as { nodeId: string }
    return (
      ctx.db.get(
        `SELECT id, note_id AS noteId, lifecycle_state AS lifecycleState,
                created_at AS createdAt, updated_at AS updatedAt
         FROM node WHERE id = ? AND project_id = ?`,
        nodeId,
        ctx.projectId,
      ) ?? null
    )
  })

  registry.register('listNodes', (ctx) =>
    ctx.db.all(
      `SELECT id, note_id AS noteId, lifecycle_state AS lifecycleState
       FROM node WHERE project_id = ? AND lifecycle_state = 'active'
       ORDER BY id`,
      ctx.projectId,
    ),
  )

  // §10.2 command-log read model (AI-IMP-050): diagnostics and
  // deterministic test assertions ("exactly one UpdateNote", "nothing
  // but camera persists") that exact revision arithmetic can't give —
  // debounced SetCanvasCamera commits land at machine-dependent times.
  registry.register('listCommandLog', (ctx, args) => {
    const { sinceRevision } = (args ?? {}) as { sinceRevision?: number }
    return ctx.db.all(
      `SELECT command_id AS commandId, command_type AS commandType,
              resulting_revision AS resultingRevision
       FROM command_log
       WHERE project_id = ? AND resulting_revision > ?
       ORDER BY resulting_revision`,
      ctx.projectId,
      sinceRevision ?? 0,
    )
  })
}
