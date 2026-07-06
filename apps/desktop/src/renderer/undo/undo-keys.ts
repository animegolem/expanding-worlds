import { takeoverActive } from '../chrome/takeover'
import { attachUndo, redo, undo } from './undo-store'

/**
 * Structural undo/redo keyboard driver (RFC-0001 §10.2, AI-IMP-114),
 * mounted once from App.svelte. Mod+Z undoes, Shift+Mod+Z redoes.
 *
 * CAPTURE phase, like navigation's Mod+P (navigation.ts): CodeMirror
 * and input fields install their own keydown handlers on their DOM, so
 * a window-capture listener runs first and can DEFER cleanly — inside
 * the editor or any text field, Mod+Z is the editor's fine-grained text
 * history (§10.2 boundary), never the structural stack. It also defers
 * while a takeover owns the window (§8.2), matching navigation.ts.
 */

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
    if (event.altKey) return
    if (!(event.metaKey || event.ctrlKey)) return
    if (event.key.toLowerCase() !== 'z') return
    // The editor and inputs keep their own history; never steal it.
    if (takeoverActive()) return
    if (isTypingTarget(event.target) || isTypingTarget(document.activeElement)) return
    event.preventDefault()
    event.stopPropagation()
    if (event.shiftKey) redo()
    else undo()
  }
  window.addEventListener('keydown', onKeydown, true)

  return () => {
    window.removeEventListener('keydown', onKeydown, true)
    detachStore()
  }
}
