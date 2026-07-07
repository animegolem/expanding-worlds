import { describe, expect, it } from 'vitest'
// Side-effect import populates the keymap registry so shortcutId rows
// resolve (validateMenu rejects an unregistered shortcut).
import '../keys/bindings'
import {
  MenuGrammarError,
  menuFor,
  validateMenu,
  type BoardSubject,
  type ItemSubject,
  type MenuActions,
  type MenuGroup,
  type MenuItem,
} from './inventory'

/** No-op actions: the grammar is a pure function of the subject, so the
 * unit test never needs real dispatch. */
function stubActions(): MenuActions {
  const noop = (): void => {}
  return new Proxy({} as MenuActions, { get: () => noop })
}

const IMAGE_ITEM: ItemSubject = {
  kind: 'item',
  hasNote: false,
  locked: false,
  labelVisible: true,
  isImage: true,
}

function allItems(groups: MenuGroup[]): MenuItem[] {
  return groups.flatMap((g) => g.items)
}
function byId(groups: MenuGroup[], id: string): MenuItem | undefined {
  return allItems(groups).find((i) => i.id === id)
}

describe('menuFor — item inventory (§8.4)', () => {
  it('emits the ratified group order and self-validates', () => {
    const groups = menuFor(IMAGE_ITEM, stubActions())
    expect(groups.map((g) => g.id)).toEqual(['edit', 'replace', 'placement', 'destructive'])
    expect(() => validateMenu(groups)).not.toThrow()
  })

  it('puts the destructive verb last, alone, and marked danger', () => {
    const groups = menuFor(IMAGE_ITEM, stubActions())
    const last = groups[groups.length - 1]!
    expect(last.items.map((i) => i.id)).toEqual(['delete'])
    expect(last.items[0]!.danger).toBe(true)
    // Nothing earlier is destructive.
    expect(groups.slice(0, -1).flatMap((g) => g.items).some((i) => i.danger)).toBe(false)
  })

  it('prints registered mono shortcuts on the shipped verbs', () => {
    const groups = menuFor(IMAGE_ITEM, stubActions())
    expect(byId(groups, 'flip-h')!.shortcutId).toBe('board-flip-h')
    expect(byId(groups, 'flip-v')!.shortcutId).toBe('board-flip-v')
    expect(byId(groups, 'lock')!.shortcutId).toBe('board-lock')
    expect(byId(groups, 'open-as-board')!.shortcutId).toBe('board-open-as-board')
    expect(byId(groups, 'delete')!.shortcutId).toBe('board-delete')
  })

  it('ships the not-yet-built verbs as disabled coming-soon rows', () => {
    const groups = menuFor(IMAGE_ITEM, stubActions())
    for (const id of ['replace-image', 'swap-for', 'place-on-another-board', 'crop']) {
      const row = byId(groups, id)!
      expect(row.disabledReason).toBeTruthy()
      expect(row.run).toBeUndefined()
    }
  })

  it('surfaces attach rows for an un-noted item and lifecycle rows once noted', () => {
    const unnoted = allItems(menuFor(IMAGE_ITEM, stubActions())).map((i) => i.id)
    expect(unnoted).toContain('attach-new-note')
    expect(unnoted).toContain('attach-existing-note')
    expect(unnoted).not.toContain('detach-note')

    const noted = allItems(menuFor({ ...IMAGE_ITEM, hasNote: true }, stubActions())).map((i) => i.id)
    expect(noted).toContain('open-note')
    expect(noted).toContain('detach-note')
    expect(noted).toContain('make-note-independent')
    expect(noted).not.toContain('attach-new-note')
  })

  it('reflects live state in the toggle labels and the backdrop gate', () => {
    const locked = byId(menuFor({ ...IMAGE_ITEM, locked: true }, stubActions()), 'lock')!
    expect(locked.label).toBe('Unlock')
    const hidden = byId(menuFor({ ...IMAGE_ITEM, labelVisible: false }, stubActions()), 'hide-label')!
    expect(hidden.label).toBe('Show label')
    // Set-as-backdrop is enabled only for an image item.
    expect(byId(menuFor(IMAGE_ITEM, stubActions()), 'set-as-backdrop')!.run).toBeDefined()
    const nonImage = byId(menuFor({ ...IMAGE_ITEM, isImage: false }, stubActions()), 'set-as-backdrop')!
    expect(nonImage.disabledReason).toBeTruthy()
  })
})

describe('menuFor — board inventory (§8.4)', () => {
  const EMPTY_BOARD: BoardSubject = { kind: 'board', hasBackgroundImage: false, hasColor: false }

  it('emits paste / select-all / fit, backdrop family, color row, board note', () => {
    const groups = menuFor(EMPTY_BOARD, stubActions())
    expect(groups.map((g) => g.id)).toEqual(['board-actions', 'backdrop', 'color', 'board-note'])
    expect(byId(groups, 'select-all')!.shortcutId).toBe('board-select-all')
    expect(byId(groups, 'zoom-to-fit')!.shortcutId).toBe('board-zoom-fit')
    expect(byId(groups, 'paste')!.disabledReason).toBeTruthy()
    expect(byId(groups, 'backdrop-color')!.colorRow).toBeDefined()
    expect(byId(groups, 'board-note')!.run).toBeDefined()
  })

  it('has no destructive group (board menu carries no Delete)', () => {
    const groups = menuFor(EMPTY_BOARD, stubActions())
    expect(allItems(groups).some((i) => i.danger)).toBe(false)
  })

  it('gates the backdrop-edit verbs on a present backdrop', () => {
    const withBg = menuFor({ ...EMPTY_BOARD, hasBackgroundImage: true }, stubActions())
    expect(byId(withBg, 'remove-backdrop')!.run).toBeDefined()
    expect(byId(withBg, 'set-backdrop')!.label).toBe('Replace backdrop…')
    const noBg = menuFor(EMPTY_BOARD, stubActions())
    expect(byId(noBg, 'remove-backdrop')!.disabledReason).toBeTruthy()
    expect(byId(noBg, 'set-backdrop')!.label).toBe('Set backdrop image…')
  })
})

describe('validateMenu — grammar guards', () => {
  const ok = (item: Partial<MenuItem>): MenuItem => ({ id: 'x', label: 'X', run: () => {}, ...item })

  it('rejects a submenu on a non-family verb', () => {
    expect(() =>
      validateMenu([{ id: 'g', items: [{ id: 'x', label: 'X', submenu: [ok({})] } as MenuItem] }]),
    ).toThrow(MenuGrammarError)
  })

  it('accepts a submenu on a family verb', () => {
    expect(() =>
      validateMenu([
        {
          id: 'g',
          items: [{ id: 'appear', label: 'Appearance', family: 'appearance', submenu: [ok({})] }],
        },
      ]),
    ).not.toThrow()
  })

  it('rejects a family verb with no submenu', () => {
    expect(() =>
      validateMenu([{ id: 'g', items: [{ id: 'a', label: 'A', family: 'align', run: () => {} }] }]),
    ).toThrow(MenuGrammarError)
  })

  it('rejects a destructive row outside the final group', () => {
    expect(() =>
      validateMenu([
        { id: 'g1', items: [ok({ id: 'del', danger: true })] },
        { id: 'g2', items: [ok({ id: 'y' })] },
      ]),
    ).toThrow(/destructive/)
  })

  it('rejects a non-destructive row sharing the destructive group', () => {
    expect(() =>
      validateMenu([{ id: 'g', items: [ok({ id: 'del', danger: true }), ok({ id: 'y' })] }]),
    ).toThrow(/only destructive/)
  })

  it('rejects the word "file" in a verb label (§6.5)', () => {
    expect(() =>
      validateMenu([{ id: 'g', items: [ok({ label: 'Replace file…' })] }]),
    ).toThrow(/file/)
  })

  it('rejects a row in more than one mode', () => {
    expect(() =>
      validateMenu([
        { id: 'g', items: [{ id: 'x', label: 'X', run: () => {}, disabledReason: 'no' }] },
      ]),
    ).toThrow(MenuGrammarError)
  })

  it('rejects a row in zero modes', () => {
    expect(() => validateMenu([{ id: 'g', items: [{ id: 'x', label: 'X' }] }])).toThrow(
      MenuGrammarError,
    )
  })

  it('rejects an unregistered shortcut id', () => {
    expect(() =>
      validateMenu([{ id: 'g', items: [ok({ shortcutId: 'no-such-binding' })] }]),
    ).toThrow(/unregistered/)
  })

  it('rejects an empty group', () => {
    expect(() => validateMenu([{ id: 'g', items: [] }])).toThrow(/empty/)
  })
})
