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
      color: '#2563b0',
      textDecoration: 'underline',
      textDecorationColor: '#2563b080',
    },
    '.ew-link--bound-trashed': {
      color: '#6b7684',
      textDecoration: 'underline dotted',
    },
    '.ew-link--unresolved': {
      color: '#7c4dbe',
      textDecoration: 'underline dashed',
      textDecorationColor: '#7c4dbe80',
    },
    '.ew-link--broken': {
      color: '#b3403a',
      textDecoration: 'underline wavy',
      textDecorationColor: '#b3403a80',
    },
  })

  return [plugin, theme]
}
