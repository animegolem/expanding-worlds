import { describe, expect, it } from 'vitest'
import { CommandGateway, onCommittedAnywhere, type CommittedNotice } from './command-gateway'
import type { CommandEnvelope, CommandResult } from '@ew/commands'

function fakeExecutor(script: (envelope: CommandEnvelope) => CommandResult) {
  const envelopes: CommandEnvelope[] = []
  return {
    envelopes,
    execute: (envelope: CommandEnvelope) => {
      envelopes.push(envelope)
      return Promise.resolve(script(envelope))
    },
  }
}

const committed = (revision: number): CommandResult => ({
  status: 'committed',
  commandId: 'c',
  revision,
  affected: [],
  inverse: null,
})

describe('CommandGateway', () => {
  it('threads the tracked revision and advances it on commit', async () => {
    const executor = fakeExecutor(() => committed(6))
    const gateway = new CommandGateway(executor, 'project-1', 5, () => '01890a5d-ac96-774b-bcce-b302099a8057')
    await gateway.execute('MovePlacement', { placementId: 'p' })
    expect(executor.envelopes[0]).toMatchObject({
      projectId: 'project-1',
      commandType: 'MovePlacement',
      commandVersion: 1,
      expectedProjectRevision: 5,
    })
    expect(gateway.revision).toBe(6)
  })

  it('broadcasts committed commands to onCommittedAnywhere listeners across instances', async () => {
    const inverse = { commandType: 'TransformContent', commandVersion: 1, payload: { back: true } }
    const committedWith = (revision: number): CommandResult => ({
      status: 'committed',
      commandId: 'c',
      revision,
      affected: [],
      inverse,
    })
    const notices: CommittedNotice[] = []
    const off = onCommittedAnywhere((n) => notices.push(n))
    // Two distinct gateway instances (host + note pane): both feed the
    // one module-level stream the undo stack subscribes to.
    const host = new CommandGateway(fakeExecutor(() => committedWith(2)), 'p', 1, () => '01890a5d-ac96-774b-bcce-b302099a8057')
    const pane = new CommandGateway(fakeExecutor(() => committedWith(3)), 'p', 2, () => '01890a5d-ac96-774b-bcce-b302099a8057')
    await host.execute('TransformContent', { x: 1 })
    await pane.execute('PlaceAsCard', { placementId: 'q' })
    expect(notices).toHaveLength(2)
    expect(notices[0]).toMatchObject({ commandType: 'TransformContent', payload: { x: 1 } })
    expect(notices[0]!.result.inverse).toEqual(inverse)
    expect(notices[1]).toMatchObject({ commandType: 'PlaceAsCard', payload: { placementId: 'q' } })
    // Unsubscribing stops the stream; a non-committed result never fires.
    off()
    const conflicting = new CommandGateway(
      fakeExecutor((e) => ({ status: 'conflict', commandId: e.commandId, expectedRevision: 1, actualRevision: 9 })),
      'p',
      1,
      () => '01890a5d-ac96-774b-bcce-b302099a8057',
    )
    await host.execute('TransformContent', { x: 2 })
    await conflicting.execute('TransformContent', {})
    expect(notices).toHaveLength(2)
  })

  it('broadcasts renderer-local group identity without adding it to the envelope', async () => {
    const executor = fakeExecutor(() => committed(2))
    const notices: CommittedNotice[] = []
    const off = onCommittedAnywhere((notice) => notices.push(notice))
    const gateway = new CommandGateway(executor, 'p', 1, () => '01890a5d-ac96-774b-bcce-b302099a8057')
    const groupToken = Symbol('gesture')

    await gateway.execute('CreatePlacement', { placementId: 'p1' }, { groupToken })
    off()

    expect(notices[0]?.groupToken).toBe(groupToken)
    expect(executor.envelopes[0]).not.toHaveProperty('groupToken')
  })

  it('surfaces conflicts to listeners and adopts the actual revision', async () => {
    const executor = fakeExecutor((envelope) => ({
      status: 'conflict',
      commandId: envelope.commandId,
      expectedRevision: 5,
      actualRevision: 9,
    }))
    const gateway = new CommandGateway(executor, 'project-1', 5, () => '01890a5d-ac96-774b-bcce-b302099a8057')
    const conflicts: number[] = []
    gateway.onConflict((c) => conflicts.push(c.actualRevision))
    const result = await gateway.execute('TransformContent', {})
    expect(result.status).toBe('conflict')
    expect(conflicts).toEqual([9])
    expect(gateway.revision).toBe(9)
  })

  it('omits the revision check when asked (camera persistence)', async () => {
    const executor = fakeExecutor(() => committed(2))
    const gateway = new CommandGateway(executor, 'project-1', 1, () => '01890a5d-ac96-774b-bcce-b302099a8057')
    await gateway.execute('SetCanvasCamera', {}, { checkRevision: false })
    expect(executor.envelopes[0]).not.toHaveProperty('expectedProjectRevision')
  })

  it('never regresses the revision from stale events', () => {
    const gateway = new CommandGateway(fakeExecutor(() => committed(1)), 'p', 10, () => '01890a5d-ac96-774b-bcce-b302099a8057')
    gateway.noteRevision(4)
    expect(gateway.revision).toBe(10)
    gateway.noteRevision(12)
    expect(gateway.revision).toBe(12)
  })

  // AI-IMP-112. A port that enforces the optimistic check: it only
  // commits when the envelope's expectedProjectRevision matches the
  // record it has advanced to, otherwise it returns a conflict. This
  // mirrors §10.2 and, against the old build-envelope-then-await
  // gateway, would reject every parallel command after the first.
  function revisionEnforcingExecutor(startRevision: number) {
    let current = startRevision
    let issued = 0
    return {
      get committed() {
        return current - startRevision
      },
      execute: (envelope: CommandEnvelope): Promise<CommandResult> => {
        // Resolve on a fresh microtask so genuinely parallel executes
        // interleave rather than each finishing before the next builds.
        const seq = issued++
        return Promise.resolve().then(() => {
          if (envelope.expectedProjectRevision !== current) {
            return {
              status: 'conflict',
              commandId: envelope.commandId,
              expectedRevision: envelope.expectedProjectRevision ?? -1,
              actualRevision: current,
            } satisfies CommandResult
          }
          current += 1
          return {
            status: 'committed',
            commandId: envelope.commandId,
            revision: current,
            affected: [],
            inverse: null,
          } satisfies CommandResult
        }).then((r) => {
          void seq
          return r
        })
      },
    }
  }

  it('serializes a parallel burst so every command commits under the check', async () => {
    const executor = revisionEnforcingExecutor(5)
    let n = 0
    const gateway = new CommandGateway(executor, 'project-1', 5, () => `01890a5d-ac96-774b-bcce-b3020000000${n++}`)
    const results = await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        gateway.execute('CreatePlacement', { placementId: `p${i}` }),
      ),
    )
    expect(results.map((r) => r.status)).toEqual([
      'committed',
      'committed',
      'committed',
      'committed',
      'committed',
    ])
    expect(gateway.revision).toBe(10)
    expect(executor.committed).toBe(5)
  })

  it('a mid-chain rejection does not block the next queued command', async () => {
    let call = 0
    const executor = {
      execute: (): Promise<CommandResult> => {
        call += 1
        // Second command throws (e.g. IPC death) — a thrown error, not
        // a typed failure result.
        if (call === 2) return Promise.reject(new Error('boom'))
        return Promise.resolve(committed(call))
      },
    }
    const gateway = new CommandGateway(executor, 'project-1', 0, () => '01890a5d-ac96-774b-bcce-b302099a8057')
    const first = gateway.execute('CreatePlacement', { placementId: 'a' })
    const second = gateway.execute('CreatePlacement', { placementId: 'b' })
    const third = gateway.execute('CreatePlacement', { placementId: 'c' })
    await expect(first).resolves.toMatchObject({ status: 'committed' })
    // The rejection reaches ITS caller unchanged...
    await expect(second).rejects.toThrow('boom')
    // ...and the chain survived: the third command still ran.
    await expect(third).resolves.toMatchObject({ status: 'committed' })
    expect(call).toBe(3)
  })

  it('a mid-chain typed failure does not block the next queued command', async () => {
    let call = 0
    const executor = {
      execute: (envelope: CommandEnvelope): Promise<CommandResult> => {
        call += 1
        if (call === 2)
          return Promise.resolve({
            status: 'error',
            commandId: envelope.commandId,
            code: 'invalid',
            message: 'nope',
          } satisfies CommandResult)
        return Promise.resolve(committed(call))
      },
    }
    const gateway = new CommandGateway(executor, 'project-1', 0, () => '01890a5d-ac96-774b-bcce-b302099a8057')
    const [a, b, c] = await Promise.all([
      gateway.execute('CreatePlacement', { placementId: 'a' }),
      gateway.execute('CreatePlacement', { placementId: 'b' }),
      gateway.execute('CreatePlacement', { placementId: 'c' }),
    ])
    expect(a.status).toBe('committed')
    expect(b.status).toBe('error')
    expect(c.status).toBe('committed')
    expect(call).toBe(3)
  })
})
