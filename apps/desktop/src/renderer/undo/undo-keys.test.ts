import { describe, expect, it } from 'vitest'
import { KEY } from '../keys/bindings'
import { formatBinding, matches } from '../keys/registry'
import { undoActionForEvent } from './undo-keys'

/**
 * AI-IMP-123: undo/redo dispatch stays capture-phase in undo-keys.ts,
 * but its combo predicate now derives from the SAME keymap-registry
 * entry the settings Keyboard section prints (`undoActionForEvent` →
 * `matches(event, KEY.undo/redo)`). This pins that agreement so the
 * printed combo can never drift from the handled one: a change to the
 * declaration moves both the classification and the chip together, and
 * these expectations catch an unintended change to either.
 */

/** A KeyboardEvent stand-in — only the fields the matcher reads. */
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

describe('undo-keys derives its combo from the keymap registry (AI-IMP-123)', () => {
  it('classifies Mod+Z as undo and Shift+Mod+Z as redo, from either ⌘ or Ctrl', () => {
    expect(undoActionForEvent(ev({ key: 'z', metaKey: true }))).toBe('undo')
    expect(undoActionForEvent(ev({ key: 'z', ctrlKey: true }))).toBe('undo')
    expect(undoActionForEvent(ev({ key: 'Z', metaKey: true, shiftKey: true }))).toBe('redo')
    expect(undoActionForEvent(ev({ key: 'z', ctrlKey: true, shiftKey: true }))).toBe('redo')
  })

  it('ignores Alt (mirrors the handler’s altKey bail) and non-Z / bare keys', () => {
    expect(undoActionForEvent(ev({ key: 'z', metaKey: true, altKey: true }))).toBeNull()
    expect(undoActionForEvent(ev({ key: 'z' }))).toBeNull()
    expect(undoActionForEvent(ev({ key: 'a', metaKey: true }))).toBeNull()
  })

  it('the classified event and the printed chip come from ONE declaration', () => {
    const undoEvent = ev({ key: 'z', metaKey: true })
    expect(matches(undoEvent, KEY.undo)).toBe(true)
    expect(undoActionForEvent(undoEvent)).toBe('undo')
    expect(formatBinding(KEY.undo, 'mac')).toBe('⌘Z')
    expect(formatBinding(KEY.undo, 'other')).toBe('Ctrl+Z')

    const redoEvent = ev({ key: 'z', metaKey: true, shiftKey: true })
    expect(matches(redoEvent, KEY.redo)).toBe(true)
    expect(undoActionForEvent(redoEvent)).toBe('redo')
    expect(formatBinding(KEY.redo, 'mac')).toBe('⇧⌘Z')
    expect(formatBinding(KEY.redo, 'other')).toBe('Ctrl+Shift+Z')
  })
})
