import { describe, expect, it } from 'vitest'
import { nextBoardTitleVariant, trashedBoardOwner } from './board-birth'

describe('board-birth title collision', () => {
  it('chooses the first free ascending, space-separated suffix', () => {
    expect(nextBoardTitleVariant('warren', ['warren', 'warren 2', 'WARREN   3'])).toBe(
      'warren 4',
    )
    expect(nextBoardTitleVariant('warren', ['warren', 'warren 3'])).toBe('warren 2')
  })

  it('accepts only the typed trashed-board-owner detail', () => {
    expect(
      trashedBoardOwner({
        status: 'error',
        commandId: 'command-1',
        code: 'NOTE_TITLE_CONFLICT',
        message: 'held',
        details: { trashedBoardOwner: { nodeId: 'node-1', canvasId: 'canvas-1' } },
      }),
    ).toEqual({ nodeId: 'node-1', canvasId: 'canvas-1' })
    expect(
      trashedBoardOwner({
        status: 'error',
        commandId: 'command-2',
        code: 'NOTE_TITLE_CONFLICT',
        message: 'held',
        details: { trashedBoardOwner: { nodeId: 'node-1' } },
      }),
    ).toBeNull()
  })
})
