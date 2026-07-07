/**
 * Wiki-link and embed atom nodes for the spike (criterion 2, §7.1 /
 * §4.2). Grammar mirrors packages/domain/src/wiki-links.ts:
 *   [[title]] | [[title|alias]]         -> wikiLink atom
 *   ![[target]] | ![[target|alias]]     -> embed atom
 *
 * tiptap-markdown parses markdown -> HTML -> ProseMirror. So the parse
 * side is a markdown-it inline rule that emits a <span> the node's
 * parseHTML matches; the serialize side writes the raw token back
 * byte-for-byte from stored attrs. State styling (bound / unresolved /
 * broken / bound-trashed) is a class the caller derives — presentation
 * lives on the atom, never in the serialized source.
 */
import { Node, mergeAttributes } from '@tiptap/core'

// title: one+ chars, none of [ ] | \r \n ; alias: none of [ ] \r \n.
// Mirrors TOKEN_RE in packages/domain/src/wiki-links.ts (the embed
// form just requires a leading `!`).
const TITLE = '[^[\\]|\\r\\n]+'
const ALIAS = '[^[\\]\\r\\n]+'

function markdownItWikiLinks(md) {
  md.inline.ruler.before('link', 'ew_wikilink', (state, silent) => {
    const src = state.src
    const start = state.pos
    if (src.charCodeAt(start) !== 0x5b /* [ */) {
      // could be an embed starting with '!'
      if (src.charCodeAt(start) !== 0x21 /* ! */) return false
      if (src.charCodeAt(start + 1) !== 0x5b) return false
    }
    const isEmbed = src.charCodeAt(start) === 0x21
    const open = isEmbed ? start + 1 : start
    if (src.charCodeAt(open) !== 0x5b || src.charCodeAt(open + 1) !== 0x5b) return false
    const re = isEmbed
      ? new RegExp(`^!\\[\\[(${TITLE})(?:\\|(${ALIAS}))?\\]\\]`)
      : new RegExp(`^\\[\\[(${TITLE})(?:\\|(${ALIAS}))?\\]\\]`)
    const m = re.exec(src.slice(start))
    if (!m) return false
    const title = m[1]
    if (title.trim().length === 0) return false // [[   ]] is plain text
    if (!silent) {
      const token = state.push(isEmbed ? 'ew_embed' : 'ew_wikilink', '', 0)
      token.meta = { title, alias: m[2] ?? null }
    }
    state.pos += m[0].length
    return true
  })

  const esc = md.utils.escapeHtml
  md.renderer.rules.ew_wikilink = (tokens, idx) => {
    const { title, alias } = tokens[idx].meta
    const a = alias == null ? '' : ` data-alias="${esc(alias)}"`
    return `<span data-wikilink data-title="${esc(title)}"${a}>${esc(alias ?? title)}</span>`
  }
  md.renderer.rules.ew_embed = (tokens, idx) => {
    const { title, alias } = tokens[idx].meta
    const a = alias == null ? '' : ` data-alias="${esc(alias)}"`
    return `<span data-embed data-title="${esc(title)}"${a}>${esc(alias ?? title)}</span>`
  }
}

/** classFor is injected by the caller so the same atom renders any of
 * the §7.1 display states without touching the source. */
export const WikiLink = Node.create({
  name: 'wikiLink',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  addOptions() {
    return { classFor: () => 'wl-unknown' }
  },
  addAttributes() {
    return {
      title: { default: '' },
      alias: { default: null },
    }
  },
  parseHTML() {
    return [
      {
        tag: 'span[data-wikilink]',
        getAttrs: (el) => ({
          title: el.getAttribute('data-title') ?? '',
          alias: el.getAttribute('data-alias'),
        }),
      },
    ]
  },
  renderHTML({ node, HTMLAttributes }) {
    const label = node.attrs.alias ?? node.attrs.title
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        'data-wikilink': '',
        'data-title': node.attrs.title,
        class: `wikilink ${this.options.classFor(node.attrs.title)}`,
      }),
      label,
    ]
  },
  addStorage() {
    return {
      markdown: {
        serialize(state, node) {
          const a = node.attrs.alias == null ? '' : `|${node.attrs.alias}`
          state.write(`[[${node.attrs.title}${a}]]`)
        },
        parse: { setup: markdownItWikiLinks },
      },
    }
  },
})

export const Embed = Node.create({
  name: 'embed',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  addAttributes() {
    return {
      title: { default: '' },
      alias: { default: null },
    }
  },
  parseHTML() {
    return [
      {
        tag: 'span[data-embed]',
        getAttrs: (el) => ({
          title: el.getAttribute('data-title') ?? '',
          alias: el.getAttribute('data-alias'),
        }),
      },
    ]
  },
  renderHTML({ node, HTMLAttributes }) {
    const label = node.attrs.alias ?? node.attrs.title
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        'data-embed': '',
        'data-title': node.attrs.title,
        class: 'embed',
      }),
      label,
    ]
  },
  addStorage() {
    return {
      markdown: {
        serialize(state, node) {
          const a = node.attrs.alias == null ? '' : `|${node.attrs.alias}`
          state.write(`![[${node.attrs.title}${a}]]`)
        },
        // ew_embed emitted by the shared wikilink markdown-it setup.
        parse: {},
      },
    }
  },
})
