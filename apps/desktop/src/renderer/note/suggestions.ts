import { Extension } from '@tiptap/core'
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'
import type { ProjectPort } from './note-editor'

/**
 * Wiki-link title suggestions (§7.2, AI-IMP-045/147, ProseMirror port).
 * Inside an open `[[` token the completion list offers active titles,
 * phantom titles with an indicator and reference count (so repeated
 * references converge on one spelling), and trashed titles marked In
 * Trash. Matching runs server-side in `suggestTitles` by normalized
 * title_key; no create action appears here — creation flows through
 * phantom materialization.
 *
 * The popup is a bespoke DOM list — NEVER a `<datalist>` (burned in
 * hidden-window Electron) — with a keyboard model (Up/Down/Enter/Escape)
 * and a stable `data-testid="note-suggestions"` hook.
 */

interface TitleSuggestion {
  title: string
  phantom: boolean
  inTrash: boolean
  referenceCount: number | null
}

const SUGGESTION_TESTID = 'note-suggestions'
const OPEN_TOKEN_RE = /\[\[([^[\]|\r\n]*)$/
const suggestionKey = new PluginKey('ewWikiLinkSuggestions')

function detailFor(suggestion: TitleSuggestion): string | null {
  if (suggestion.phantom) {
    const count = suggestion.referenceCount ?? 0
    return `phantom · ${count} ref${count === 1 ? '' : 's'}`
  }
  if (suggestion.inTrash) return 'In Trash'
  return null
}

interface OpenToken {
  /** Doc position where the title text starts (just after `[[`). */
  from: number
  /** Doc position of the caret (end of the typed title). */
  to: number
  query: string
}

/** The token being completed, if the caret sits inside an open `[[`. */
function openTokenAt(view: EditorView): OpenToken | null {
  const { selection } = view.state
  if (!selection.empty) return null
  const { $from } = selection
  const textBefore = $from.parent.textBetween(0, $from.parentOffset, undefined, '￼')
  const match = OPEN_TOKEN_RE.exec(textBefore)
  if (!match) return null
  const query = match[1] ?? ''
  return { from: selection.from - query.length, to: selection.from, query }
}

class SuggestionPopup {
  #view: EditorView
  #port: ProjectPort
  #element: HTMLUListElement | null = null
  #items: TitleSuggestion[] = []
  #active = 0
  #token: OpenToken | null = null
  #generation = 0
  /** Set in destroy(). The editor view can be torn down WHILE an
   * async suggestTitles query is in flight; its resolution path must not
   * re-create the popup (an orphan appended to document.body) or call
   * coordsAtPos on the destroyed view (an unhandled rejection). Checked
   * after every await and at #render entry (AI-IMP-156). */
  #destroyed = false

  constructor(view: EditorView, port: ProjectPort) {
    this.#view = view
    this.#port = port
  }

  get open(): boolean {
    return this.#element !== null
  }

  async refresh(): Promise<void> {
    if (this.#destroyed) return
    const token = openTokenAt(this.#view)
    // Empty query needs no list (mirrors the shipped non-explicit rule).
    if (!token || token.query.length === 0) {
      this.close()
      return
    }
    this.#token = token
    const generation = ++this.#generation
    const suggestions = await this.#port.query<TitleSuggestion[]>('suggestTitles', {
      query: token.query,
    })
    // The view may have been destroyed while the query was in flight —
    // never touch it or re-render after that (AI-IMP-156).
    if (this.#destroyed) return
    if (generation !== this.#generation) return // a newer keystroke won
    // The caret may have moved off the token while the query was in flight.
    const still = openTokenAt(this.#view)
    if (!still || still.query !== token.query) return
    this.#token = still
    if (suggestions.length === 0) {
      this.close()
      return
    }
    this.#items = suggestions
    this.#active = 0
    this.#render()
  }

  move(delta: number): void {
    if (!this.open || this.#items.length === 0) return
    this.#active = (this.#active + delta + this.#items.length) % this.#items.length
    this.#render()
  }

  applyActive(): boolean {
    if (!this.open || !this.#token) return false
    const suggestion = this.#items[this.#active]
    if (!suggestion) return false
    this.apply(suggestion)
    return true
  }

  apply(suggestion: TitleSuggestion): void {
    const token = this.#token
    if (!token) return
    const { state } = this.#view
    const closed = state.doc.textBetween(token.to, Math.min(token.to + 2, state.doc.content.size)) === ']]'
    const insert = suggestion.title + (closed ? '' : ']]')
    const caret = token.from + suggestion.title.length + 2
    const tr = state.tr.insertText(insert, token.from, token.to)
    // Place the caret just past the (now-closed) token.
    tr.setSelection(TextSelection.near(tr.doc.resolve(Math.min(caret, tr.doc.content.size))))
    this.#view.dispatch(tr)
    this.close()
    this.#view.focus()
  }

  close(): void {
    this.#token = null
    this.#items = []
    if (this.#element) {
      this.#element.remove()
      this.#element = null
    }
  }

  #render(): void {
    if (this.#destroyed) return
    if (!this.#element) {
      this.#element = document.createElement('ul')
      this.#element.className = 'ew-suggestions'
      this.#element.dataset['testid'] = SUGGESTION_TESTID
      document.body.appendChild(this.#element)
    }
    const list = this.#element
    list.replaceChildren()
    this.#items.forEach((suggestion, index) => {
      const row = document.createElement('li')
      row.className = 'ew-suggestion' + (index === this.#active ? ' ew-suggestion--active' : '')
      const label = document.createElement('span')
      label.className = 'ew-suggestion-label'
      label.textContent = suggestion.title
      row.appendChild(label)
      const detail = detailFor(suggestion)
      if (detail !== null) {
        const detailEl = document.createElement('span')
        detailEl.className = 'ew-suggestion-detail'
        detailEl.textContent = detail
        row.appendChild(detailEl)
      }
      row.addEventListener('mousedown', (event) => {
        event.preventDefault() // keep editor focus
        this.apply(suggestion)
      })
      list.appendChild(row)
    })
    this.#position()
  }

  #position(): void {
    if (!this.#element || !this.#token) return
    const coords = this.#view.coordsAtPos(this.#token.to)
    this.#element.style.position = 'fixed'
    this.#element.style.left = `${coords.left}px`
    this.#element.style.top = `${coords.bottom}px`
  }

  destroy(): void {
    this.#destroyed = true
    this.close()
  }
}

/** The `[[` completion popup wired to the suggestTitles read model. */
export function wikiLinkSuggestions(port: ProjectPort): Extension {
  return Extension.create({
    name: 'ewWikiLinkSuggestions',
    addProseMirrorPlugins() {
      let popup: SuggestionPopup | null = null
      return [
        new Plugin({
          key: suggestionKey,
          view: (editorView) => {
            popup = new SuggestionPopup(editorView, port)
            return {
              update: () => {
                void popup?.refresh()
              },
              destroy: () => {
                popup?.destroy()
                popup = null
              },
            }
          },
          props: {
            handleKeyDown: (_view, event) => {
              if (!popup?.open) return false
              switch (event.key) {
                case 'ArrowDown':
                  popup.move(1)
                  return true
                case 'ArrowUp':
                  popup.move(-1)
                  return true
                case 'Enter':
                case 'Tab':
                  return popup.applyActive()
                case 'Escape':
                  popup.close()
                  return true
                default:
                  return false
              }
            },
            handleDOMEvents: {
              blur: () => {
                popup?.close()
                return false
              },
            },
          },
        }),
      ]
    },
  })
}
