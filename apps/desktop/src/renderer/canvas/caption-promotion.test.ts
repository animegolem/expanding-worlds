import type { CommandResult } from '@ew/commands'
import { describe, expect, it, vi } from 'vitest'
import { commitCaptionPromotion } from './caption-promotion'

const committed = (revision: number): CommandResult => ({
  status: 'committed',
  commandId: `command-${revision}`,
  revision,
  affected: [],
  inverse: null,
})

const conflict: CommandResult = {
  status: 'error',
  commandId: 'conflict',
  code: 'NOTE_TITLE_CONFLICT',
  message: 'title exists',
}

const input = {
  placementId: 'placement-1',
  nodeId: 'node-1',
  noteId: 'note-1',
  caption: 'hazy overgrown vines',
} as const

describe('caption promotion command composition (§4.5)', () => {
  it('groups CreateNoteAndAttach then caption clear for title routing', async () => {
    const execute = vi
      .fn<(commandType: string, payload: unknown) => Promise<CommandResult>>()
      .mockResolvedValueOnce(committed(2))
      .mockResolvedValueOnce(committed(3))
    let groups = 0
    const group = async <T>(run: () => Promise<T>): Promise<T> => {
      groups += 1
      return run()
    }

    await expect(
      commitCaptionPromotion(execute, { ...input, route: 'title' }, group),
    ).resolves.toEqual({ status: 'committed' })
    expect(groups).toBe(1)
    expect(execute.mock.calls).toEqual([
      [
        'CreateNoteAndAttach',
        { nodeId: 'node-1', noteId: 'note-1', title: 'hazy overgrown vines' },
      ],
      ['SetPlacementCaption', { placementId: 'placement-1', caption: null }],
    ])
  })

  it('routes the caption into body with the separately supplied title', async () => {
    const execute = vi
      .fn<(commandType: string, payload: unknown) => Promise<CommandResult>>()
      .mockResolvedValueOnce(committed(2))
      .mockResolvedValueOnce(committed(3))

    await commitCaptionPromotion(
      execute,
      { ...input, route: 'body', bodyTitle: 'Vines study' },
      async (run) => run(),
    )
    expect(execute).toHaveBeenNthCalledWith(1, 'CreateNoteAndAttach', {
      nodeId: 'node-1',
      noteId: 'note-1',
      title: 'Vines study',
      body: 'hazy overgrown vines',
    })
  })

  it('is fail-stop when create refuses and never clears the caption', async () => {
    const execute = vi.fn().mockResolvedValue(conflict)
    const outcome = await commitCaptionPromotion(
      execute,
      { ...input, route: 'title' },
      async (run) => run(),
    )
    expect(outcome).toEqual({ status: 'create-refused', result: conflict })
    expect(execute).toHaveBeenCalledTimes(1)
  })

  it('reports a clear refusal after the note command commits', async () => {
    const execute = vi
      .fn<(commandType: string, payload: unknown) => Promise<CommandResult>>()
      .mockResolvedValueOnce(committed(2))
      .mockResolvedValueOnce(conflict)
    const outcome = await commitCaptionPromotion(
      execute,
      { ...input, route: 'title' },
      async (run) => run(),
    )
    expect(outcome).toEqual({ status: 'clear-refused', result: conflict })
    expect(execute).toHaveBeenCalledTimes(2)
  })
})
