import { type AnyExtension, Editor } from '@tiptap/core'
import { Text } from '@tiptap/extension-text'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import StarterKit from '@tiptap/starter-kit'
import { MARKDOWN_DIALECT, extractWikiLinks } from '@ew/domain'
import { Markdown } from 'tiptap-markdown'

/**
 * TipTap/Markdown editor wiring for the note editor (RFC-0001 §7.1,
 * AI-IMP-146). The editor is a ProseMirror document whose Markdown
 * carrier is the frozen dialect (`MARKDOWN_DIALECT`, packages/domain).
 *
 * The single non-stock piece is the text-node serializer: wiki-link and
 * embed tokens are kept as SOURCE-PRESERVING plain text (AI-IMP-147 lead
 * ruling — the literal `[[Title]]` / `![[target]]` bytes stay in the
 * carrier, styled by a decoration overlay, never atomized). ProseMirror's
 * default Markdown serializer escapes `[` and `]`, which would corrupt
 * every token into `\[\[Title\]\]` (breaking both byte-exactness and the
 * lexical grammar). So we override the `text` node's serializer to emit
 * grammar-valid tokens VERBATIM and escape everything else exactly as the
 * stock serializer would. Malformed sequences are not tokens and take
 * ordinary escaping.
 */

const NOTE_EDITOR_CONTENT_TESTID = 'note-editor-content'

/** Mirror of tiptap-markdown's internal escapeHTML (html:false path):
 * only `<`/`>` are HTML-escaped for non-token prose spans. */
function escapeHtml(value: string): string {
  return value.replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/**
 * Ranges of `text` that must serialize VERBATIM: every grammar-valid
 * wiki-link token, plus a leading `!` when the token is an embed. Uses
 * the domain extractor so the serializer and the decoration overlay
 * agree on exactly what a token is.
 */
function verbatimSpans(text: string): Array<[number, number]> {
  const spans: Array<[number, number]> = []
  for (const token of extractWikiLinks(text)) {
    const start = token.start > 0 && text[token.start - 1] === '!' ? token.start - 1 : token.start
    spans.push([start, token.end])
  }
  return spans
}

/** Minimal shape of tiptap-markdown's serializer state we depend on. */
interface MarkdownTextState {
  text(content: string, escape?: boolean): void
}

/** The `text` node with a source-preserving Markdown serializer. */
export const WikiText = Text.extend({
  addStorage() {
    return {
      markdown: {
        serialize(state: MarkdownTextState, node: ProseMirrorNode): void {
          const text = node.text ?? ''
          let last = 0
          for (const [start, end] of verbatimSpans(text)) {
            if (start > last) state.text(escapeHtml(text.slice(last, start)), true)
            state.text(text.slice(start, end), false)
            last = end
          }
          if (last < text.length) state.text(escapeHtml(text.slice(last)), true)
        },
        // Parsing is markdown-it's job (tokens stay plain text).
        parse: {},
      },
    }
  },
})

/**
 * The base extension set every note editor shares (AI-IMP-146). Wiki-link
 * decoration, activation, and suggestions ride ON TOP of this via the
 * controller's `extensions` hook — they are presentation/interaction only
 * and never touch serialization, so the round-trip corpus can exercise
 * this base set in isolation.
 */
export function baseNoteExtensions(): AnyExtension[] {
  return [
    // The stock `text` node is replaced by WikiText below.
    StarterKit.configure({ text: false, heading: { levels: [1, 2, 3, 4, 5, 6] } }),
    WikiText,
    Markdown.configure(MARKDOWN_DIALECT),
  ]
}

/** Attributes ProseMirror stamps on the contenteditable surface — the
 * stable e2e hook that replaced CodeMirror's `.cm-content`. */
export function noteEditorProps(): { attributes: Record<string, string> } {
  return { attributes: { 'data-testid': NOTE_EDITOR_CONTENT_TESTID, class: 'ew-note-prose' } }
}

/**
 * `serialize(parse(body))` through the real base editor — the §7.1
 * canonicalization primitive. A throwaway headless editor (requires a
 * DOM; used by the round-trip corpus test and any offline normalization).
 * Every note body is a fixed point after one pass, so a second call is a
 * no-op.
 */
export function roundTripMarkdown(body: string): string {
  const element = document.createElement('div')
  const editor = new Editor({ element, extensions: baseNoteExtensions(), content: body })
  try {
    return editor.storage.markdown.getMarkdown()
  } finally {
    editor.destroy()
  }
}

export { NOTE_EDITOR_CONTENT_TESTID }
