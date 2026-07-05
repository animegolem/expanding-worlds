---
node_id: AI-IMP-045
tags:
  - IMP-LIST
  - Implementation
  - notes
  - wiki-links
kanban_status: planned
depends_on: [AI-IMP-044]
parent_epic: [[AI-EPIC-005-notes-links-phantoms]]
confidence_score: 0.8
date_created: 2026-07-05
date_completed:
---

# AI-IMP-045-wiki-link-decorations-and-suggestions

## Summary of Issue #1

Wiki links must render visibly distinct by state (§7.1–7.2) and the
editor must offer title suggestions while typing `[[` (§7.2). Link
records refresh only on save, so the editor needs a live presentation
layer: decorate tokens as the user types, resolved against current
project titles. Done when bound / unresolved / broken / in-trash
tokens are visually distinct in the editor, decorations update as you
type and when other commands change resolution (sweep effects), and
`[[` autocomplete lists active, trashed (marked), and phantom titles
with reference counts.

### Out of Scope

Activation behavior (click-through — AI-IMP-048), phantom view
(AI-IMP-046), rename rewriting (AI-IMP-047). Suggestion-list create
actions (§7.2 defers creation to phantom materialization).

### Design/Approach

A CM6 ViewPlugin parses visible ranges with `extractWikiLinks`
(@ew/domain — same tokenizer persistence uses, so presentation and
records can't drift) and assigns each token a state from a
**resolution cache**: titleKey → {noteId, lifecycle} built from
`listNotes` (+ trashed via suggestTitles pattern) and the note's own
`getNoteLinks` rows for broken records (broken-ness lives only in
records — a token is broken iff its saved record says so; MUST NOT
re-derive by title). Cache refreshes on `project.onChanged` events,
which also delivers re-resolution sweep effects to open editors.
States style as: bound (link color), unresolved (dashed underline,
distinct hue), broken (struck/warning), in-trash (muted + badge).
Autocomplete: @codemirror/autocomplete source triggered inside `[[`,
querying `suggestTitles` (debounced ~100 ms), rendering phantom
indicator + reference count and In Trash marks; selecting inserts
`Title]]`. NFR: suggestion latency imperceptible (<50 ms query) at
10k notes — assert query timing in a persistence perf-ish unit test.

### Files to Touch

`apps/desktop/src/renderer/note/wiki-link-plugin.ts`: new ViewPlugin + theme.
`apps/desktop/src/renderer/note/link-resolution.ts`: resolution cache.
`apps/desktop/src/renderer/note/suggestions.ts`: autocomplete source.
`apps/desktop/src/renderer/NotePane.svelte`: wire extensions.
`packages/persistence/src/queries-notes.ts` (+ test): trashed titles in
suggestTitles if gaps found; latency test.
`apps/desktop/e2e/notes.spec.ts`: decoration + suggestion coverage.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and
**think**. Have you validated all aspects are **implemented** and
**tested**?
</CRITICAL_RULE>

- [ ] ViewPlugin decorates tokens with four visually distinct states;
      unit-testable state assignment function with tests (bound,
      unresolved, broken-from-record, in-trash).
- [ ] Resolution cache built from queries, refreshed on
      project-changed; typing `[[Existing]]` renders bound before any
      save; materializing elsewhere re-renders open editors (e2e).
- [ ] Broken state comes only from saved link records, never derived
      from titles (test: active note with same title_key as a broken
      record's display text still renders broken).
- [ ] `[[` autocomplete on suggestTitles: phantom indicator +
      reference count, In Trash mark, insertion completes the token;
      e2e exercises pick-from-list.
- [ ] suggestTitles latency test at 10k synthetic notes (<50 ms).
- [ ] Gates: full build/test/lint/e2e green.

### Acceptance Criteria

**GIVEN** a note body containing a bound token, an unresolved token,
and a token whose record is broken
**WHEN** the note opens in the editor
**THEN** the three tokens render visually distinct per state.

**GIVEN** the user types `[[Kn`
**WHEN** the suggestion list opens
**THEN** it contains matching active titles and phantom titles with a
phantom indicator and reference count
**AND** selecting one completes a well-formed `[[Title]]` token that
renders bound.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->
