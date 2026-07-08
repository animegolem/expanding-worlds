/**
 * The project's canonical Markdown dialect (RFC-0001 §7.1: "the
 * editor's dialect is frozen as the project's canonical Markdown
 * flavour"). These are the tiptap-markdown carrier knobs the AI-IMP-144
 * spike tuned and the owner ratified; AI-IMP-146 ships them, AI-IMP-150
 * documents the freeze. ONE exported object so the freeze has a single
 * source of truth — the editor factory (apps/desktop editor-markdown.ts)
 * consumes it verbatim and the round-trip corpus below is its permanent
 * regression gate.
 *
 * Pure data: this module stays free of editor imports so the dialect
 * remains a domain-level contract, testable anywhere.
 */
export const MARKDOWN_DIALECT = {
  /** No raw-HTML passthrough — the §7.8 metadata fence never enters
   * the editor anyway (strip seam), and prose stays plain. */
  html: false,
  /** No blank line between list items. */
  tightLists: true,
  /** `-` is the one bullet; `*` bullets normalize on first open. */
  bulletListMarker: '-' as const,
  /** Bare URLs stay text. */
  linkify: false,
  /** Single newlines are soft wraps, not hard breaks (CommonMark). */
  breaks: false,
  /** Clipboard stays plain text both ways. */
  transformPastedText: false,
  transformCopiedText: false,
} as const

export interface MarkdownRoundTripCase {
  name: string
  /** A plausible §7.1 prose body as a user (or older tool) wrote it. */
  body: string
  /**
   * The body's canonical form in the frozen dialect —
   * `serialize(parse(body))` through the shipped editor factory. Equal
   * to `body` for the byte-stable majority; the divergent cases are the
   * accepted dialect normalizations (render-identical, applied ONCE at
   * first open per §7.1 canonicalize-on-load). Every canonical form is a
   * FIXED POINT: `serialize(parse(canonical)) === canonical` — that
   * fixed point is what makes canonicalization once-per-note.
   *
   * These strings were generated empirically from the real
   * tiptap-markdown carrier plus the source-preserving wiki-token text
   * serializer (AI-IMP-146/147 lead ruling: literal `[[...]]` bytes stay
   * in the carrier, so valid tokens round-trip byte-exact and never get
   * bracket-escaped; malformed sequences take ordinary Markdown escaping).
   */
  canonical: string
}

/**
 * The AI-IMP-144 spike corpus, landed as the permanent §7.1 dialect
 * regression gate (consumed by the editor round-trip test in apps/desktop,
 * which runs it through the real shipped editor factory).
 */
export const MARKDOWN_ROUNDTRIP_CORPUS: readonly MarkdownRoundTripCase[] = [
  stable('headings-1-6', '# H1\n\n## H2\n\n### H3\n\n#### H4\n\n##### H5\n\n###### H6'),
  stable('paragraphs', 'First paragraph with words.\n\nSecond paragraph here.'),
  stable('bullet-list', '- one\n- two\n- three'),
  stable('ordered-list', '1. first\n2. second\n3. third'),
  stable('nested-list', '- parent\n  - child\n  - child two\n- sibling'),
  stable('inline-emphasis', 'Some **bold**, some *italic*, and ~~struck~~ text.'),
  stable('inline-code', 'Call `foo()` then `bar()` inline.'),
  stable('code-fence-js', '```js\nconst x = 1\nfunction f() { return x }\n```'),
  {
    // CommonMark lazy continuation: both lines are ONE paragraph in the
    // quote; the dialect joins them (render-identical).
    name: 'blockquote',
    body: '> a quoted line\n> second quoted line',
    canonical: '> a quoted line second quoted line',
  },
  stable('wikilink-plain', 'See [[Dragon]] and [[Ancient City]] for lore.'),
  stable('wikilink-aliased', 'The [[Old Name|new label]] moved on.'),
  stable('wikilink-multibar', 'Edge case [[a|b|c]] keeps later bars.'),
  stable('embed', 'Here is art: ![[hero.png]] and ![[map.png|the map]].'),
  stable('links-in-list', '- [[Alpha]]\n- [[Beta|second]]\n- plain item'),
  stable('wikilink-in-bold', 'A **bold [[Link]] inside** emphasis.'),
  // AI-IMP-150: a wiki token in every mark/node context the shipped
  // editor can produce (the 156 opacity rule keeps the token whole no
  // matter which mark or block wraps it — bold was the only context the
  // spike pinned). Each is byte-stable, so link identity survives
  // canonicalize-on-load in every surface the format bar / typing yields.
  stable('wikilink-in-italic', 'A *italic [[Link]] inside* run.'),
  stable('wikilink-in-strike', 'A ~~struck [[Link]] here~~ okay.'),
  stable('wikilink-in-heading', '# Heading with [[Link]] inside'),
  stable('wikilink-in-ordered-list', '1. [[Alpha]]\n2. [[Beta|b]]\n3. plain'),
  stable('wikilink-in-blockquote', '> quote with [[Link]] here'),
  stable('embed-in-heading', '## Art ![[hero.png]] shown'),
  // AI-IMP-150: combined bold+italic mark (`***`), producible by stacking
  // the format bar's bold and italic verbs on one selection; and an
  // ordered list whose `start` attr is not 1 (the orderedList node keeps
  // the numbering). Both byte-stable, both in the frozen grammar.
  stable('triple-emphasis', 'This is ***bold italic*** text.'),
  stable('ordered-list-start', '3. three\n4. four'),
  stable('unicode', '# Café ☕ 日本語\n\nEmoji 🐉 and accents: naïve, résumé.'),
  stable('hr-in-prose', 'Above the line.\n\n---\n\nBelow the line.'),
  stable(
    'kitchen-sink',
    '# Title\n\nIntro with [[Link]] and **bold**.\n\n' +
      '## Section\n\n- item [[A|a]]\n- item ![[img.png]]\n\n' +
      '> quote\n\n```py\nprint("hi")\n```\n\nEnd.',
  ),
  // --- adversarial ---
  stable('adv-link-in-code-fence', '```\nnot a [[Link]] here\n```'),
  stable('adv-link-in-inline-code', 'Literal `[[NotALink]]` stays text.'),
  // Markdown-active title bytes (§7.1 grammar is lexical: `*` `**` `` ` ``
  // `~~` are legal title characters). markdown-it must NOT parse
  // emphasis/code/strikethrough INSIDE a grammar-valid token — the token
  // is opaque and its bytes round-trip verbatim (AI-IMP-156). Byte-stable,
  // so link identity survives canonicalize-on-load.
  stable('adv-link-md-italic-title', 'Fight the [[my *starred* title]] now.'),
  stable('adv-link-md-bold-title', 'A [[**bold**]] title stays whole.'),
  stable('adv-link-md-code-title', 'A [[a`code`b]] title stays whole.'),
  stable('adv-link-md-strike-title', 'A [[~~struck~~]] title stays whole.'),
  // Embed prefix `!` + an active-title token must round-trip byte-exact
  // (the `!` may be consumed by markdown-it's image failure path).
  stable('adv-embed-md-title', 'Art ![[a *b* c]] here.'),
  // A valid token and an active-title token on ONE line: the second must
  // not be destroyed by emphasis parsing (regressed at HEAD before 156).
  stable('adv-link-md-mixed-line', '[[title]] and [[**b**]] mix'),
  // AI-IMP-150: the 156 fear (an active-title token) INSIDE a mark
  // context — code-vs-token precedence must hold even when an emphasis
  // span wraps the token. The `[[**b**]]` token stays opaque; the outer
  // `*…*` italic delimiters are the only emphasis parsed. Byte-stable.
  stable('adv-active-title-in-italic', 'see *a [[**b**]] c* here'),
  {
    // Emphasis normalizes to the `*` family (single `*` for italic,
    // double `**` for bold).
    name: 'adv-underscore-emphasis',
    body: 'Prefer _underscore italic_ and __underscore bold__.',
    canonical: 'Prefer *underscore italic* and **underscore bold**.',
  },
  {
    // Trailing-space hard break normalizes to the backslash form.
    name: 'adv-trailing-spaces-hardbreak',
    body: 'line one  \nline two after hard break',
    canonical: 'line one\\\nline two after hard break',
  },
  stable('adv-escaped-chars', 'Escaped \\*not italic\\* and \\[not a link\\].'),
  {
    name: 'adv-star-bullets',
    body: '* star one\n* star two',
    canonical: '- star one\n- star two',
  },
  {
    name: 'adv-nested-emphasis',
    body: 'Mix of **bold _and italic_ together**.',
    canonical: 'Mix of **bold *and italic* together**.',
  },
  {
    // Blank-line runs collapse to one paragraph break.
    name: 'adv-consecutive-blanklines',
    body: 'Para one.\n\n\n\nPara two after many blanks.',
    canonical: 'Para one.\n\nPara two after many blanks.',
  },
  // AI-IMP-170: the §7.1 URL cluster + highlight (rev 0.66 — the frozen
  // dialect grows by exactly these four constructs). Each round-trips
  // BYTE-EXACT through the shipped editor (all stable fixed points), so
  // a foreign note carrying links/images/highlights canonicalizes on
  // first open WITHOUT loss. `linkify:false`/`html:false` are unchanged,
  // so bare-text URLs and raw HTML stay text; only the explicit grammar
  // (`[text](url)`, `<url>`, `![alt](url)`, `==…==`) is recognized.
  stable('link-inline', 'See [the site](https://example.com) here.'),
  stable('link-in-bold', 'A **bold [link](https://example.com) here** ok.'),
  // CommonMark autolink: the default link serializer detects text===href
  // with a scheme and emits `<url>`, so it survives verbatim (NOT
  // rewritten to `[url](url)`).
  stable('autolink', 'Visit <https://example.com> now.'),
  // A markdown image is a NON-FETCHING chip node; it still serializes to
  // `![alt](url)`. The `![[…]]` embed is a DIFFERENT construct (a
  // source-preserving wiki token) and the two coexist on one line.
  stable('image-inline', 'Art ![a cat](https://example.com/cat.png) here.'),
  stable(
    'image-and-embed',
    '![web](https://example.com/a.png) vs ![[local.png]] coexist.',
  ),
  stable('highlight', 'Some ==marked== text.'),
  // `==…==` is `mixable`, so nested emphasis interleaves without the mark
  // re-closing around the inner span.
  stable('highlight-nested-bold', 'A ==mark with **bold** in== it.'),
  // Wiki tokens stay OPAQUE inside a highlight (the 156 rule fires on
  // `[`/`!` regardless of the surrounding mark) — so link identity
  // survives canonicalize-on-load even wrapped in `==…==`.
  stable('highlight-with-token', 'A ==highlight [[Link]] inside== it.'),
  // The 156 fear (an active-title token whose bytes are Markdown-active)
  // INSIDE a highlight: `[[**b**]]` stays one opaque token, the `==`
  // delimiters are the only mark parsed. Byte-stable.
  stable('highlight-active-title-token', 'A ==mark [[**b**]] token== here.'),
  // A URL link and a wiki token on ONE line: the markdown link claims
  // `[site](url)`, the `[[Note]]` stays a source-preserving wiki token.
  stable('link-and-token', '[site](https://example.com) and [[Note]] both.'),
  // All four new constructs on one line, byte-exact.
  stable(
    'url-cluster-all-four',
    'Mix [a](https://ex.com/x), <https://ex.com>, ![i](https://ex.com/i.png), ==hot==.',
  ),
  // --- malformed wiki sequences (grammar: plain text, never tokens).
  // They are NOT valid tokens, so the source-preserving serializer does
  // NOT keep their brackets — they take ordinary Markdown escaping. The
  // escaped forms still extract zero tokens (the domain grammar has no
  // escape syntax, and `\[\[` contains no `[[` pair).
  {
    name: 'adv-malformed-blank-title',
    body: 'A [[   ]] stays text.',
    canonical: 'A \\[\\[ \\]\\] stays text.',
  },
  {
    name: 'adv-malformed-empty-title',
    body: 'A [[|x]] stays text.',
    canonical: 'A \\[\\[|x\\]\\] stays text.',
  },
  {
    name: 'adv-malformed-unclosed',
    body: 'An unclosed [[x token.',
    canonical: 'An unclosed \\[\\[x token.',
  },
]

function stable(name: string, body: string): MarkdownRoundTripCase {
  return { name, body, canonical: body }
}
