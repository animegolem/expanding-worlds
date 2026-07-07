---
node_id: AI-IMP-156
tags:
  - IMP-LIST
  - Implementation
  - rich-text
  - correctness
kanban_status: in-progress
depends_on: [AI-IMP-146]
parent_epic: [[AI-EPIC-018-rich-text-notes]]
confidence_score: 0.7
date_created: 2026-07-07
date_completed:
---


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

- [ ] New corpus cases committed failing-first (recorded in Issues),
      then green: markdown-active titles round-trip byte-exact and
      `extractWikiLinks` identity is preserved through the factory.
- [ ] Trashed note open: no dirty, no timer, no UpdateNote (unit).
- [ ] Popup destroyed mid-query: no element on body after destroy
      (unit).
- [ ] Flyout open/close cycles leave `rows` at shell size; Enter
      never fires a detached flyout verb (unit or e2e).
- [ ] Gates: `pnpm -r build`, `pnpm -r test`, `pnpm lint`, desktop
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
