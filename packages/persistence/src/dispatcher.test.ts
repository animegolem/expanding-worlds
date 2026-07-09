import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { uuidv7 } from '@ew/domain'
import {
  CommandRegistry,
  DomainError,
  type CommandEnvelope,
  type CommittedResult,
  type ProjectChangedEvent,
} from '@ew/commands'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Dispatcher, type CommandContext } from './dispatcher'
import { registerNodeHandlers } from './handlers/nodes'
import { createProject, type ProjectHandle } from './project'
import { openProjectService, type ProjectService } from './service'

let dir: string
let serviceDir: string
let handle: ProjectHandle
let service: ProjectService

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'ew-dispatch-'))
  handle = createProject(join(dir, 'raw'), 'Dispatcher Test')
  serviceDir = join(dir, 'svc')
  service = openProjectService(serviceDir, { createIfMissing: true, title: 'Service Test' })
})

afterEach(() => {
  handle.close()
  service.close()
  rmSync(dir, { recursive: true, force: true })
})

function envelope(overrides: Partial<CommandEnvelope> & { projectId: string }): CommandEnvelope {
  return {
    commandId: uuidv7(),
    commandType: 'CreateNode',
    commandVersion: 1,
    issuedAt: new Date().toISOString(),
    payload: { nodeId: uuidv7() },
    ...overrides,
  }
}

function makeDispatcher(): Dispatcher {
  const registry = new CommandRegistry<CommandContext>()
  registerNodeHandlers(registry)
  registry.register('FailAfterWrite', 1, (ctx) => {
    ctx.db.run(
      'INSERT INTO node (id, project_id, created_at, updated_at) VALUES (?, ?, ?, ?)',
      uuidv7(),
      ctx.projectId,
      ctx.now(),
      ctx.now(),
    )
    throw new DomainError('FORCED_FAILURE', 'boom after write')
  })
  registry.register('CreateNodeV2', 2, (ctx, payload) => {
    const { nodeId } = payload as { nodeId: string; source: string }
    ctx.db.run(
      'INSERT INTO node (id, project_id, created_at, updated_at) VALUES (?, ?, ?, ?)',
      nodeId,
      ctx.projectId,
      ctx.now(),
      ctx.now(),
    )
    return { affected: [{ kind: 'node' as const, id: nodeId }], inverse: null }
  })
  registry.registerUpcaster('CreateNodeV2', 1, (p) => ({
    ...(p as object),
    source: 'upcast-from-v1',
  }))
  return new Dispatcher(handle, registry)
}

describe('Dispatcher', () => {
  it('commits: revision bump, command_log row, affected, inverse', () => {
    const dispatcher = makeDispatcher()
    const nodeId = uuidv7()
    const env = envelope({
      projectId: handle.projectId,
      expectedProjectRevision: 0,
      payload: { nodeId },
    })

    const result = dispatcher.execute(env)
    expect(result.status).toBe('committed')
    const committed = result as CommittedResult
    expect(committed.revision).toBe(1)
    expect(committed.affected).toEqual([{ kind: 'node', id: nodeId }])
    expect(committed.inverse).toMatchObject({ commandType: 'DeleteDraftNode' })

    const log = handle.db.get<{ command_type: string; resulting_revision: number }>(
      'SELECT command_type, resulting_revision FROM command_log WHERE command_id = ?',
      env.commandId,
    )
    expect(log).toMatchObject({ command_type: 'CreateNode', resulting_revision: 1 })
  })

  it('executes the returned inverse to restore prior state', () => {
    const dispatcher = makeDispatcher()
    const nodeId = uuidv7()
    const create = dispatcher.execute(
      envelope({ projectId: handle.projectId, payload: { nodeId } }),
    ) as CommittedResult
    expect(handle.db.get('SELECT id FROM node WHERE id = ?', nodeId)).toBeDefined()

    const undo = dispatcher.execute(
      envelope({
        projectId: handle.projectId,
        commandType: create.inverse!.commandType,
        commandVersion: create.inverse!.commandVersion,
        payload: create.inverse!.payload,
      }),
    )
    expect(undo.status).toBe('committed')
    expect(handle.db.get('SELECT id FROM node WHERE id = ?', nodeId)).toBeUndefined()
    // Undo is a new command per invariant 24: revision moves forward.
    expect((undo as CommittedResult).revision).toBe(2)
  })

  it('returns a structured conflict on a stale revision without touching state', () => {
    const dispatcher = makeDispatcher()
    dispatcher.execute(envelope({ projectId: handle.projectId }))

    const stale = dispatcher.execute(
      envelope({ projectId: handle.projectId, expectedProjectRevision: 0 }),
    )
    expect(stale).toMatchObject({ status: 'conflict', expectedRevision: 0, actualRevision: 1 })

    const logCount = handle.db.get<{ n: number }>('SELECT count(*) AS n FROM command_log')!.n
    expect(logCount).toBe(1)
    expect(
      handle.db.get<{ project_revision: number }>('SELECT project_revision FROM project')!
        .project_revision,
    ).toBe(1)
  })

  it('rolls back everything a failing handler wrote (no partial state)', () => {
    const dispatcher = makeDispatcher()
    const before = handle.db.get<{ n: number }>('SELECT count(*) AS n FROM node')!.n

    const result = dispatcher.execute(
      envelope({ projectId: handle.projectId, commandType: 'FailAfterWrite', payload: {} }),
    )
    expect(result).toMatchObject({ status: 'error', code: 'FORCED_FAILURE' })

    expect(handle.db.get<{ n: number }>('SELECT count(*) AS n FROM node')!.n).toBe(before)
    expect(handle.db.get<{ n: number }>('SELECT count(*) AS n FROM command_log')!.n).toBe(0)
    expect(
      handle.db.get<{ project_revision: number }>('SELECT project_revision FROM project')!
        .project_revision,
    ).toBe(0)
  })

  it('upcasts an old payload version to the registered handler', () => {
    const dispatcher = makeDispatcher()
    const nodeId = uuidv7()
    const result = dispatcher.execute(
      envelope({
        projectId: handle.projectId,
        commandType: 'CreateNodeV2',
        commandVersion: 1,
        payload: { nodeId },
      }),
    )
    expect(result.status).toBe('committed')
    // The v1→v2 upcaster ran and the handler committed at v2.
    const log = handle.db.get<{ command_version: number }>(
      'SELECT command_version FROM command_log WHERE command_id = ?',
      result.commandId,
    )
    expect(log?.command_version).toBe(2)
  })

  it('rejects unknown types, wrong projects, and malformed envelopes structurally', () => {
    const dispatcher = makeDispatcher()
    expect(
      dispatcher.execute(envelope({ projectId: handle.projectId, commandType: 'Nope' })),
    ).toMatchObject({ status: 'error', code: 'UNKNOWN_COMMAND' })
    expect(dispatcher.execute(envelope({ projectId: 'someone-else' }))).toMatchObject({
      status: 'error',
      code: 'PROJECT_MISMATCH',
    })
    expect(
      dispatcher.execute({ commandId: 'not-a-uuid' } as unknown as CommandEnvelope),
    ).toMatchObject({ status: 'error', code: 'VALIDATION_FAILED' })
  })

  it('emits one project-changed event per committed command, none on failure', () => {
    const dispatcher = makeDispatcher()
    const events: ProjectChangedEvent[] = []
    const unsubscribe = dispatcher.subscribe((e) => events.push(e))

    const nodeId = uuidv7()
    dispatcher.execute(envelope({ projectId: handle.projectId, payload: { nodeId } }))
    dispatcher.execute(envelope({ projectId: handle.projectId, commandType: 'Nope' }))

    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      type: 'project-changed',
      revision: 1,
      commandType: 'CreateNode',
      affected: [{ kind: 'node', id: nodeId }],
    })

    unsubscribe()
    dispatcher.execute(envelope({ projectId: handle.projectId }))
    expect(events).toHaveLength(1)
  })

  it('a throwing subscriber never rewrites a committed result (CA-003)', () => {
    const dispatcher = makeDispatcher()
    // A subscriber that throws — production's posts over the utility
    // parent port can throw during shutdown/transport failure.
    dispatcher.subscribe(() => {
      throw new Error('transport gone')
    })
    // A healthy subscriber registered after it: one throw must not
    // starve the rest.
    const healthy: ProjectChangedEvent[] = []
    dispatcher.subscribe((e) => healthy.push(e))

    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const nodeId = uuidv7()
    const result = dispatcher.execute(
      envelope({ projectId: handle.projectId, expectedProjectRevision: 0, payload: { nodeId } }),
    )
    consoleError.mockRestore()

    // The protocol never lies about durable state: committed, real revision.
    expect(result.status).toBe('committed')
    const committed = result as CommittedResult
    expect(committed.revision).toBe(1)
    expect(committed.affected).toEqual([{ kind: 'node', id: nodeId }])

    // The row, revision bump, and command-log entry are all durable.
    expect(handle.db.get('SELECT id FROM node WHERE id = ?', nodeId)).toBeDefined()
    expect(
      handle.db.get<{ project_revision: number }>('SELECT project_revision FROM project')!
        .project_revision,
    ).toBe(1)
    expect(
      handle.db.get<{ resulting_revision: number }>(
        'SELECT resulting_revision FROM command_log WHERE command_id = ?',
        committed.commandId,
      )!.resulting_revision,
    ).toBe(1)

    // The healthy subscriber still ran despite the earlier throw.
    expect(healthy).toHaveLength(1)
    expect(healthy[0]).toMatchObject({ type: 'project-changed', revision: 1 })
  })
})

describe('openProjectService', () => {
  it('composes create-if-missing, execute, query, info, subscribe', () => {
    const info = service.info()
    expect(info.revision).toBe(0)

    const events: ProjectChangedEvent[] = []
    service.subscribe((e) => events.push(e))

    const nodeId = uuidv7()
    const result = service.execute(
      envelope({
        projectId: info.projectId,
        expectedProjectRevision: 0,
        payload: { nodeId },
      }),
    )
    expect(result.status).toBe('committed')
    expect(service.info().revision).toBe(1)
    expect(events).toHaveLength(1)

    const nodes = service.query('listNodes')
    expect(nodes.ok).toBe(true)
    const ids = (nodes as { result: Array<{ id: string }> }).result.map((n) => n.id)
    expect(ids).toContain(nodeId)
    expect(ids).toContain(info.rootNodeId)

    const node = service.query('getNode', { nodeId })
    expect(node).toMatchObject({ ok: true, result: { id: nodeId, noteId: null } })
    expect(service.query('getNode', { nodeId: 'missing' })).toMatchObject({
      ok: true,
      result: null,
    })

    expect(service.query('noSuchQuery')).toMatchObject({ ok: false, code: 'UNKNOWN_QUERY' })
  })

  it('reopens an existing project without createIfMissing', () => {
    const info = service.info()
    service.close()
    service = openProjectService(serviceDir, {})
    expect(service.info().projectId).toBe(info.projectId)
  })
})
