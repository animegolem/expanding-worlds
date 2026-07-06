/**
 * The keymap registry (RFC §8.2, rev 0.48, AI-IMP-117): one thin
 * declaration point every keybinding passes through. Keybindings used
 * to be per-module window listeners with no shared source of truth —
 * every new binding deepened the retrofit cost and the view-only
 * Keyboard settings section was impossible. Now each binding is
 * `declare`d here (id, human name, scope, combo); listeners consult
 * `matches(event, id)` for their predicate and `formatCombo` for the
 * tooltip/settings chip, so the string an artist sees and the keys we
 * dispatch on come from ONE place.
 *
 * REBINDING IS OUT OF SCOPE (deferred until the registry proves
 * itself — §8.2 records the eventual override design). This module is
 * declaration + display + match only; it stores no user overrides.
 *
 * The migration is mechanical, not behavioral. `matches` mirrors the
 * ORIGINAL predicates exactly: a modifier left `undefined` on a combo
 * is "don't care" (several board keys fire regardless of Shift/Alt),
 * `true`/`false` require that modifier on/off. Nothing about which
 * keys fire changed when the listeners migrated.
 */

export type Scope = 'global' | 'board' | 'gallery' | 'menu'

export type Platform = 'mac' | 'other'

/**
 * A key combination. Modifiers are tri-state for matching: `undefined`
 * means "don't care" (mirrors listeners that never tested that
 * modifier), `true`/`false` require it on/off. Identity is by
 * `event.key` (case-insensitive) or `event.code`; the plural forms
 * accept any of several. `glyph` overrides the printed key portion for
 * ranges/families (e.g. `1–9`, `↑ ↓ ← →`) that are not one literal key.
 */
export interface Combo {
  mod?: boolean
  shift?: boolean
  alt?: boolean
  key?: string
  keys?: string[]
  code?: string
  codes?: string[]
  glyph?: string
}

export interface Binding {
  id: string
  name: string
  scope: Scope
  combo: Combo
  /** Optional context note (the §8.2 `when?`), shown in the settings list. */
  when?: string
}

export interface BindingSpec {
  name: string
  scope: Scope
  combo: Combo
  when?: string
}

const registry = new Map<string, Binding>()

/**
 * Register a binding. The id is the single stable handle every
 * listener and tooltip reads by. Returns the combo so a call site can
 * declare-and-use in one expression. Duplicate ids throw — a
 * collision is a bug, not a rebind (rebinding is deferred).
 */
export function declare(id: string, spec: BindingSpec): Combo {
  if (registry.has(id)) {
    throw new Error(`keymap: binding "${id}" is already declared`)
  }
  registry.set(id, { id, ...spec })
  return spec.combo
}

export function getBinding(id: string): Binding | undefined {
  return registry.get(id)
}

/** Every binding, declaration order. */
export function allBindings(): Binding[] {
  return [...registry.values()]
}

/** Bindings in a scope, declaration order (the settings section). */
export function bindingsInScope(scope: Scope): Binding[] {
  return allBindings().filter((b) => b.scope === scope)
}

/** Test seam: drop everything (used by the unit test's isolation). */
export function __resetRegistry(): void {
  registry.clear()
}

function modActive(event: KeyboardEvent): boolean {
  // §8.2: Mod is ⌘ on macOS, Ctrl elsewhere — both accepted so the
  // predicate is platform-neutral, exactly as every original listener
  // wrote `event.metaKey || event.ctrlKey`.
  return event.metaKey || event.ctrlKey
}

/** Does the event satisfy this combo? Mirrors the original predicates. */
export function matchesCombo(event: KeyboardEvent, combo: Combo): boolean {
  if (combo.mod !== undefined && modActive(event) !== combo.mod) return false
  if (combo.shift !== undefined && event.shiftKey !== combo.shift) return false
  if (combo.alt !== undefined && event.altKey !== combo.alt) return false
  if (combo.code !== undefined) return event.code === combo.code
  if (combo.codes !== undefined) return combo.codes.includes(event.code)
  const key = event.key.toLowerCase()
  if (combo.key !== undefined) return key === combo.key.toLowerCase()
  if (combo.keys !== undefined) return combo.keys.some((k) => key === k.toLowerCase())
  return false
}

/** Does the event fire the binding `id`? False for an unknown id. */
export function matches(event: KeyboardEvent, id: string): boolean {
  const binding = registry.get(id)
  return binding ? matchesCombo(event, binding.combo) : false
}

export function currentPlatform(): Platform {
  return typeof navigator !== 'undefined' && navigator.platform.startsWith('Mac')
    ? 'mac'
    : 'other'
}

const CODE_GLYPH: Record<string, string> = {
  BracketLeft: '[',
  BracketRight: ']',
  Backspace: '⌫',
  Delete: 'Delete',
  Space: 'Space',
  Escape: 'Esc',
  Enter: '↵',
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
  PageUp: 'PgUp',
  PageDown: 'PgDn',
}

const KEY_GLYPH: Record<string, string> = {
  ' ': 'Space',
  arrowup: '↑',
  arrowdown: '↓',
  arrowleft: '←',
  arrowright: '→',
  escape: 'Esc',
  enter: '↵',
  backspace: '⌫',
  pageup: 'PgUp',
  pagedown: 'PgDn',
}

function codeGlyph(code: string): string {
  if (code in CODE_GLYPH) return CODE_GLYPH[code]!
  const letter = /^Key([A-Z])$/.exec(code)
  if (letter) return letter[1]!
  const digit = /^Digit([0-9])$/.exec(code)
  if (digit) return digit[1]!
  return code
}

function keyGlyph(key: string): string {
  const lower = key.toLowerCase()
  if (lower in KEY_GLYPH) return KEY_GLYPH[lower]!
  return key.length === 1 ? key.toUpperCase() : key
}

/** The printed key portion (no modifiers): the glyph override, else
 * a friendly rendering of the code/key. */
function comboKeyLabel(combo: Combo): string {
  if (combo.glyph !== undefined) return combo.glyph
  if (combo.code !== undefined) return codeGlyph(combo.code)
  if (combo.codes !== undefined && combo.codes.length > 0) return codeGlyph(combo.codes[0]!)
  if (combo.key !== undefined) return keyGlyph(combo.key)
  if (combo.keys !== undefined && combo.keys.length > 0) return keyGlyph(combo.keys[0]!)
  return ''
}

/**
 * The tooltip/settings chip string. macOS stacks glyphs (⇧⌘P); other
 * platforms spell modifiers and join with `+` (Ctrl+Shift+P). Only
 * modifiers explicitly `true` print, so a "don't care" modifier never
 * shows up as a required key.
 */
export function formatCombo(combo: Combo, platform: Platform = currentPlatform()): string {
  const keyLabel = comboKeyLabel(combo)
  if (platform === 'mac') {
    let out = ''
    if (combo.alt) out += '⌥'
    if (combo.shift) out += '⇧'
    if (combo.mod) out += '⌘'
    return out + keyLabel
  }
  const parts: string[] = []
  if (combo.mod) parts.push('Ctrl')
  if (combo.shift) parts.push('Shift')
  if (combo.alt) parts.push('Alt')
  parts.push(keyLabel)
  return parts.join('+')
}

/** The chip for a declared binding by id (empty for an unknown id). */
export function formatBinding(id: string, platform?: Platform): string {
  const binding = registry.get(id)
  return binding ? formatCombo(binding.combo, platform) : ''
}
