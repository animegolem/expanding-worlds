import { describe, expect, it, vi } from 'vitest'
import type { CommandResult } from '@ew/commands'
import { captureOutlineNote } from './outline-note-capture'

describe('outline preview note capture', () => {
  it('commits exactly one CreateNoteAndAttach with the trimmed title', async () => {
    const execute = vi.fn(async (): Promise<CommandResult> => ({
      status: 'committed', revision: 8, commandId: 'command-1', affected: [], inverse: null,
    }))
    await expect(
      captureOutlineNote(execute, { nodeId: 'node-1', noteId: 'note-1', title: '  field notes  ' }),
    ).resolves.toEqual({ status: 'committed', noteId: 'note-1' })
    expect(execute).toHaveBeenCalledTimes(1)
    expect(execute).toHaveBeenCalledWith('CreateNoteAndAttach', {
      nodeId: 'node-1', noteId: 'note-1', title: 'field notes',
    })
  })

  it('returns the promotion-shaped conflict without issuing a recovery command', async () => {
    const execute = vi.fn(async (): Promise<CommandResult> => ({
      status: 'error', commandId: 'command-1', code: 'NOTE_TITLE_CONFLICT', message: 'taken',
      details: { existingNoteId: 'note-old', conflictingLifecycle: 'trashed' },
    }))
    await expect(
      captureOutlineNote(execute, { nodeId: 'node-1', noteId: 'note-new', title: 'Taken' }),
    ).resolves.toEqual({
      status: 'conflict',
      conflict: { flow: 'promotion', requestedTitle: 'Taken', existingNoteId: 'note-old', conflictingLifecycle: 'trashed' },
    })
    expect(execute).toHaveBeenCalledTimes(1)
  })

  it('preserves non-conflict refusals for the visible error path', async () => {
    const refused: CommandResult = { status: 'error', commandId: 'command-1', code: 'VALIDATION_FAILED', message: 'node is no longer active' }
    const execute = vi.fn(async () => refused)
    await expect(
      captureOutlineNote(execute, { nodeId: 'node-1', noteId: 'note-1', title: 'Draft' }),
    ).resolves.toEqual({ status: 'refused', result: refused })
  })
})
