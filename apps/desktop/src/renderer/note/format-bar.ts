import { Extension } from '@tiptap/core'
import type { Editor } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'
import { placeAnchored } from '../chrome/anchored-placement'
import { Z } from '../z'

/**
 * The selection format bar (RFC-0001 §7.1 LOUD presentation, §8.8
 * clamp/one-clock; AI-IMP-149, EPIC-018 FR-4). Rich-text verbs appear
 * as a FLOATING bar on a text SELECTION only — no standing chrome. Each
 * verb dispatches a TipTap command whose Markdown serialization stays
 * the frozen §7.1 dialect (the round-trip corpus is the permanent
 * regression gate): bold/italic/code toggle CommonMark marks, the
 * heading verbs the ATX levels, list the `-` bullet, and link wraps the
 * selection as the project's native wiki-link token (`[[…]]`) — the app
 * has no URL-link mark, so linking means naming a note, and the literal
 * bytes survive verbatim through the source-preserving text serializer
 * (AI-IMP-147).
 *
 * Implemented as a ProseMirror plugin VIEW (the folding.ts pattern): one
 * bar element on `document.body`, positioned in VIEWPORT coordinates via
 * `coordsAtPos`, so the SAME element tracks the selection whether the
 * live buffer is mounted in the tethered panel or reparented into the
 * §8.5 big editor overlay — one buffer, one bar, both surfaces. The bar
 * sits at the anchored-popover rung (§8.8) and clamp-and-flips into the
 * viewport so it never spills an edge. It shows only while the editor is
 * focused, editable, and the selection is non-empty; it vanishes the
 * instant the selection collapses (the one-clock rule — furniture only
 * while there is something to act on).
 *
 * Keyboard verbs (Mod+B / Mod+I) are handled by TipTap's own mark
 * keymaps (editor-local dispatch, §10.2); this ticket only DECLARES them
 * in keys/bindings.ts so the Settings Keyboard page can list them.
 */

export const formatBarKey = new PluginKey('ewFormatBar')

/** The minimal selection shape the visibility predicate needs. */
export interface BarSelectionShape {
  empty: boolean
  editable: boolean
  focused: boolean
}

/**
 * The bar is visible only for a non-empty selection in a focused,
 * editable buffer — no standing chrome, and a blurred panel never leaves
 * a stale bar behind. Pure so the unit test pins it directly.
 */
export function shouldShowBar(sel: BarSelectionShape): boolean {
  return sel.editable && sel.focused && !sel.empty
}

export interface BarAnchor {
  /** Horizontal centre of the selection, viewport px. */
  centerX: number
  /** Top edge of the selection's first line, viewport px. */
  top: number
  /** Bottom edge of the selection's last line, viewport px. */
  bottom: number
}

export interface BarSize {
  width: number
  height: number
}

export interface Viewport {
  width: number
  height: number
}

export interface BarPlacement {
  left: number
  top: number
}

const GAP = 8
const MARGIN = 8

/**
 * §8.8 clamp-and-flip: centre the bar over the selection and float it
 * ABOVE; if it would clip the top edge, flip it below. Both axes clamp
 * into the viewport minus a margin so the bar never spills off-screen.
 * Pure — the unit test exercises the flip and both clamps.
 */
export function clampBar(
  anchor: BarAnchor,
  size: BarSize,
  viewport: Viewport,
  gap = GAP,
  margin = MARGIN,
): BarPlacement {
  const placed = placeAnchored({
    anchor: {
      x: anchor.centerX,
      y: anchor.top,
      width: 0,
      height: anchor.bottom - anchor.top,
    },
    surface: size,
    host: { x: 0, y: 0, width: viewport.width, height: viewport.height },
    x: { preferred: 'center' },
    y: { preferred: 'before', fallback: 'after' },
    gap,
    margin,
  })
  return { left: placed.x, top: placed.y }
}

/**
 * The link verb's payload: wrap the selected text as a wiki-link title
 * token. Returns null for a selection that cannot name a note — empty or
 * whitespace-only, or one that already spans a block boundary (a newline
 * is not a legal title character, §7.1 lexical grammar). Pure so the
 * unit test pins the URL/title handling.
 */
export function wikiLinkFor(selected: string): string | null {
  if (selected.trim().length === 0) return null
  if (/[\r\n]/.test(selected)) return null
  return `[[${selected}]]`
}

interface VerbSpec {
  id: string
  /** Short label painted in the button (aria carries the full name). */
  glyph: string
  label: string
  isActive: (editor: Editor) => boolean
  run: (editor: Editor) => void
}

/** Toggle the selection into a wiki-link, literal bytes verbatim. */
function applyWikiLink(editor: Editor): void {
  const { from, to } = editor.state.selection
  const selected = editor.state.doc.textBetween(from, to, '\n')
  const wrapped = wikiLinkFor(selected)
  if (!wrapped) return
  editor
    .chain()
    .focus()
    .command(({ tr, dispatch }) => {
      if (dispatch) tr.insertText(wrapped, from, to)
      return true
    })
    .run()
}

const VERBS: VerbSpec[] = [
  {
    id: 'bold',
    glyph: 'B',
    label: 'Bold',
    isActive: (e) => e.isActive('bold'),
    run: (e) => e.chain().focus().toggleBold().run(),
  },
  {
    id: 'italic',
    glyph: 'I',
    label: 'Italic',
    isActive: (e) => e.isActive('italic'),
    run: (e) => e.chain().focus().toggleItalic().run(),
  },
  {
    id: 'code',
    glyph: '</>',
    label: 'Code',
    isActive: (e) => e.isActive('code'),
    run: (e) => e.chain().focus().toggleCode().run(),
  },
  {
    id: 'h1',
    glyph: 'H1',
    label: 'Heading 1',
    isActive: (e) => e.isActive('heading', { level: 1 }),
    run: (e) => e.chain().focus().toggleHeading({ level: 1 }).run(),
  },
  {
    id: 'h2',
    glyph: 'H2',
    label: 'Heading 2',
    isActive: (e) => e.isActive('heading', { level: 2 }),
    run: (e) => e.chain().focus().toggleHeading({ level: 2 }).run(),
  },
  {
    id: 'h3',
    glyph: 'H3',
    label: 'Heading 3',
    isActive: (e) => e.isActive('heading', { level: 3 }),
    run: (e) => e.chain().focus().toggleHeading({ level: 3 }).run(),
  },
  {
    id: 'list',
    glyph: '•',
    label: 'Bulleted list',
    isActive: (e) => e.isActive('bulletList'),
    run: (e) => e.chain().focus().toggleBulletList().run(),
  },
  {
    id: 'link',
    glyph: '[[ ]]',
    label: 'Link to a note',
    // No URL-link mark in the schema — a wiki-link is literal text, so
    // there is no persistent "active" state to reflect.
    isActive: () => false,
    run: applyWikiLink,
  },
]

const BAR_STYLE =
  'position:fixed;z-index:' +
  Z.popover +
  ';display:none;align-items:center;gap:0.12rem;padding:0.22rem;' +
  'background:var(--ew-surface-menu);border:1px solid var(--ew-border);' +
  'border-radius:7px;box-shadow:0 6px 18px var(--ew-menu-shadow);' +
  'pointer-events:auto;user-select:none;font-size:0.78rem;' +
  'font-family:system-ui,-apple-system,sans-serif;'

function buttonStyle(active: boolean): string {
  return (
    'display:inline-flex;align-items:center;justify-content:center;' +
    'min-width:1.7rem;height:1.7rem;padding:0 0.35rem;border:none;border-radius:4px;' +
    'font:inherit;line-height:1;cursor:pointer;color:var(--ew-text);' +
    'background:' +
    (active ? 'var(--ew-surface-control-hover)' : 'transparent') +
    ';'
  )
}

/** Build the bar element and its verb buttons once, wired to `editor`. */
function buildBar(editor: Editor): { root: HTMLElement; sync: () => void } {
  const root = document.createElement('div')
  root.dataset['testid'] = 'note-format-bar'
  root.setAttribute('role', 'toolbar')
  root.style.cssText = BAR_STYLE

  const buttons: Array<{ spec: VerbSpec; el: HTMLButtonElement }> = []
  for (const spec of VERBS) {
    const el = document.createElement('button')
    el.type = 'button'
    el.dataset['testid'] = `format-${spec.id}`
    el.setAttribute('aria-label', spec.label)
    el.title = spec.label
    el.textContent = spec.glyph
    el.style.cssText = buttonStyle(false)
    if (spec.id === 'bold') el.style.fontWeight = '700'
    if (spec.id === 'italic') el.style.fontStyle = 'italic'
    if (spec.id === 'code') el.style.fontFamily = 'var(--ew-font-editor)'
    // Act on mousedown, before the editor can move the selection into the
    // button; preventDefault keeps focus and the selection in the buffer
    // so the verb applies to it and the bar stays put (folding pattern).
    el.addEventListener('mousedown', (event) => {
      event.preventDefault()
      event.stopPropagation()
      spec.run(editor)
    })
    buttons.push({ spec, el })
    root.appendChild(el)
  }

  const sync = (): void => {
    for (const { spec, el } of buttons) {
      const active = spec.isActive(editor)
      el.style.cssText = buttonStyle(active)
      if (spec.id === 'bold') el.style.fontWeight = '700'
      if (spec.id === 'italic') el.style.fontStyle = 'italic'
      if (spec.id === 'code') el.style.fontFamily = 'var(--ew-font-editor)'
      el.setAttribute('aria-pressed', active ? 'true' : 'false')
    }
  }

  return { root, sync }
}

/** Selection anchor in viewport coordinates, or null if unmeasurable. */
function anchorFor(view: EditorView): BarAnchor | null {
  const { from, to } = view.state.selection
  try {
    const start = view.coordsAtPos(from)
    const end = view.coordsAtPos(to)
    return {
      centerX: (start.left + end.right) / 2,
      top: Math.min(start.top, end.top),
      bottom: Math.max(start.bottom, end.bottom),
    }
  } catch {
    return null
  }
}

export const FormatBar = Extension.create({
  name: 'formatBar',
  addProseMirrorPlugins() {
    const editor = this.editor
    return [
      new Plugin({
        key: formatBarKey,
        view(editorView) {
          const { root, sync } = buildBar(editor)
          document.body.appendChild(root)

          const update = (view: EditorView): void => {
            const show = shouldShowBar({
              empty: view.state.selection.empty,
              editable: view.editable,
              focused: view.hasFocus(),
            })
            if (!show) {
              root.style.display = 'none'
              return
            }
            const anchor = anchorFor(view)
            if (!anchor) {
              root.style.display = 'none'
              return
            }
            sync()
            // Measure with the bar laid out (display set) but off-screen
            // for a frame-free first paint.
            root.style.display = 'flex'
            const size = { width: root.offsetWidth, height: root.offsetHeight }
            const viewport = { width: window.innerWidth, height: window.innerHeight }
            const { left, top } = clampBar(anchor, size, viewport)
            root.style.left = `${left}px`
            root.style.top = `${top}px`
          }

          // Focus and blur dispatch no ProseMirror transaction, so the
          // plugin view's `update` never fires for them — listen on the
          // contenteditable directly so a blurred buffer never leaves a
          // stale bar floating (and re-focusing with a live selection
          // brings it back). Deferred a tick so hasFocus() reads the
          // settled state.
          const onFocusChange = (): void => {
            setTimeout(() => update(editorView), 0)
          }
          editorView.dom.addEventListener('focus', onFocusChange)
          editorView.dom.addEventListener('blur', onFocusChange)

          return {
            update: (view) => update(view),
            destroy: () => {
              editorView.dom.removeEventListener('focus', onFocusChange)
              editorView.dom.removeEventListener('blur', onFocusChange)
              root.remove()
            },
          }
        },
      }),
    ]
  },
})
