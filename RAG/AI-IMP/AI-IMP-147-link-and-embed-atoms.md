---
node_id: AI-IMP-147
tags:
  - IMP-LIST
  - Implementation
  - rich-text
  - links
kanban_status: completed
depends_on: [AI-IMP-146]
parent_epic: [[AI-EPIC-018-rich-text-notes]]
confidence_score: 0.6
date_created: 2026-07-07
date_completed: 2026-07-07
---


# AI-IMP-147-link-and-embed-atoms

## Summary of Issue #1

EPIC-018 FR-2, as amended by the lead ruling (Option B, 2026-07-07
brief; co-landed with AI-IMP-146 on `agent/imp-146-147-tiptap`).
Wiki-links `[[Title]]`/`[[Title|label]]` and embeds `![[...]]`
render as SOURCE-PRESERVING decorations, NOT label-atoms: the
literal token text stays visible in the buffer (matching shipped
UX and notes.spec's raw-token assertion), serializes byte-exact
(a custom text-node serializer emits grammar-valid tokens verbatim
— stock escaping would corrupt them to `\[\[…\]\]`), styled per
§7.1 link states (bound blue · unresolved purple · trashed grey ·
broken red strikethrough per rev 0.55, wavy retired), Mod+Click
activates per the existing grammar, the `[[` suggestion popup
ports (§7.2 completions — custom list, never `<datalist>`), and
every state advertises the follow gesture on hover. Done means
link behavior in the new editor is indistinguishable from shipped
plus the ratified state styling.

### Out of Scope

- Embed RENDERING beyond the atom chip (image-embed display rides
  the EPIC-008 export/§4.2 activation).
- Link resolution semantics (§7.1 unchanged — display only).

### Design/Approach

Port the spike's atom nodes; `classFor` feeds from the existing
`linkDisplayState` read model; serialize parity tests from the
corpus guard the atoms forever. Suggestion popup: reuse the
existing suggestion data source; TipTap suggestion plugin renders
the same custom list component (or a port). Hover chip rides the
shipped tooltip singleton with the ratified state copy.

### Files to Touch

`apps/desktop/src/renderer/note/` atom extensions + suggestion
wiring (+ units).
Existing link e2e (notes/links specs) must pass; extend for
strikethrough-broken + hover chip states.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [x] Tokens serialize byte-exact (corpus parity: all valid
      wiki-link/embed cases byte-STABLE through the real editor
      factory; source-preserving per the lead ruling — decorations
      over literal text, not atoms).
- [x] Four states styled per rev 0.55 incl. broken strikethrough
      (`line-through`, wavy retired — no e2e asserted wavy, so no
      assertion changed); follow gesture advertised on hover on
      every state; Mod+Click activates (existing activation e2e
      green: bound fly-to, unresolved phantom, broken panel,
      bound-trashed open).
- [x] `[[` suggestions: bespoke DOM list with keyboard model
      (Up/Down/Enter/Tab/Escape), mousedown-apply, stale-response
      guard; never a `<datalist>` (suggestions e2e green incl.
      phantom indicator + ref count).
- [x] Existing link e2e green (selector-only updates per the
      co-landing ruling; `data-link-title`/`data-link-state`
      untouched). No new state assertions were needed: all four
      states were already asserted; the strikethrough change is
      CSS-only (see Issues).
- [x] Gates: `pnpm -r build`, `pnpm -r test` (150/150 e2e hidden),
      `pnpm lint` — all green 2026-07-07 (one shared run with
      AI-IMP-146; co-landed).

### Acceptance Criteria

**GIVEN** a note with bound/unresolved/trashed/broken links
**THEN** each renders its decorated state over the literal token
text with the follow gesture advertised on hover, activates on
Mod+Click, and the saved body is byte-identical to its source.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->

Checked as co-landed with AI-IMP-146 by lead ruling (Option B,
2026-07-07 brief), which resolved this ticket's atom design against
the shipped UX: the spike's label-atoms would hide the raw
`[[Harbor]]` text (breaking notes.spec's raw-token assertion and the
live-typing completion flow), so the wiki layer ships as
SOURCE-PRESERVING inline decorations (`wiki-link-plugin.ts`,
ProseMirror `Decoration.inline` driven by the same `extractWikiLinks`
+ `LinkResolution` inputs as before). The load-bearing discovery:
tiptap-markdown's stock text serializer escapes brackets
(`[[Dragon]]` → `\[\[Dragon\]\]`), so byte-exactness required a
custom `text` node serializer (`editor-markdown.ts` WikiText,
StarterKit configured `text:false`) that emits grammar-valid tokens
verbatim and escapes everything else stock — proven by the corpus
(valid tokens byte-stable; malformed sequences take ordinary
escaping, still extracting zero tokens).

Broken links render red `line-through` per rev 0.55; no e2e had
asserted the old wavy underline (it was CSS-only), so no assertion
update was needed — noted per the ruling's instruction.

Hover: every decorated state carries the shipped
`title="⌘/Ctrl-click to follow"` advertisement (the §7.3 rev 0.16
obligation, exactly what the CodeMirror layer shipped). A richer
§8.2-style hover CHIP (tooltip-singleton card with state copy) was
NOT built — shipped UX parity was the ruling's bar; flagged for the
lead in case §8.2 wants a follow-up.

Embed tokens (`![[…]]`) are covered by the serializer + corpus
(byte-exact) and render via the same decoration path when their
inner token parses; no embed-specific chip/rendering was added (out
of scope — EPIC-008 rides).

Suggestion popup rides `document.body` with `position:fixed`
anchored at `coordsAtPos` (escapes panel overflow); styles are
unscoped `:global` in NotePanel.svelte using theme tokens only.