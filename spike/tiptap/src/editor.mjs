/**
 * Minimal TipTap editor factory for the spike. StarterKit (the
 * "minimal extension set" the epic would ship) + tiptap-markdown +
 * the wiki-link/embed atoms. Markdown config is tuned to match our
 * §7.1 carrier conventions as closely as TipTap allows:
 *   - bulletListMarker '-'  (our corpus uses '-')
 *   - html: false           (we don't want raw-HTML passthrough)
 *   - tightLists            (no blank line between list items)
 */
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { Markdown } from 'tiptap-markdown'
import { WikiLink, Embed } from './wiki-extensions.mjs'

export function makeEditor(content = '', opts = {}) {
  const element = document.createElement('div')
  document.body.appendChild(element)
  const editor = new Editor({
    element,
    extensions: [
      StarterKit.configure({ codeBlock: {}, heading: { levels: [1, 2, 3, 4, 5, 6] } }),
      Markdown.configure({
        html: false,
        tightLists: true,
        bulletListMarker: '-',
        linkify: false,
        breaks: false,
        transformPastedText: false,
        transformCopiedText: false,
      }),
      WikiLink.configure({ classFor: opts.classFor ?? (() => 'wl-unknown') }),
      Embed,
    ],
    content,
  })
  return editor
}

export function toMarkdown(editor) {
  return editor.storage.markdown.getMarkdown()
}

/** body -> TipTap doc -> body, the round-trip under test. */
export function roundTrip(body, opts = {}) {
  const editor = makeEditor(body, opts)
  const out = toMarkdown(editor)
  editor.destroy()
  return out
}
