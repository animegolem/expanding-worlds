import { RangeSetBuilder, StateEffect, type Extension } from '@codemirror/state'
import {
  Decoration,
  EditorView,
  ViewPlugin,
  type DecorationSet,
  type ViewUpdate,
} from '@codemirror/view'
import { extractWikiLinks } from '@ew/domain'
import type { LinkResolution } from './link-resolution'

/**
 * Wiki-link decoration (§7.1/§7.2, AI-IMP-045): every token renders
 * in one of four visually distinct states, live as the user types.
 * Tokens are parsed with the SAME lexical extractor persistence uses
 * and resolved through the LinkResolution cache; a cache refresh
 * re-decorates via a state effect. The mark carries data attributes
 * so activation (AI-IMP-046/048) and tests read token identity off
 * the DOM.
 */

const resolutionChanged = StateEffect.define<null>()

const FOLLOW_KEY = navigator.platform.toLowerCase().includes('mac') ? '⌘' : 'Ctrl'

export interface LinkActivation {
  state: string
  title: string
  /** Client coords of the clicked token's bottom-left, for §7.3's
   * link-anchored location chooser (AI-IMP-065). */
  tokenRect?: { x: number; y: number }
}

/** Mod+Click activates a token (plain click keeps caret placement
 * for editing, the Obsidian-established convention). The token's
 * position rides along so §7.3's location chooser can anchor to the
 * clicked link (AI-IMP-065). */
export function wikiLinkActivation(onActivate: (link: LinkActivation) => void): Extension {
  return EditorView.domEventHandlers({
    click: (event) => {
      if (!event.metaKey && !event.ctrlKey) return false
      const target = (event.target as HTMLElement).closest('[data-link-title]')
      if (!(target instanceof HTMLElement)) return false
      const title = target.dataset['linkTitle']
      const state = target.dataset['linkState']
      if (!title || !state) return false
      event.preventDefault()
      const rect = target.getBoundingClientRect()
      onActivate({ state, title, tokenRect: { x: rect.left, y: rect.bottom } })
      return true
    },
  })
}

export function wikiLinkHighlighter(resolution: LinkResolution): Extension {
  const build = (view: EditorView): DecorationSet => {
    const builder = new RangeSetBuilder<Decoration>()
    for (const token of extractWikiLinks(view.state.doc.toString())) {
      const state = resolution.stateFor(token.title)
      builder.add(
        token.start,
        token.end,
        Decoration.mark({
          class: `ew-link ew-link--${state}`,
          attributes: {
            'data-link-state': state,
            'data-link-title': token.title,
            // §7.3 rev 0.16: the follow gesture MUST be advertised.
            title: `${FOLLOW_KEY}-click to follow`,
          },
        }),
      )
    }
    return builder.finish()
  }

  const plugin = ViewPlugin.fromClass(
    class {
      decorations: DecorationSet
      #unsubscribe: () => void

      constructor(view: EditorView) {
        this.decorations = build(view)
        this.#unsubscribe = resolution.onChanged(() => {
          // Async (post-query), so dispatching here is safe.
          view.dispatch({ effects: resolutionChanged.of(null) })
        })
      }

      update(update: ViewUpdate): void {
        const refreshed = update.transactions.some((tr) =>
          tr.effects.some((effect) => effect.is(resolutionChanged)),
        )
        if (update.docChanged || refreshed) this.decorations = build(update.view)
      }

      destroy(): void {
        this.#unsubscribe()
      }
    },
    { decorations: (instance) => instance.decorations },
  )

  const theme = EditorView.baseTheme({
    '.ew-link': { cursor: 'pointer' },
    '.ew-link--bound': {
      color: 'var(--ew-link-bound)',
      textDecoration: 'underline',
      textDecorationColor: 'var(--ew-link-bound-decoration)',
    },
    '.ew-link--bound-trashed': {
      color: 'var(--ew-link-muted)',
      textDecoration: 'underline dotted',
    },
    '.ew-link--unresolved': {
      color: 'var(--ew-link-unresolved)',
      textDecoration: 'underline dashed',
      textDecorationColor: 'var(--ew-link-unresolved-decoration)',
    },
    '.ew-link--broken': {
      color: 'var(--ew-link-broken)',
      textDecoration: 'underline wavy',
      textDecorationColor: 'var(--ew-link-broken-decoration)',
    },
  })

  return [plugin, theme]
}
