import { type AnyExtension, Editor } from '@tiptap/core'
import { Text } from '@tiptap/extension-text'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import StarterKit from '@tiptap/starter-kit'
import { MARKDOWN_DIALECT, extractWikiLinks, matchWikiLinkAt } from '@ew/domain'
import { Markdown } from 'tiptap-markdown'
import { HeadingFold } from './folding'

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

/** The slice of markdown-it's inline `StateInline` the opacity rule uses. */
interface InlineState {
  src: string
  pos: number
  push(type: string, tag: string, nesting: number): { content: string }
}

/** The slice of the markdown-it instance the parse seam hands us. */
interface MarkdownIt {
  inline: {
    ruler: {
      before(
        beforeName: string,
        ruleName: string,
        fn: (state: InlineState, silent: boolean) => boolean,
      ): void
    }
  }
}

const EXCLAMATION = 0x21 // `!`
const OPEN_BRACKET = 0x5b // `[`

/**
 * markdown-it inline rule making grammar-valid `[[…]]` (and embed
 * `![[…]]`) tokens OPAQUE to the Markdown parser (AI-IMP-156). The §7.1
 * grammar is purely lexical and allows `*`, `**`, `` ` ``, `~~` in
 * titles; without this rule markdown-it parses those as emphasis/code/
 * strikethrough INSIDE the token, splitting it across marks so the text
 * nodes hold only `[[`/`]]` fragments. The source-preserving serializer
 * then finds no valid token and bracket-escapes them (`\[\[…\]\]`) — a
 * fixed point that canonicalize-on-load commits silently, dropping the
 * link record. Recognizing the token here and emitting its bytes as ONE
 * literal `text` token consumes the span before emphasis/strikethrough
 * ever see inside it.
 *
 * Registered `before('emphasis')`, so it sits AFTER `backticks` and
 * `strikethrough` in the inline chain (both fire only at `` ` ``/`~`, not
 * at `[`/`!`) and BEFORE `emphasis`/`image`: inline code still wins
 * (`` `[[NotALink]]` `` stays a code span because backticks consume the
 * whole span first) and the embed `!` is claimed here rather than by the
 * image rule's failure path.
 */
function wikiTokenInlineRule(state: InlineState, silent: boolean): boolean {
  const { src, pos } = state
  const embed = src.charCodeAt(pos) === EXCLAMATION
  const bracketPos = embed ? pos + 1 : pos
  if (src.charCodeAt(bracketPos) !== OPEN_BRACKET) return false
  if (src.charCodeAt(bracketPos + 1) !== OPEN_BRACKET) return false
  const token = matchWikiLinkAt(src, bracketPos)
  if (!token) return false
  if (!silent) {
    // Emit the whole span (embed `!` included) as ONE literal text token;
    // markdown-it's default text renderer HTML-escapes it (none of
    // `[ ] * ~ \`` are HTML-special) so the bytes survive to the DOM
    // parser as a single text node.
    state.push('text', '', 0).content = src.slice(pos, token.end)
  }
  state.pos = token.end
  return true
}

/** Marker so the per-parse `setup` hook registers the rule at most once
 * per markdown-it instance (tiptap-markdown calls setup on every parse). */
const WIKI_RULE_FLAG = '__ewWikiTokenRule'

function installWikiTokenRule(markdownit: MarkdownIt): void {
  const flagged = markdownit as MarkdownIt & Record<string, unknown>
  if (flagged[WIKI_RULE_FLAG]) return
  flagged[WIKI_RULE_FLAG] = true
  markdownit.inline.ruler.before('emphasis', 'ew_wiki_token', wikiTokenInlineRule)
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
        // Parsing is markdown-it's job. The one hook we add: an inline
        // rule that makes grammar-valid tokens opaque so emphasis/code/
        // strikethrough never split them (AI-IMP-156). tiptap-markdown
        // calls `setup(markdownit)` for every extension on every parse.
        parse: {
          setup(markdownit: MarkdownIt): void {
            installWikiTokenRule(markdownit)
          },
        },
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
    // §7.1 org-style heading folding — decoration-only, so it rides the
    // base set (both the panel and §8.5 big editor) and never touches
    // serialization (the round-trip corpus proves this).
    HeadingFold,
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
