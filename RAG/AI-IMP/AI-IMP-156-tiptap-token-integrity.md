---
node_id: AI-IMP-156
tags:
  - IMP-LIST
  - Implementation
  - rich-text
  - correctness
kanban_status: completed
depends_on: [AI-IMP-146]
parent_epic: [[AI-EPIC-018-rich-text-notes]]
confidence_score: 0.7
date_created: 2026-07-07
date_completed: 2026-07-07---


# AI-IMP-156-tiptap-token-integrity

## Summary of Issue #1

Secondary review of the AI-IMP-146/147 merge (BLOCK, empirically
proven): markdown-it parses emphasis/code/strikethrough INSIDE
`[[…]]` tokens, splitting them across marks, so the per-text-node
source-preserving serializer never sees a valid token and
bracket-escapes the fragments. `[[my *starred* title]]` →
`\[\[my *starred* title\]\]`, a fixed point — canonicalize-on-load
commits the corruption silently on first open and the link record
drops from the graph. The §7.1 grammar is purely lexical and allows
`*` `` ` `` `~` in titles; the old editor rendered these as working
links. Secondary findings: canonicalize-on-load arms a save on
TRASHED read-only notes; the suggestion popup can re-render after
destroy (orphaned list on body); flyout children pollute the shared
`rows` keyboard array on every open. Done means: tokens are opaque
to the Markdown parser (byte-exact round-trip for the full grammar,
proven by corpus cases that fail at HEAD), trashed notes never
self-commit, no popup orphan, no rows growth.

### Out of Scope

- Flyout viewport clamping and popup scroll-repositioning (nits —
  AI-IMP-155 absorbs them).
- Richer link hover chip; CodeMirror dep removal (149/150).
- Any dialect change beyond token opacity.

### Design/Approach

The break is upstream of the serializer: fix the PARSE stage. Add a
markdown-it inline rule (registered via tiptap-markdown's
per-extension `parse` seam on the WikiText extension — verify the
exact hook against the installed dist, the serializer seam was
reverse-engineered the same way) that recognizes grammar-valid
`[[…]]` tokens using the domain extractor's rules and emits their
bytes as a single literal text token, consuming them before
emphasis/strikethrough run. Insert after backticks so inline code
still wins (`adv-link-in-inline-code` stays green); code fences are
block-level and unaffected. Embeds: the leading `!` may be consumed
by the image rule's failure path — cover `![[a *b* c]]` explicitly.
RED-GREEN: land the new corpus cases first and show them failing at
HEAD, then fix to green. Trashed guard: suppress `#arm()` in
`open()` when the note is trashed. Popup: `#destroyed` flag set in
`destroy()`, checked after every await. Rows: capture `rows.length`
when a flyout opens and truncate back on `closeSub`.

### Files to Touch

`packages/domain/src/markdown-dialect.ts`: corpus cases —
markdown-active titles (`*`, `**`, backtick, `~~`), same for
embeds, mixed valid+active line.
`apps/desktop/src/renderer/note/editor-markdown.ts`: markdown-it
inline rule on WikiText's parse storage.
`apps/desktop/src/renderer/note/note-editor.ts`: trashed guard.
`apps/desktop/src/renderer/note/suggestions.ts`: destroyed flag.
`apps/desktop/src/renderer/menus/ContextMenu.ts`: rows truncation.
Tests beside each.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [x] New corpus cases committed failing-first (recorded in Issues),
      then green: markdown-active titles round-trip byte-exact and
      `extractWikiLinks` identity is preserved through the factory.
- [x] Trashed note open: no dirty, no timer, no UpdateNote (unit).
- [x] Popup destroyed mid-query: no element on body after destroy
      (unit).
- [x] Flyout open/close cycles leave `rows` at shell size; Enter
      never fires a detached flyout verb (unit or e2e).
- [x] Gates: `pnpm -r build`, `pnpm -r test`, `pnpm lint`, desktop
      e2e hidden (full suite).

### Acceptance Criteria

**GIVEN** a stored note body `Fight the [[*Ancient* Dragon]].`
**WHEN** the note is opened under the TipTap editor
**THEN** the visible text and the saved body keep the literal token
bytes and the link record survives
**AND** no UpdateNote commits unless the body genuinely canonicalizes
**AND** opening the same note from Trash commits nothing.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->

### Root cause (confirmed)

The break was upstream of the serializer, in the PARSE stage.
markdown-it (inside tiptap-markdown) parsed emphasis/code/strikethrough
INSIDE grammar-valid `[[…]]` tokens, splitting each token across marks
so the source-preserving text serializer only ever saw the `[[` / `]]`
fragments — no valid token — and stock-escaped them to `\[\[…\]\]`.
The corrupted form is a fixed point, so canonicalize-on-load committed
it silently on first open, dropping the link record.

### RED run (proof the new cases bite, at HEAD before the parse rule)

`cd apps/desktop && npx vitest run src/renderer/note/editor-markdown.test.ts`
→ **7 failed | 30 passed**. Verbatim:

```
adv-link-md-italic-title:
  Received: "Fight the \[\[my *starred* title\]\] now."
  Expected: "Fight the [[my *starred* title]] now."
adv-link-md-bold-title:
  Received: "A \[\[**bold**\]\] title stays whole."
adv-link-md-code-title:
  Received: "A \[\[a`code`b\]\] title stays whole."
adv-link-md-strike-title:
  Received: "A \[\[~~struck~~\]\] title stays whole."
adv-embed-md-title:
  Received: "Art !\[\[a *b* c\]\] here."
adv-link-md-mixed-line:
  Received: "[[title]] and \[\[**b**\]\] mix"   (first token survives,
                                                 second destroyed)
canonicalize-on-load preserves link identity through the real factory:
  adv-link-md-italic-title: expected [] to deeply equal
    [ 'my *starred* title|' ]   (record LOST)
```

The mixed-line case shows the class-hiding behaviour precisely: the
plain `[[title]]` survives while `[[**b**]]` on the same line is
destroyed. After the fix all 37 cases pass.

### How markdown-it was hooked (exact seam)

tiptap-markdown v0.8.10 calls `parse.setup(markdownit)` on each
extension's `storage.markdown` for EVERY `parse()` (verified in
`dist/tiptap-markdown.es.js`, `MarkdownParser.parse`, lines ~818-840;
it iterates `extensionManager.extensions` and invokes
`getMarkdownSpec(ext).parse.setup.call({editor, options}, this.md)`
before `md.render`). The `WikiText` extension's `parse` storage (which
was `{}`) now carries a `setup(markdownit)` that registers one inline
rule via `md.inline.ruler.before('emphasis', 'ew_wiki_token', …)`.
Because setup runs on every parse, `installWikiTokenRule` guards with a
`__ewWikiTokenRule` marker on the md instance so the rule is added at
most once.

The rule (`wikiTokenInlineRule`): at `[` (or `!` for an embed) it calls
the new domain helper `matchWikiLinkAt(src, bracketPos)`; on a match it
pushes ONE literal `text` token with the verbatim bytes (embed `!`
included) and advances `state.pos` past the token, so emphasis /
strikethrough / image never see inside. Registering `before('emphasis')`
places it AFTER `backticks` and `strikethrough` (both fire only at
`` ` ``/`~`, never at `[`/`!`) and BEFORE `emphasis`/`image`: inline
code still wins (`adv-link-in-inline-code` stays green because backticks
consume the whole code span first) and the embed `!` is claimed here
instead of by the image rule's failure path. Code fences are
block-level and never reach the inline chain.

### Grammar helper added to the domain

`matchWikiLinkAt(body, pos)` in `packages/domain/src/wiki-links.ts`:
matches a single grammar-valid token that starts EXACTLY at `pos`,
returning the same `WikiLinkToken` shape as the extractor. Built from a
shared `TOKEN_PATTERN` (the extractor's global `TOKEN_RE` and this
sticky/`y` regex are both derived from it, so the parse rule and the
extractor cannot drift). Exported from `@ew/domain` and unit-tested
(start-anchored matches, malformed rejection, Markdown-active title
bytes kept whole, agreement with `extractWikiLinks` at every token
start).

### Secondary fixes

- **Trashed guard** (`note-editor.ts` `open()`): the canonicalize-on-load
  `#arm()` is now suppressed when `note.lifecycleState === 'trashed'`.
  `setEditable(false)` gates typing but NOT the programmatic serialize
  diff, so a read-only note whose stored body would canonicalize used to
  arm an autosave and commit. Unit test opens a trashed `*`-bullet note →
  no dirty, no timer, zero `UpdateNote`.
- **Popup post-destroy orphan** (`suggestions.ts`): a `#destroyed` flag
  set in `destroy()`, checked at `refresh()` entry, immediately after the
  `suggestTitles` await, and at `#render` entry. New
  `suggestions.test.ts` drives a real editor with a deferred port,
  destroys the editor while the query is in flight, then resolves it —
  asserts no `[data-testid=note-suggestions]` on body and no
  unhandledrejection. Confirmed the test BITES: with the guard removed it
  fails with a coordsAtPos throw from `#render` on the destroyed view.
- **Flyout `rows` growth** (`ContextMenu.ts` `wireSubmenu`): `closeSub`
  now truncates the shared `rows` array back to the length captured
  before the flyout's children were pushed (and clears a now-dangling
  `focusIndex`). Keyboard nav over the OPEN flyout is unchanged. Proven
  by a targeted assertion added to the existing align-flyout e2e: open →
  toggle-closed via the anchor → `End` focuses a REAL in-menu row, never
  a detached `ctx-align-*` child.

### Friction notes

- Worktree started at 664f7830 (the ticket's base 4285882c was a later
  linear descendant on main); fast-forwarded the worktree branch to
  4285882c before starting. `pnpm install` was needed (fresh worktree
  had no node_modules).
- `pnpm -r test` runs the FULL desktop playwright e2e as part of the
  desktop `test` script. First pass showed 157 passed + 1 flaky
  (`navigation.spec.ts` bookmark-degrade — unrelated to this ticket,
  passed on retry); a second pass was a clean 158/158. All package unit
  suites green (domain 58, canvas-engine 348, persistence 510, desktop
  unit 189). `pnpm lint` clean.
