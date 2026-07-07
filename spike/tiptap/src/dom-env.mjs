/**
 * Headless DOM bootstrap for the spike. TipTap wraps ProseMirror's
 * EditorView, which needs a real-ish DOM (Range, MutationObserver,
 * getComputedStyle). jsdom supplies enough to construct an editor,
 * apply transactions, and read serialized markdown WITHOUT a browser
 * — the honest floor for "does this run hidden/headless" (criterion
 * 6). Node 26 makes globalThis.navigator read-only, so we define it
 * with defineProperty and never reassign it.
 */
import { JSDOM } from 'jsdom'

let installed = false

export function installDom() {
  if (installed) return
  installed = true
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    pretendToBeVisual: true,
    url: 'http://localhost/',
  })
  const w = dom.window
  globalThis.window = w
  globalThis.document = w.document
  if (!('navigator' in globalThis) || globalThis.navigator == null) {
    Object.defineProperty(globalThis, 'navigator', {
      value: w.navigator,
      configurable: true,
    })
  }
  // Constructors/classes must be assigned as-is (binding breaks static
  // members like Node.TEXT_NODE and instanceof).
  const classes = [
    'Node', 'Element', 'HTMLElement', 'HTMLDivElement', 'DOMParser',
    'XMLSerializer', 'Range', 'MutationObserver', 'DocumentFragment',
    'Text', 'Comment', 'Event', 'CustomEvent', 'KeyboardEvent',
    'MouseEvent', 'InputEvent', 'ClipboardEvent', 'DataTransfer',
  ]
  for (const k of classes) {
    if (w[k] !== undefined && globalThis[k] === undefined) globalThis[k] = w[k]
  }
  // Free functions need `this` bound to the jsdom window.
  for (const k of ['getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame']) {
    if (typeof w[k] === 'function' && globalThis[k] === undefined) globalThis[k] = w[k].bind(w)
  }
  // ProseMirror occasionally calls these; jsdom stubs are inert but present.
  if (!globalThis.requestAnimationFrame) {
    globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 0)
    globalThis.cancelAnimationFrame = (id) => clearTimeout(id)
  }
  return dom
}
