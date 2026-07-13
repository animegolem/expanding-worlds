import { takeoverActive } from '../chrome/takeover'
// KEY imported from bindings (not registry) so the side-effect
// declarations run — undo-keys derives its combo match from the same
// registry entry the settings Keyboard section prints (AI-IMP-123), so
// the handled combo and the displayed combo cannot drift.
import { KEY } from '../keys/bindings'
import { matches } from '../keys/registry'
import { attachUndo, redo, undo } from './undo-store'

/**
 * Structural undo/redo keyboard driver (RFC-0001 §10.2, AI-IMP-114),
 * mounted once from App.svelte. Mod+Z undoes, Shift+Mod+Z redoes.
 *
 * CAPTURE phase, like navigation's Mod+K (navigation.ts): CodeMirror
 * and input fields install their own keydown handlers on their DOM, so
 * a window-capture listener runs first and can DEFER cleanly — inside
 * the editor or any text field, Mod+Z is the editor's fine-grained text
 * history (§10.2 boundary), never the structural stack. It also defers
 * while a takeover owns the window (§8.2), matching navigation.ts.
 *
 * The combo predicate is the registry (`matches`); dispatch and the
 * editor/takeover deferral guards stay here — declaration-only was the
 * AI-IMP-123 bar, not moving dispatch into the registry's dispatcher.
 */

/** Which structural action the event's COMBO fires, ignoring the
 * contextual (typing-target / takeover) guards — the seam the unit
 * test pins against the registry declaration. Redo before undo: their
 * combos are Shift-exclusive, so order is immaterial, but this reads
 * as the shifted variant taking precedence. */
export function undoActionForEvent(event: KeyboardEvent): 'undo' | 'redo' | null {
  if (matches(event, KEY.redo)) return 'redo'
  if (matches(event, KEY.undo)) return 'undo'
  return null
}

function isTypingTarget(node: EventTarget | null): boolean {
  if (!(node instanceof HTMLElement)) return false
  if (node.tagName === 'INPUT' || node.tagName === 'TEXTAREA') return true
  if (node.isContentEditable) return true
  // CodeMirror's editable is a contenteditable inside .cm-editor; guard
  // the container too in case focus sits on a non-editable child.
  return node.closest('.cm-editor') !== null
}

/** Mount the undo stack and its keyboard driver; returns a teardown. */
export function mountUndo(): () => void {
  const detachStore = attachUndo()

  const onKeydown = (event: KeyboardEvent): void => {
    const action = undoActionForEvent(event)
    if (action === null) return
    // OS key-repeat on a held Mod+Z must not spam undo/redo across the IPC
    // round-trip (M-06): the overlapping #step calls are what corrupt the
    // stack. One structural undo/redo per physical press; a held key
    // expresses no additional intent (the UndoStack also drops re-entrant
    // steps as belt-and-braces). Scoped to the undo combos, mirroring the
    // navigation binding's guard (navigation.ts, AI-IMP-176).
    if (event.repeat) return
    // The editor and inputs keep their own history; never steal it.
    if (takeoverActive()) return
    if (isTypingTarget(event.target) || isTypingTarget(document.activeElement)) return
    event.preventDefault()
    event.stopPropagation()
    if (action === 'redo') redo()
    else undo()
  }
  window.addEventListener('keydown', onKeydown, true)

  return () => {
    window.removeEventListener('keydown', onKeydown, true)
    detachStore()
  }
}
