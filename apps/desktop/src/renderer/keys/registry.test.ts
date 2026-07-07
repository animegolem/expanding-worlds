import { beforeEach, describe, expect, it } from 'vitest'
import {
  __resetRegistry,
  allBindings,
  bindingsInScope,
  declare,
  formatBinding,
  formatCombo,
  getBinding,
  matches,
  matchesCombo,
  type Combo,
} from './registry'

/** A KeyboardEvent stand-in — jsdom-free, only the fields matches reads. */
function ev(init: Partial<KeyboardEvent>): KeyboardEvent {
  return {
    key: '',
    code: '',
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    ...init,
  } as KeyboardEvent
}

describe('keymap registry', () => {
  beforeEach(() => __resetRegistry())

  it('declare stores and returns the combo, retrievable by id and scope', () => {
    const combo: Combo = { mod: true, key: 'p' }
    const returned = declare('quick-open', { name: 'Quick open', scope: 'global', combo })
    expect(returned).toBe(combo)
    expect(getBinding('quick-open')?.name).toBe('Quick open')
    declare('flip', { name: 'Flip', scope: 'board', combo: { shift: true, code: 'KeyH' } })
    expect(allBindings()).toHaveLength(2)
    expect(bindingsInScope('board').map((b) => b.id)).toEqual(['flip'])
    expect(bindingsInScope('global').map((b) => b.id)).toEqual(['quick-open'])
  })

  it('rejects a duplicate id (a collision is a bug, not a rebind)', () => {
    declare('dup', { name: 'One', scope: 'global', combo: { key: 'a' } })
    expect(() => declare('dup', { name: 'Two', scope: 'global', combo: { key: 'b' } })).toThrow(
      /already declared/,
    )
  })

  describe('matches', () => {
    it('requires Mod (⌘ or Ctrl), rejects when absent or when Alt/Shift disallowed', () => {
      declare('quick-open', {
        name: 'Quick open',
        scope: 'global',
        combo: { mod: true, shift: false, alt: false, key: 'p' },
      })
      expect(matches(ev({ key: 'p', metaKey: true }), 'quick-open')).toBe(true)
      expect(matches(ev({ key: 'p', ctrlKey: true }), 'quick-open')).toBe(true)
      expect(matches(ev({ key: 'P', metaKey: true }), 'quick-open')).toBe(true) // case-insensitive
      expect(matches(ev({ key: 'p' }), 'quick-open')).toBe(false) // no mod
      expect(matches(ev({ key: 'p', metaKey: true, altKey: true }), 'quick-open')).toBe(false)
      expect(matches(ev({ key: 'p', metaKey: true, shiftKey: true }), 'quick-open')).toBe(false)
    })

    it('treats an unspecified modifier as don’t-care (board keys keep loose predicates)', () => {
      declare('delete', {
        name: 'Delete',
        scope: 'board',
        combo: { mod: false, codes: ['Delete', 'Backspace'] },
      })
      // Shift/Alt unspecified: fires regardless, exactly like the
      // original gestures predicate.
      expect(matches(ev({ code: 'Delete' }), 'delete')).toBe(true)
      expect(matches(ev({ code: 'Backspace', shiftKey: true }), 'delete')).toBe(true)
      expect(matches(ev({ code: 'Delete', altKey: true }), 'delete')).toBe(true)
      expect(matches(ev({ code: 'Delete', metaKey: true }), 'delete')).toBe(false) // mod:false
      expect(matches(ev({ code: 'KeyX' }), 'delete')).toBe(false)
    })

    it('distinguishes Shift for a shared code (send forward vs to front)', () => {
      declare('fwd', { name: 'Forward', scope: 'board', combo: { mod: true, shift: false, code: 'BracketRight' } })
      declare('front', { name: 'Front', scope: 'board', combo: { mod: true, shift: true, code: 'BracketRight' } })
      expect(matches(ev({ code: 'BracketRight', metaKey: true }), 'fwd')).toBe(true)
      expect(matches(ev({ code: 'BracketRight', metaKey: true }), 'front')).toBe(false)
      expect(matches(ev({ code: 'BracketRight', metaKey: true, shiftKey: true }), 'front')).toBe(true)
      expect(matches(ev({ code: 'BracketRight', metaKey: true, shiftKey: true }), 'fwd')).toBe(false)
    })

    it('is false for an unknown id', () => {
      expect(matches(ev({ key: 'a' }), 'nope')).toBe(false)
    })
  })

  describe('formatCombo', () => {
    it('stacks glyphs on macOS, spells + joins elsewhere', () => {
      const quickOpen: Combo = { mod: true, key: 'p' }
      expect(formatCombo(quickOpen, 'mac')).toBe('⌘P')
      expect(formatCombo(quickOpen, 'other')).toBe('Ctrl+P')

      const front: Combo = { mod: true, shift: true, code: 'BracketRight' }
      expect(formatCombo(front, 'mac')).toBe('⇧⌘]')
      expect(formatCombo(front, 'other')).toBe('Ctrl+Shift+]')

      const flip: Combo = { shift: true, code: 'KeyH' }
      expect(formatCombo(flip, 'mac')).toBe('⇧H')
      expect(formatCombo(flip, 'other')).toBe('Shift+H')
    })

    it('renders friendly key glyphs and family overrides', () => {
      expect(formatCombo({ mod: false, codes: ['Delete', 'Backspace'], glyph: 'Delete' }, 'mac')).toBe(
        'Delete',
      )
      expect(formatCombo({ mod: true, glyph: '1–9' }, 'mac')).toBe('⌘1–9')
      expect(formatCombo({ mod: true, glyph: '1–9' }, 'other')).toBe('Ctrl+1–9')
      expect(formatCombo({ code: 'ArrowUp' }, 'mac')).toBe('↑')
      expect(formatCombo({ key: 'Enter' }, 'other')).toBe('↵')
      expect(formatCombo({ key: ' ', glyph: 'Space' }, 'mac')).toBe('Space')
    })

    it('only prints modifiers that are explicitly true', () => {
      // alt:false must NOT render an ⌥; shift undefined must NOT render ⇧.
      expect(formatCombo({ mod: false, alt: false, key: 'v' }, 'mac')).toBe('V')
      expect(formatCombo({ mod: true, key: 'a' }, 'mac')).toBe('⌘A')
    })

    it('formatBinding resolves by id, empty for unknown', () => {
      declare('nav-back', { name: 'Back', scope: 'global', combo: { mod: true, key: '[' } })
      expect(formatBinding('nav-back', 'mac')).toBe('⌘[')
      expect(formatBinding('missing', 'mac')).toBe('')
    })
  })

  it('matchesCombo works standalone (used by inline range predicates)', () => {
    expect(matchesCombo(ev({ key: 'a', metaKey: true }), { mod: true, key: 'a' })).toBe(true)
    expect(matchesCombo(ev({ key: 'a' }), { mod: true, key: 'a' })).toBe(false)
  })

  // Regression guard for the CI red on Linux (settings.spec Keyboard
  // section, undo.spec Mod+Z): the Keyboard settings chips and every
  // Mod binding must behave correctly under BOTH platform resolutions
  // of "Mod" — ⌘ on darwin, Ctrl elsewhere — not just the macOS box
  // these were authored on. Pins the exact combos each platform shows.
  describe('platform contract (darwin vs linux)', () => {
    const cases: Array<{ id: string; combo: Combo; mac: string; linux: string }> = [
      { id: 'quick-open', combo: { mod: true, key: 'p' }, mac: '⌘P', linux: 'Ctrl+P' },
      { id: 'nav-back', combo: { mod: true, key: '[' }, mac: '⌘[', linux: 'Ctrl+[' },
      { id: 'bookmark-jump', combo: { mod: true, glyph: '1–9' }, mac: '⌘1–9', linux: 'Ctrl+1–9' },
      { id: 'bookmark-current', combo: { mod: true, key: 'd' }, mac: '⌘D', linux: 'Ctrl+D' },
      {
        id: 'board-send-front',
        combo: { mod: true, shift: true, code: 'BracketRight' },
        mac: '⇧⌘]',
        linux: 'Ctrl+Shift+]',
      },
      { id: 'tool-select', combo: { mod: false, alt: false, key: 'v' }, mac: 'V', linux: 'V' },
      {
        id: 'gallery-bucket-jump',
        combo: { mod: true, glyph: '↑ ↓' },
        mac: '⌘↑ ↓',
        linux: 'Ctrl+↑ ↓',
      },
    ]
    it.each(cases)('formats $id for both platforms', ({ combo, mac, linux }) => {
      expect(formatCombo(combo, 'mac')).toBe(mac)
      expect(formatCombo(combo, 'other')).toBe(linux)
    })

    it('the matcher fires a Mod binding from EITHER ⌘ (mac) or Ctrl (linux)', () => {
      declare('undo', { name: 'Undo', scope: 'global', combo: { mod: true, key: 'z' } })
      // macOS: the physical key is ⌘ (metaKey).
      expect(matches(ev({ key: 'z', metaKey: true }), 'undo')).toBe(true)
      // Linux/Windows: the physical key is Ctrl (ctrlKey), no metaKey.
      expect(matches(ev({ key: 'z', ctrlKey: true }), 'undo')).toBe(true)
      // The Linux Super key (metaKey) is NOT Mod there, but matchesCombo
      // is platform-neutral by design (§8.2: metaKey || ctrlKey), so a
      // bare key with neither still misses.
      expect(matches(ev({ key: 'z' }), 'undo')).toBe(false)
    })
  })
})
