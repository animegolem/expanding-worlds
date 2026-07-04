import { describe, expect, it } from 'vitest'
import { CommandGateway } from './command-gateway'
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
    const gateway = new CommandGateway(executor, 'project-1', 5)
    await gateway.execute('MovePlacement', { placementId: 'p' })
    expect(executor.envelopes[0]).toMatchObject({
      projectId: 'project-1',
      commandType: 'MovePlacement',
      commandVersion: 1,
      expectedProjectRevision: 5,
    })
    expect(gateway.revision).toBe(6)
  })

  it('surfaces conflicts to listeners and adopts the actual revision', async () => {
    const executor = fakeExecutor((envelope) => ({
      status: 'conflict',
      commandId: envelope.commandId,
      expectedRevision: 5,
      actualRevision: 9,
    }))
    const gateway = new CommandGateway(executor, 'project-1', 5)
    const conflicts: number[] = []
    gateway.onConflict((c) => conflicts.push(c.actualRevision))
    const result = await gateway.execute('TransformContent', {})
    expect(result.status).toBe('conflict')
    expect(conflicts).toEqual([9])
    expect(gateway.revision).toBe(9)
  })

  it('omits the revision check when asked (camera persistence)', async () => {
    const executor = fakeExecutor(() => committed(2))
    const gateway = new CommandGateway(executor, 'project-1', 1)
    await gateway.execute('SetCanvasCamera', {}, { checkRevision: false })
    expect(executor.envelopes[0]).not.toHaveProperty('expectedProjectRevision')
  })

  it('never regresses the revision from stale events', () => {
    const gateway = new CommandGateway(fakeExecutor(() => committed(1)), 'p', 10)
    gateway.noteRevision(4)
    expect(gateway.revision).toBe(10)
    gateway.noteRevision(12)
    expect(gateway.revision).toBe(12)
  })
})
