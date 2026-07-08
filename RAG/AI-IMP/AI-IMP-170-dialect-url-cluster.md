---
node_id: AI-IMP-170
tags:
  - IMP-LIST
  - Implementation
  - rich-text
  - notes
kanban_status: completed
depends_on: [AI-IMP-150]
parent_epic:
confidence_score: 0.6
date_created: 2026-07-07
date_completed: 2026-07-07
---


# AI-IMP-170-dialect-url-cluster

## Summary of Issue #1

Rev 0.66 (owner ruling): the frozen §7.1 dialect grows by exactly
the URL cluster + highlight — inline links `[text](url)`, images
`![alt](url)`, CommonMark autolinks `<url>`, and `==highlight==`.
Raw HTML stays out (`html:false`); code blocks stay unhighlighted;
`linkify` stays false (bare text URLs remain text). Grammar is not
UI: the format bar gains NO new controls. Done means the four
constructs round-trip byte-exact through the shipped editor, the
corpus covers them (including against wiki tokens), the freeze
guard re-pins the grown surface, and foreign notes carrying links/
images now canonicalize WITHOUT loss.

### Out of Scope

- Tables, footnotes, task lists (still outside; DESIGN-QUEUE owns
  the vault-return residue).
- Format-bar buttons for the new marks (owner: no rich controls).
- Any ambient fetch. An image URL renders as a NON-FETCHING chip
  (title/alt + a glyph); activation routes through the universal
  viewer when it exists — no network on note open, ever (§11.5).
- `![[…]]` managed embeds (unchanged; the two image forms coexist).

### Design/Approach

TipTap Link mark (tiptap's own, configured: no autolink-on-type
unless it serializes as `<url>` faithfully; openOnClick off — §7.3
activation semantics stay ours), an Image node whose NodeView is
the non-fetching chip, a small Highlight mark (`==…==` needs a
markdown-it plugin — vendor the standard mark plugin or write the
inline rule beside the 156 wiki-token rule; mind PRECEDENCE against
`[[…]]` opacity: tokens stay opaque inside highlights, corpus case
required). Serializer additions in the tiptap-markdown carrier for
all four. Re-pin: dialect-freeze.test's node/mark lists grow;
MARKDOWN_ROUNDTRIP_CORPUS gains ~10 justified cases (each construct
alone, nested with marks, against wiki tokens, link-vs-token
precedence `[text]([[Note]])` — the 150-flagged sharp edge must now
have a DEFINED outcome, not a silent drop). §7.1 canonicalize-on-
load doctrine unchanged. Wiki-link click-through (Mod-click) must
not regress; URL links get the same hover-chip grammar §7.1 gives
link states, with the chip naming the DOMAIN.

### Files to Touch

`packages/domain/src/markdown-dialect.ts` (corpus).
`apps/desktop/src/renderer/note/editor-markdown.ts` (+ image chip
NodeView, highlight rule), `dialect-freeze.test.ts` (re-pin),
`editor-face.css` + theme tokens (highlight + chip styling).
Note e2e extension.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [x] Four constructs round-trip byte-exact; corpus grown with
      justified cases incl. token precedence; freeze re-pinned.
- [x] Image chip never fetches (test asserts no network/img load).
- [x] `[text]([[Note]])` has a defined, tested outcome.
- [x] Highlight styled on tokens; guards green.
- [x] Gates: `pnpm -r build`, `pnpm -r test`, `pnpm lint`, desktop
      e2e hidden.
- [ ] HUMAN-TESTING entry appended at merge by the lead.

### Acceptance Criteria

**GIVEN** a note pasted from Obsidian carrying `[text](url)`,
`![alt](url)`, `<url>`, and `==marked==`
**WHEN** it opens for the first time
**THEN** every construct survives canonicalization byte-faithfully,
images render as non-fetching chips, and nothing fetches.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->

- **Hand-rolled the three extensions instead of adding npm packages.**
  The offline pnpm store lacks `@tiptap/extension-link`,
  `-image`, `-highlight`, and `markdown-it-mark` (the lockfile is
  supply-chain-pinned; adding deps is not in Files to Touch and touches
  package.json/lockfile). So `UrlLink` (mark `link`), `ImageChip` (node
  `image`), and `Highlight` (mark `highlight`) are built with
  `@tiptap/core` (already a dep). Because tiptap-markdown resolves its
  default serializers BY EXTENSION NAME, the `link`/`image` marks/node
  inherit the correct prosemirror-markdown serializers for free — the
  observable dialect (byte-exact round-trip, frozen node/mark names) is
  identical to using the official packages. The `==highlight==` inline
  rule is ported from markdown-it's own strikethrough (== the standard
  `markdown-it-mark` behaviour) beside the 156 wiki-token rule, exactly
  as the ticket's Approach permits.

- **Autolinks round-trip for free.** prosemirror-markdown's default
  `link` serializer already emits `<url>` when text===href with a
  scheme (`isPlainURL`), so `<url>` survives byte-exact without a custom
  serializer. `linkify:false` keeps bare-text URLs as text.

- **No `<img>` is EVER produced.** Rather than rely on a detached
  element not fetching, the markdown-it `image` renderer is overridden
  to emit `<span data-ew-image>` (never an `<img>` string), which the
  Image node's `parseHTML` claims; `renderHTML` and the NodeView both
  draw a chip. The e2e asserts BOTH zero `<img>` elements and zero
  network requests to the image host on open.

- **`[text]([[Note]])` precedence — DEFINED outcome (the 150 sharp
  edge).** RULING: the Markdown inline link wins. The `[[Note]]` sits in
  the link-DESTINATION slot, i.e. a URL position, so it is a URL, never
  a wiki token. CommonMark destination parsing percent-encodes it, so it
  canonicalizes to `[text](%5B%5BNote%5D%5D)` (a stable fixed point) and
  produces NO wiki-link record. Wiki-links live only in TEXT position; a
  `[[…]]` inside `(…)` is inert. **Deviation from the ticket wording:**
  this case is pinned in a DEDICATED test in `editor-markdown.test.ts`,
  NOT in `MARKDOWN_ROUNDTRIP_CORPUS`. The corpus carries a hard
  link-identity invariant (`canonicalize-on-load preserves link
  identity` runs over EVERY corpus case), and this ruling DELIBERATELY
  changes the extracted token set (a `[[Note]]` token becomes a URL) —
  the whole point of the ruling — so it structurally cannot live in the
  corpus without breaking that invariant. The dedicated test keeps the
  invariant honest for the corpus while nailing the behaviour down. The
  other ~11 URL-cluster corpus cases are all byte-exact fixed points.

- **Highlight needed `mixable: true`.** Without it, `==mark **bold**
  in==` serialized as `==mark ==**==bold==**...` (the mark re-closing
  around the nested span). Adding `mixable` (as strong/em have) restored
  byte-exact nesting.

- **Validation (all green):** `pnpm -r build` OK; `pnpm -r test` — the
  ONE failure was `packages/persistence` `suggestTitles latency`
  (68ms > 50ms NFR) under concurrent load; it PASSES in isolation and is
  untouched by this ticket (no persistence changes). Desktop unit suite
  305 passed (dialect-freeze/editor-markdown/theme all green). `pnpm
  lint` clean. Desktop e2e: 196 passed (hidden windows), including the
  new AI-IMP-170 no-fetch test and all wiki-link regression tests.
