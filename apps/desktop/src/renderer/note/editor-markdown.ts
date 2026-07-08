import { type AnyExtension, Editor, Mark, Node, mergeAttributes } from '@tiptap/core'
import { Text } from '@tiptap/extension-text'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import StarterKit from '@tiptap/starter-kit'
import { MARKDOWN_DIALECT, extractWikiLinks, matchWikiLinkAt } from '@ew/domain'
import { Markdown } from 'tiptap-markdown'
import { FormatBar } from './format-bar'
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

/** A markdown-it inline token — the fields the highlight rule touches. */
interface MdToken {
  type: string
  tag: string
  nesting: number
  content: string
  markup: string
  attrGet(name: string): string | null
}

/** A markdown-it emphasis-style delimiter (the `==` pair machinery). */
interface MdDelimiter {
  marker: number
  length: number
  token: number
  end: number
  open: boolean
  close: boolean
}

/** The slice of `StateInline` the `==highlight==` tokenizer uses (mirrors
 * markdown-it's own strikethrough rule — a `scanDelims`/`delimiters` pair). */
interface DelimiterState {
  src: string
  pos: number
  push(type: string, tag: string, nesting: number): MdToken
  scanDelims(
    start: number,
    canSplitWord: boolean,
  ): { can_open: boolean; can_close: boolean; length: number }
  delimiters: MdDelimiter[]
  tokens: MdToken[]
}

/** The slice of `StateInline` the `==highlight==` post-processor walks. */
interface PostProcessState {
  tokens: MdToken[]
  delimiters: MdDelimiter[]
  tokens_meta: Array<{ delimiters?: MdDelimiter[] } | null>
}

/** A markdown-it renderer rule (the image override emits a chip, not <img>). */
type RenderRule = (
  tokens: MdToken[],
  idx: number,
  options: unknown,
  env: unknown,
  self: unknown,
) => string

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
    ruler2: {
      before(beforeName: string, ruleName: string, fn: (state: PostProcessState) => void): void
    }
  }
  renderer: { rules: Record<string, RenderRule | undefined> }
}

const EXCLAMATION = 0x21 // `!`
const OPEN_BRACKET = 0x5b // `[`
const EQUALS = 0x3d // `=`

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
 * The `==highlight==` inline tokenizer (AI-IMP-170). A faithful port of
 * markdown-it's own strikethrough rule with `=` for `~` and the `mark`
 * tag — the standard `markdown-it-mark` behaviour, written beside the 156
 * wiki-token rule rather than vendored (RFC §7.1 rev 0.66). `==` is not
 * CommonMark, so the frozen dialect owns the grammar addition. Emits
 * paired `mark_open`/`mark_close` tokens (via `delimiters`, so nested
 * emphasis/code/wiki-tokens inside the span still parse); markdown-it's
 * default renderer turns them into `<mark>…</mark>`, which the Highlight
 * mark's `parseHTML` claims. `length: 0` disables the emphasis "rule of
 * three" (whole even runs pair), exactly as strikethrough does.
 */
function highlightTokenize(state: DelimiterState, silent: boolean): boolean {
  const start = state.pos
  const marker = state.src.charCodeAt(start)
  if (silent) return false
  if (marker !== EQUALS) return false
  const scanned = state.scanDelims(state.pos, true)
  let len = scanned.length
  const ch = String.fromCharCode(marker)
  if (len < 2) return false
  let token: MdToken
  if (len % 2) {
    token = state.push('text', '', 0)
    token.content = ch
    len--
  }
  for (let i = 0; i < len; i += 2) {
    token = state.push('text', '', 0)
    token.content = ch + ch
    state.delimiters.push({
      marker,
      length: 0,
      token: state.tokens.length - 1,
      end: -1,
      open: scanned.can_open,
      close: scanned.can_close,
    })
  }
  state.pos += scanned.length
  return true
}

/** Walk one delimiter list, turning matched `==` pairs into mark tags
 * (the strikethrough post-processor, verbatim but for `=`/`mark`). */
function highlightPostProcessList(state: PostProcessState, delimiters: MdDelimiter[]): void {
  const loneMarkers: number[] = []
  for (let i = 0; i < delimiters.length; i++) {
    const startDelim = delimiters[i]!
    if (startDelim.marker !== EQUALS) continue
    if (startDelim.end === -1) continue
    const endDelim = delimiters[startDelim.end]!
    let token = state.tokens[startDelim.token]!
    token.type = 'mark_open'
    token.tag = 'mark'
    token.nesting = 1
    token.markup = '=='
    token.content = ''
    token = state.tokens[endDelim.token]!
    token.type = 'mark_close'
    token.tag = 'mark'
    token.nesting = -1
    token.markup = '=='
    token.content = ''
    const prev = state.tokens[endDelim.token - 1]
    if (prev && prev.type === 'text' && prev.content === '=') {
      loneMarkers.push(endDelim.token - 1)
    }
  }
  // Odd runs leave a lone `=` before an `mark_close`; move it after the
  // closing tags (mirrors markdown-it's strikethrough handling).
  while (loneMarkers.length) {
    const i = loneMarkers.pop()!
    let j = i + 1
    while (j < state.tokens.length && state.tokens[j]!.type === 'mark_close') j++
    j--
    if (i !== j) {
      const token = state.tokens[j]!
      state.tokens[j] = state.tokens[i]!
      state.tokens[i] = token
    }
  }
}

function highlightPostProcess(state: PostProcessState): void {
  highlightPostProcessList(state, state.delimiters)
  for (const meta of state.tokens_meta) {
    if (meta?.delimiters) highlightPostProcessList(state, meta.delimiters)
  }
}

/** Register the `==highlight==` tokenizer + post-processor once per md
 * instance (tiptap-markdown calls parse setup on every parse). Both run
 * `before('emphasis')`, the strikethrough slot, so `==` pairs before
 * `*`/`_` and after `` ` `` — and alongside the wiki-token rule, which
 * triggers only on `[`/`!`, so the two never collide. */
const HIGHLIGHT_RULE_FLAG = '__ewHighlightRule'
function installHighlightRule(markdownit: MarkdownIt): void {
  const flagged = markdownit as MarkdownIt & Record<string, unknown>
  if (flagged[HIGHLIGHT_RULE_FLAG]) return
  flagged[HIGHLIGHT_RULE_FLAG] = true
  markdownit.inline.ruler.before(
    'emphasis',
    'ew_highlight',
    highlightTokenize as unknown as (state: InlineState, silent: boolean) => boolean,
  )
  markdownit.inline.ruler2.before('emphasis', 'ew_highlight', highlightPostProcess)
}

/** HTML-attribute escaping for the image-chip renderer (values land in
 * double-quoted attributes, so `&"<>` must be entity-encoded). */
function escapeAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/**
 * Replace markdown-it's `image` renderer so `![alt](url)` NEVER produces
 * an `<img>` element (RFC §11.5 / §7.1 rev 0.66: an image URL must not
 * fetch ambiently on note open). Instead it emits a non-fetching
 * `<span data-ew-image>` marker carrying the src/alt/title; the Image
 * node's `parseHTML` turns that into the chip node. Because no `<img>`
 * string is ever produced, no `<img>` element is ever created — not in
 * the DOMParser stage, not in the live editor's `innerHTML` parse — so
 * the browser has nothing to load. Markdown serialization is unaffected
 * (the node still round-trips to `![alt](url)` via the default serializer).
 */
function installImageRenderer(markdownit: MarkdownIt): void {
  markdownit.renderer.rules.image = (tokens, idx) => {
    const token = tokens[idx]!
    const src = token.attrGet('src') ?? ''
    const title = token.attrGet('title') ?? ''
    // markdown-it stores the (already inline-rendered) alt text in content.
    const alt = token.content ?? ''
    let attrs = `data-ew-image data-src="${escapeAttr(src)}" data-alt="${escapeAttr(alt)}"`
    if (title) attrs += ` data-title="${escapeAttr(title)}"`
    return `<span ${attrs}></span>`
  }
}

/** The registrable-domain (hostname) of a URL, for the §7.1 hover chip
 * that names a link/image target's domain. Empty for relative or
 * non-URL destinations (e.g. a `[[Note]]` that landed in a link slot). */
function domainOf(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return ''
  }
}

const IMAGE_GLYPH_SVG =
  '<svg viewBox="0 0 16 16" width="1em" height="1em" aria-hidden="true" focusable="false">' +
  '<rect x="1.5" y="2.5" width="13" height="11" rx="1.5" fill="none" stroke="currentColor"/>' +
  '<circle cx="5.5" cy="6" r="1.2" fill="currentColor"/>' +
  '<path d="M2.5 12l3-3.2 2.2 2.2 2.3-2.4 3.2 3.4" fill="none" stroke="currentColor"/></svg>'

/**
 * Inline URL link (§7.1 rev 0.66). Hand-rolled TipTap Link mark named
 * `link` so tiptap-markdown's default `link` serializer (which already
 * emits `<url>` for autolinks and `[text](url)` otherwise) round-trips
 * all three URL forms byte-exact. Activation stays ours (§7.3): NO
 * openOnClick, NO autolink-on-type input rule, NO paste linkify — the
 * mark only appears when the frozen dialect PARSES `[text](url)` or
 * `<url>`. Rendered with a §7.1 hover chip naming the DOMAIN; the mark's
 * `title` attr (the Markdown link title) is kept for serialization but
 * the DOM `title` shows the domain.
 */
export const UrlLink = Mark.create({
  name: 'link',
  priority: 1000,
  inclusive: false,
  addAttributes() {
    return {
      href: { default: null, parseHTML: (el) => el.getAttribute('href') },
      title: { default: null, parseHTML: (el) => el.getAttribute('title') },
    }
  },
  parseHTML() {
    return [{ tag: 'a[href]' }]
  },
  renderHTML({ HTMLAttributes }) {
    const href = HTMLAttributes['href'] == null ? '' : String(HTMLAttributes['href'])
    const domain = domainOf(href)
    return [
      'a',
      mergeAttributes(HTMLAttributes, {
        class: 'ew-url-link',
        title: domain || href,
        rel: 'noopener nofollow noreferrer',
      }),
      0,
    ]
  },
})

/**
 * The `==highlight==` mark (§7.1 rev 0.66). Serializes to `==…==`;
 * parses from the `<mark>` markdown-it emits via the highlight inline
 * rule installed here. Wiki tokens stay opaque inside a highlight (the
 * 156 rule fires on `[`/`!` regardless of the surrounding mark).
 */
export const Highlight = Mark.create({
  name: 'highlight',
  parseHTML() {
    return [{ tag: 'mark' }]
  },
  renderHTML({ HTMLAttributes }) {
    return ['mark', mergeAttributes(HTMLAttributes, { class: 'ew-highlight' }), 0]
  },
  addStorage() {
    return {
      markdown: {
        serialize: { open: '==', close: '==', mixable: true, expelEnclosingWhitespace: true },
        parse: {
          setup(markdownit: MarkdownIt): void {
            installHighlightRule(markdownit)
          },
        },
      },
    }
  },
})

/**
 * Non-fetching image chip (§7.1 rev 0.66, §11.5). An atomic inline node
 * named `image` so tiptap-markdown's default `image` serializer round-
 * trips it to `![alt](url)`. It NEVER renders an `<img>`: the markdown-it
 * image renderer (installed via parse setup) emits a `<span data-ew-image>`
 * instead, and both `renderHTML` and the NodeView draw a chip — a glyph
 * plus the alt/domain label — so nothing ever loads over the network.
 * Activation (routing to the universal viewer) is deferred until that
 * surface exists; `![[…]]` managed embeds are a separate, unchanged path.
 */
export const ImageChip = Node.create({
  name: 'image',
  group: 'inline',
  inline: true,
  atom: true,
  draggable: false,
  addAttributes() {
    return {
      src: { default: null },
      alt: { default: null },
      title: { default: null },
    }
  },
  parseHTML() {
    return [
      {
        tag: 'span[data-ew-image]',
        getAttrs: (el) => ({
          src: (el as HTMLElement).getAttribute('data-src'),
          alt: (el as HTMLElement).getAttribute('data-alt'),
          title: (el as HTMLElement).getAttribute('data-title'),
        }),
      },
    ]
  },
  renderHTML({ HTMLAttributes }) {
    const src = HTMLAttributes['src'] == null ? '' : String(HTMLAttributes['src'])
    const alt = HTMLAttributes['alt'] == null ? '' : String(HTMLAttributes['alt'])
    const title = HTMLAttributes['title'] == null ? '' : String(HTMLAttributes['title'])
    const attrs: Record<string, string> = {
      'data-ew-image': '',
      'data-src': src,
      'data-alt': alt,
      class: 'ew-image-chip',
    }
    if (title) attrs['data-title'] = title
    return ['span', attrs]
  },
  addNodeView() {
    return ({ node }) => {
      const src = node.attrs['src'] == null ? '' : String(node.attrs['src'])
      const alt = node.attrs['alt'] == null ? '' : String(node.attrs['alt'])
      const title = node.attrs['title'] == null ? '' : String(node.attrs['title'])
      const domain = domainOf(src)
      const dom = document.createElement('span')
      dom.className = 'ew-image-chip'
      dom.setAttribute('data-ew-image', '')
      dom.setAttribute('data-src', src)
      dom.title = domain ? `image · ${domain}` : 'image'
      const glyph = document.createElement('span')
      glyph.className = 'ew-image-chip-glyph'
      glyph.innerHTML = IMAGE_GLYPH_SVG
      const label = document.createElement('span')
      label.className = 'ew-image-chip-label'
      label.textContent = alt || title || domain || 'image'
      dom.append(glyph, label)
      return { dom }
    }
  },
  addStorage() {
    return {
      markdown: {
        parse: {
          setup(markdownit: MarkdownIt): void {
            installImageRenderer(markdownit)
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
    // §7.1 URL cluster (AI-IMP-170, rev 0.66): inline links `[text](url)`,
    // autolinks `<url>`, non-fetching image chips `![alt](url)`, and the
    // `==highlight==` mark. These grow the FROZEN dialect by ruling — the
    // freeze guard and round-trip corpus re-pin around them. They are
    // serializer-bearing (unlike the decoration/format-bar extensions), so
    // they live in the base set the corpus exercises.
    UrlLink,
    ImageChip,
    Highlight,
    Markdown.configure(MARKDOWN_DIALECT),
    // §7.1 org-style heading folding — decoration-only, so it rides the
    // base set (both the panel and §8.5 big editor) and never touches
    // serialization (the round-trip corpus proves this).
    HeadingFold,
    // §7.1/§8.8 selection format bar (AI-IMP-149) — a floating popover of
    // rich-text verbs on selection only. Its verbs dispatch mark/node
    // commands but the bar itself adds NO schema and no serializer, so
    // the round-trip corpus exercises it in the base set unchanged; it
    // rides the ONE buffer, so panel and big editor share one bar.
    FormatBar,
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
