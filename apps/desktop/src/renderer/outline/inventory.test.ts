import { describe, expect, it, vi } from 'vitest'
import { disabled, enabled, type OutlineActionBag, type OutlineVerbId } from './actions'
import { createOutlineActionDoors, outlineDoorIds, outlineInputOwnsKey } from './inventory'

function key(
  value: string,
  init: Partial<KeyboardEventInit> & { target?: EventTarget | null } = {},
): KeyboardEvent {
  const event = {
    key: value,
    code: init.code ?? '',
    altKey: init.altKey ?? false,
    metaKey: init.metaKey ?? false,
    ctrlKey: init.ctrlKey ?? false,
    shiftKey: init.shiftKey ?? false,
    target: init.target ?? null,
    preventDefault: vi.fn(),
  }
  return event as unknown as KeyboardEvent
}

function bags(): Record<string, OutlineActionBag> {
  const run = () => {}
  return {
    board: {
      dive: enabled(run),
      flyTo: disabled('not placed on another board'),
      openNote: enabled(run),
      tag: enabled(run),
      trash: enabled(run),
    },
    node: {
      place: enabled(run),
      flyTo: enabled(run),
      addNote: enabled(run),
      tag: enabled(run),
      trash: enabled(run),
    },
    'loose-note': {
      place: enabled(run),
      openNote: enabled(run),
      trash: enabled(run),
    },
    root: {
      dive: enabled(run),
      openNote: enabled(run),
      tag: enabled(run),
      trash: disabled('the root board cannot be moved to trash'),
    },
    bin: {
      trash: disabled('the loose bin cannot be moved to trash'),
    },
  }
}

describe('outline one-inventory / three-door grammar', () => {
  it.each(Object.entries(bags()))('enumerates identical ids for %s', (_kind, bag) => {
    const doors = createOutlineActionDoors(bag, () => {})
    expect(outlineDoorIds(doors, 'context-menu')).toEqual(outlineDoorIds(doors, 'preview'))
    expect(outlineDoorIds(doors, 'keyboard')).toEqual(outlineDoorIds(doors, 'preview'))
  })

  it('keeps disabled reasons in preview and context menu', () => {
    const doors = createOutlineActionDoors(bags().board!, () => {})
    expect(doors.preview.find((verb) => verb.id === 'fly-to')?.disabledReason).toBe(
      'not placed on another board',
    )
    expect(doors.contextMenu[0]?.items.find((verb) => verb.id === 'fly-to')?.disabledReason).toBe(
      'not placed on another board',
    )
  })

  it.each(['root', 'bin'])('retains permanently disabled trash for %s', (kind) => {
    const doors = createOutlineActionDoors(bags()[kind]!, () => {})
    const trash = doors.preview.find((verb) => verb.id === 'trash')
    expect(trash?.disabledReason).toMatch(/cannot be moved to trash/)
  })

  it('puts danger last and alone behind its divider', () => {
    const menu = createOutlineActionDoors(bags().node!, () => {}).contextMenu
    expect(menu.at(-1)?.id).toBe('danger')
    expect(menu.at(-1)?.items.map((item) => item.id)).toEqual(['trash'])
    expect(menu.at(-1)?.items[0]?.danger).toBe(true)
  })
})

describe('outline keyboard door', () => {
  function harness(bag: OutlineActionBag): {
    press: (event: KeyboardEvent) => void
    calls: OutlineVerbId[]
    navigation: string[]
  } {
    const calls: OutlineVerbId[] = []
    const withCalls = Object.fromEntries(
      Object.entries(bag).map(([name, offer]) => [
        name,
        offer && 'run' in offer && offer.run
          ? enabled(() => calls.push(({
              dive: 'dive', place: 'place', flyTo: 'fly-to', openNote: 'open-note',
              addNote: 'add-note', tag: 'tag', trash: 'trash',
            } as Record<string, OutlineVerbId>)[name]!))
          : offer,
      ]),
    ) as OutlineActionBag
    const navigation: string[] = []
    const doors = createOutlineActionDoors(withCalls, (intent) => navigation.push(intent))
    return { press: (event) => { doors.keyboard.handle(event) }, calls, navigation }
  }

  it('dispatches the ratified map through the shared callbacks', () => {
    const board = harness({
      dive: enabled(() => {}),
      flyTo: enabled(() => {}),
      openNote: enabled(() => {}),
      tag: enabled(() => {}),
      trash: enabled(() => {}),
    })
    board.press(key('Enter'))
    board.press(key('Enter', { altKey: true }))
    board.press(key('n'))
    board.press(key('#'))
    board.press(key('Delete'))
    expect(board.calls).toEqual(['dive', 'fly-to', 'open-note', 'tag', 'trash'])

    const node = harness({ place: enabled(() => {}), addNote: enabled(() => {}) })
    node.press(key(' ', { code: 'Space' }))
    node.press(key('Enter'))
    expect(node.calls).toEqual(['place', 'add-note'])
  })

  it('folds on Tab and returns on Escape', () => {
    const h = harness({})
    h.press(key('Tab'))
    h.press(key('Escape'))
    expect(h.navigation).toEqual(['fold', 'return'])
  })

  it('handles but never dispatches a disabled verb', () => {
    const doors = createOutlineActionDoors({ trash: disabled('root cannot be trashed') }, () => {})
    expect(doors.keyboard.handle(key('Backspace'))).toEqual({
      handled: true,
      verbId: 'trash',
      disabledReason: 'root cannot be trashed',
    })
  })

  it('leaves all mapped keys with an input owner', () => {
    const run = vi.fn()
    const target = { tagName: 'INPUT' } as unknown as EventTarget
    const doors = createOutlineActionDoors({ dive: enabled(run) }, () => {})
    expect(doors.keyboard.handle(key('Enter', { target }))).toEqual({ handled: false })
    expect(run).not.toHaveBeenCalled()
  })

  it('does not steal modified or unrelated keys', () => {
    const run = vi.fn()
    const doors = createOutlineActionDoors({ dive: enabled(run) }, () => {})
    expect(doors.keyboard.handle(key('Enter', { ctrlKey: true }))).toEqual({ handled: false })
    expect(doors.keyboard.handle(key('Enter', { metaKey: true }))).toEqual({ handled: false })
    expect(doors.keyboard.handle(key('Enter', { shiftKey: true }))).toEqual({ handled: false })
    expect(doors.keyboard.handle(key('Enter', { altKey: true, ctrlKey: true }))).toEqual({ handled: false })
    expect(doors.keyboard.handle(key('x'))).toEqual({ handled: false })
    expect(run).not.toHaveBeenCalled()
  })

  it('admits the shifted # character without admitting arbitrary Shift chords', () => {
    const run = vi.fn()
    const doors = createOutlineActionDoors({ tag: enabled(run) }, () => {})
    expect(doors.keyboard.handle(key('#', { shiftKey: true }))).toEqual({
      handled: true,
      verbId: 'tag',
    })
    expect(run).toHaveBeenCalledOnce()
  })
})

describe('outlineInputOwnsKey', () => {
  it.each(['INPUT', 'TEXTAREA', 'SELECT'])('recognises %s', (tagName) => {
    expect(outlineInputOwnsKey({ tagName } as unknown as EventTarget)).toBe(true)
  })

  it('recognises nested editable/textbox ownership', () => {
    expect(
      outlineInputOwnsKey({ closest: () => ({}) } as unknown as EventTarget),
    ).toBe(true)
  })
})
