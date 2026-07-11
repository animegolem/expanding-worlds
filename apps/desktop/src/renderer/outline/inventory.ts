import {
  buildOutlineInventory,
  type OutlineActionBag,
  type OutlineVerb,
  type OutlineVerbId,
} from './actions'
import {
  buildOutlineContextMenu,
  type OutlineContextMenuGroup,
} from './context-menu'

export type OutlineDoor = 'preview' | 'context-menu' | 'keyboard'
export type OutlineNavigationIntent =
  | 'fold'
  | 'return'
  | 'cursor-up'
  | 'cursor-down'
  | 'cursor-left'
  | 'cursor-right'

/** The ruled cursor dialects (2026-07-11): arrows always, HJKL and
 * WASD live simultaneously — WASD keeps the whole cleanup loop
 * left-handed while a pen holds the right. Bare letters are safe
 * because `/` is reserved for search focus; type-ahead is ruled out. */
const CURSOR_KEYS: Record<string, OutlineNavigationIntent> = {
  arrowup: 'cursor-up',
  k: 'cursor-up',
  w: 'cursor-up',
  arrowdown: 'cursor-down',
  j: 'cursor-down',
  s: 'cursor-down',
  arrowleft: 'cursor-left',
  h: 'cursor-left',
  a: 'cursor-left',
  arrowright: 'cursor-right',
  l: 'cursor-right',
  d: 'cursor-right',
}

export interface OutlineKeyboardResult {
  handled: boolean
  verbId?: OutlineVerbId
  navigation?: OutlineNavigationIntent
  /** The keyboard door reports the same visible explanation as the other
   * doors instead of turning an unavailable shortcut into silence. */
  disabledReason?: string
}

export interface OutlineActionDoors {
  /** Preview chips render these descriptors directly. */
  preview: readonly OutlineVerb[]
  /** Right-click / long-press renders this grouped projection. */
  contextMenu: readonly OutlineContextMenuGroup[]
  /** Enumerated explicitly so parity is testable, not an assertion by prose. */
  keyboard: {
    ids: readonly OutlineVerbId[]
    handle(event: KeyboardEvent): OutlineKeyboardResult
  }
}

function eventKey(event: KeyboardEvent): string {
  return event.key.toLowerCase()
}

/** Inputs, editors, and ARIA textboxes own every key in the outline map. */
export function outlineInputOwnsKey(target: EventTarget | null): boolean {
  if (!target || typeof target !== 'object') return false
  const element = target as {
    tagName?: string
    isContentEditable?: boolean
    closest?: (selector: string) => unknown
  }
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(element.tagName?.toUpperCase() ?? '')) return true
  if (element.isContentEditable) return true
  return Boolean(element.closest?.('[contenteditable=""], [contenteditable="true"], [role="textbox"]'))
}

function findVerb(inventory: readonly OutlineVerb[], id: OutlineVerbId): OutlineVerb | undefined {
  return inventory.find((verb) => verb.id === id)
}

function noteVerb(inventory: readonly OutlineVerb[]): OutlineVerb | undefined {
  return findVerb(inventory, 'open-note') ?? findVerb(inventory, 'add-note')
}

function keyboardVerb(event: KeyboardEvent, inventory: readonly OutlineVerb[]): OutlineVerb | undefined {
  const key = eventKey(event)
  if (event.metaKey || event.ctrlKey) return undefined
  if (event.altKey) {
    return key === 'enter' && !event.shiftKey ? findVerb(inventory, 'fly-to') : undefined
  }
  // `#` normally arrives with Shift held on a US keyboard, so admit that
  // exact printable key while rejecting every other unratified Shift chord.
  if (key === '#') return findVerb(inventory, 'tag')
  if (event.shiftKey) return undefined
  if (key === 'enter') return findVerb(inventory, 'dive') ?? noteVerb(inventory)
  if (key === ' ' || event.code === 'Space') return findVerb(inventory, 'place')
  if (key === 'n') return noteVerb(inventory)
  if (key === 'delete' || key === 'backspace') return findVerb(inventory, 'trash')
  return undefined
}

/**
 * Create all three doors from one bag. Keyboard dispatch calls the same `run`
 * closure as a preview chip or menu row; disabled offers are handled (so the
 * caller may suppress browser behavior) but never dispatched.
 */
export function createOutlineActionDoors(
  bag: OutlineActionBag,
  navigate: (intent: OutlineNavigationIntent) => void,
): OutlineActionDoors {
  const inventory = buildOutlineInventory(bag)
  const ids = inventory.map((verb) => verb.id)

  return {
    preview: inventory,
    contextMenu: buildOutlineContextMenu(inventory),
    keyboard: {
      ids,
      handle(event): OutlineKeyboardResult {
        if (outlineInputOwnsKey(event.target)) return { handled: false }

        const key = eventKey(event)
        if (!event.altKey && !event.metaKey && !event.ctrlKey && key === 'tab') {
          event.preventDefault()
          navigate('fold')
          return { handled: true, navigation: 'fold' }
        }
        if (!event.altKey && !event.metaKey && !event.ctrlKey && key === 'escape') {
          event.preventDefault()
          navigate('return')
          return { handled: true, navigation: 'return' }
        }
        const cursor = CURSOR_KEYS[key]
        if (cursor && !event.altKey && !event.metaKey && !event.ctrlKey && !event.shiftKey) {
          event.preventDefault()
          navigate(cursor)
          return { handled: true, navigation: cursor }
        }

        const verb = keyboardVerb(event, inventory)
        if (!verb) return { handled: false }
        event.preventDefault()
        verb.run?.()
        return {
          handled: true,
          verbId: verb.id,
          ...(verb.disabledReason ? { disabledReason: verb.disabledReason } : {}),
        }
      },
    },
  }
}

export function outlineDoorIds(doors: OutlineActionDoors, door: OutlineDoor): readonly OutlineVerbId[] {
  if (door === 'preview') return doors.preview.map((verb) => verb.id)
  if (door === 'context-menu') return doors.contextMenu.flatMap((group) => group.items.map((item) => item.id))
  return doors.keyboard.ids
}
