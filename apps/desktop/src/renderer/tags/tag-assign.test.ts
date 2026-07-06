import { describe, expect, it } from 'vitest'
import type { CommandResult } from '@ew/commands'
import { assignTagByName, filterTagCompletions, type TagOption } from './tag-assign'

/** AI-IMP-108: the shared find-or-create + assign helper and its
 * completion filter — merge by name_key, conflict recovery, benign
 * already-assigned (§4.8 rev 0.45). */

const committed = (): CommandResult => ({
  status: 'committed',
  commandId: 'c',
  revision: 1,
  affected: [],
  inverse: null,
})

const errored = (code: string, details?: Record<string, unknown>): CommandResult => ({
  status: 'error',
  commandId: 'c',
  code,
  message: code,
  ...(details ? { details } : {}),
})

/** Records every command issued and replies from a per-type script. */
function scripted(
  reply: (commandType: string, payload: Record<string, unknown>) => CommandResult,
): {
  execute: (commandType: string, payload: unknown) => Promise<CommandResult>
  calls: Array<{ commandType: string; payload: Record<string, unknown> }>
} {
  const calls: Array<{ commandType: string; payload: Record<string, unknown> }> = []
  return {
    calls,
    execute: (commandType, payload) => {
      const p = payload as Record<string, unknown>
      calls.push({ commandType, payload: p })
      return Promise.resolve(reply(commandType, p))
    },
  }
}

describe('filterTagCompletions', () => {
  const tags: TagOption[] = [
    { id: '1', name: 'ruins' },
    { id: '2', name: 'ruined-city' },
    { id: '3', name: 'camp' },
    { id: '4', name: 'Rust' },
  ]

  it('prefix-filters case-insensitively and drops the exact current text', () => {
    expect(filterTagCompletions(tags, 'ru').map((t) => t.name)).toEqual([
      'ruins',
      'ruined-city',
      'Rust',
    ])
    // Exact match completes to nothing (there is nothing to add).
    expect(filterTagCompletions(tags, 'camp').map((t) => t.name)).toEqual([])
  })

  it('caps the list at the requested limit', () => {
    const many: TagOption[] = Array.from({ length: 20 }, (_, i) => ({
      id: String(i),
      name: `tag-${i}`,
    }))
    expect(filterTagCompletions(many, 'tag', 3)).toHaveLength(3)
  })
})

describe('assignTagByName', () => {
  it('creates a novel tag then assigns it', async () => {
    const { execute, calls } = scripted(() => committed())
    const outcome = await assignTagByName(execute, 'node-1', 'harbor', [])
    expect(outcome).toEqual({ status: 'assigned', tagId: expect.any(String), label: 'harbor' })
    expect(calls.map((c) => c.commandType)).toEqual(['CreateTag', 'AssignTagToNode'])
    // The id minted by CreateTag is the one assigned.
    expect(calls[1]!.payload['tagId']).toBe(calls[0]!.payload['tagId'])
    expect(calls[1]!.payload['nodeId']).toBe('node-1')
  })

  it('hits an existing tag by name_key without creating (case/space folded)', async () => {
    const { execute, calls } = scripted(() => committed())
    const outcome = await assignTagByName(execute, 'node-1', '  Ruins  ', [
      { id: 'tag-ruins', name: 'ruins' },
    ])
    expect(outcome).toEqual({ status: 'assigned', tagId: 'tag-ruins', label: 'ruins' })
    // No CreateTag — the existing id is reused, labeled with its name.
    expect(calls.map((c) => c.commandType)).toEqual(['AssignTagToNode'])
    expect(calls[0]!.payload['tagId']).toBe('tag-ruins')
  })

  it('recovers the existing id from a TAG_NAME_CONFLICT race', async () => {
    const { execute, calls } = scripted((type) =>
      type === 'CreateTag' ? errored('TAG_NAME_CONFLICT', { existingTagId: 'tag-draft' }) : committed(),
    )
    // The name is absent from the passed vocabulary (a draft tag), so
    // the helper tries to create and recovers from the conflict.
    const outcome = await assignTagByName(execute, 'node-1', 'draft', [])
    expect(outcome).toEqual({ status: 'assigned', tagId: 'tag-draft', label: 'draft' })
    expect(calls.map((c) => c.commandType)).toEqual(['CreateTag', 'AssignTagToNode'])
    expect(calls[1]!.payload['tagId']).toBe('tag-draft')
  })

  it('treats TAG_ALREADY_ASSIGNED as a benign no-op', async () => {
    const { execute } = scripted((type) =>
      type === 'AssignTagToNode' ? errored('TAG_ALREADY_ASSIGNED') : committed(),
    )
    const outcome = await assignTagByName(execute, 'node-1', 'ruins', [
      { id: 'tag-ruins', name: 'ruins' },
    ])
    expect(outcome).toEqual({ status: 'already', tagId: 'tag-ruins', label: 'ruins' })
  })

  it('reports an error when the create fails outright and issues no assign', async () => {
    const { execute, calls } = scripted((type) =>
      type === 'CreateTag' ? errored('SOME_OTHER_FAILURE') : committed(),
    )
    const outcome = await assignTagByName(execute, 'node-1', 'nope', [])
    expect(outcome.status).toBe('error')
    expect(calls.map((c) => c.commandType)).toEqual(['CreateTag'])
  })

  it('rejects an empty name without issuing any command', async () => {
    const { execute, calls } = scripted(() => committed())
    const outcome = await assignTagByName(execute, 'node-1', '   ', [])
    expect(outcome.status).toBe('error')
    expect(calls).toHaveLength(0)
  })
})
