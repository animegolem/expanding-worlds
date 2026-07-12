import { describe, expect, it, vi } from 'vitest'
import type { CommandResult } from '@ew/commands'
import type { CommandGroupToken } from '@ew/canvas-engine'
import { deleteLocalTag } from './tag-delete'

const committed = (revision: number): CommandResult => ({
  status: 'committed',
  commandId: `c${revision}`,
  revision,
  affected: [],
  inverse: null,
})

describe('tag delete gesture', () => {
  it('runs DeleteTag then SuppressTagSync in one group', async () => {
    const execute = vi.fn(async () => committed(execute.mock.calls.length))
    let groupCalls = 0
    const groupToken = Symbol('group')
    const group = async <T>(fn: (token: CommandGroupToken) => Promise<T>): Promise<T> => {
      groupCalls += 1
      return fn(groupToken)
    }
    const result = await deleteLocalTag(execute, group, 'tag-1', 'coastal towns')
    expect(groupCalls).toBe(1)
    expect(execute.mock.calls).toEqual([
      ['DeleteTag', { tagId: 'tag-1' }, { groupToken }],
      ['SuppressTagSync', { nameKey: 'coastal towns' }, { groupToken }],
    ])
    expect(result.suppressed?.status).toBe('committed')
  })

  it('is fail-stop when DeleteTag does not commit', async () => {
    const conflict: CommandResult = {
      status: 'conflict',
      commandId: 'c1',
      expectedRevision: 1,
      actualRevision: 2,
    }
    const execute = vi.fn(async () => conflict)
    const group = async <T>(fn: (token: CommandGroupToken) => Promise<T>): Promise<T> =>
      fn(Symbol('group'))
    const result = await deleteLocalTag(execute, group, 'tag-1', 'coastal towns')
    expect(execute).toHaveBeenCalledOnce()
    expect(result.suppressed).toBeNull()
  })
})
