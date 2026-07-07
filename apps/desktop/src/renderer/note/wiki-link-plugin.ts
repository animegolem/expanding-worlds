import { Extension } from '@tiptap/core'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view'
import { extractWikiLinks } from '@ew/domain'
import type { LinkResolution } from './link-resolution'

/**
 * Wiki-link decoration (§7.1/§7.2, AI-IMP-045/147, ProseMirror port).
 * Every token renders in one of four visually distinct states, live as
 * the user types. Tokens are found with the SAME lexical extractor
 * persistence uses and resolved through the LinkResolution cache; a cache
 * refresh re-decorates via a meta-only transaction. The decoration is
 * SOURCE-PRESERVING: the literal `[[Title]]` bytes stay visible (the text
 * node is untouched — this is an overlay, never an atom), and the decos
 * carry `data-link-title` / `data-link-state` so activation and tests read
 * token identity off the DOM (the contract that survived the engine swap).
 */

const decorationKey = new PluginKey<DecorationSet>('ewWikiLinkDecorations')

const FOLLOW_KEY = navigator.platform.toLowerCase().includes('mac') ? '⌘' : 'Ctrl'

export interface LinkActivation {
  state: string
  title: string
  /** Client coords of the clicked token's bottom-left, for §7.3's
   * link-anchored location chooser (AI-IMP-065). */
  tokenRect?: { x: number; y: number }
}

function buildDecorations(doc: ProseMirrorNode, resolution: LinkResolution): DecorationSet {
  const decorations: Decoration[] = []
  doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return
    for (const token of extractWikiLinks(node.text)) {
      const state = resolution.stateFor(token.title)
      decorations.push(
        Decoration.inline(pos + token.start, pos + token.end, {
          class: `ew-link ew-link--${state}`,
          'data-link-state': state,
          'data-link-title': token.title,
          // §7.3 rev 0.16: the follow gesture MUST be advertised.
          title: `${FOLLOW_KEY}-click to follow`,
        }),
      )
    }
  })
  return DecorationSet.create(doc, decorations)
}

/** Live wiki-link state overlay driven by the resolution cache. */
export function wikiLinkDecorations(resolution: LinkResolution): Extension {
  return Extension.create({
    name: 'ewWikiLinkDecorations',
    addProseMirrorPlugins() {
      return [
        new Plugin<DecorationSet>({
          key: decorationKey,
          state: {
            init: (_config, editorState) => buildDecorations(editorState.doc, resolution),
            apply: (tr, current, _oldState, newState) => {
              if (tr.docChanged || tr.getMeta(decorationKey) === true) {
                return buildDecorations(newState.doc, resolution)
              }
              return current
            },
          },
          props: {
            decorations: (state) => decorationKey.getState(state),
          },
          view: (editorView) => {
            // Async (post-query) refresh: re-decorate without touching
            // the doc or the editor's undo history.
            const unsubscribe = resolution.onChanged(() => {
              editorView.dispatch(
                editorView.state.tr.setMeta(decorationKey, true).setMeta('addToHistory', false),
              )
            })
            return { destroy: unsubscribe }
          },
        }),
      ]
    },
  })
}

/** Mod+Click activates a token (plain click keeps caret placement for
 * editing, the Obsidian-established convention). The token's position
 * rides along so §7.3's location chooser can anchor to the clicked link
 * (AI-IMP-065). */
export function wikiLinkActivation(onActivate: (link: LinkActivation) => void): Extension {
  return Extension.create({
    name: 'ewWikiLinkActivation',
    addProseMirrorPlugins() {
      return [
        new Plugin({
          key: new PluginKey('ewWikiLinkActivation'),
          props: {
            handleDOMEvents: {
              click: (_view: EditorView, event: MouseEvent) => {
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
            },
          },
        }),
      ]
    },
  })
}
