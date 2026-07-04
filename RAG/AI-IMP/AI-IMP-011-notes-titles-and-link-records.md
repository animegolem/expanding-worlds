---
node_id: AI-IMP-011
tags:
  - IMP-LIST
  - Implementation
  - notes
  - links
  - phantoms
kanban_status: planned
depends_on: [AI-IMP-010]
parent_epic: [[AI-EPIC-003-domain-persistence-core]]
confidence_score: 0.8
date_created: 2026-07-04
date_completed:
---

# AI-IMP-011-notes-titles-and-link-records

## Summary of Issue #1

Notes and the wiki-link machinery are the semantic heart of the model
(RFC §4.2, §7.1–7.2) and carry the densest invariants (5, 6, 26–29).
No note commands or link records exist. Implement note command
handlers (CreateNote, UpdateNote, RenameNote with transactional token
rewrite, structured NOTE_TITLE_CONFLICT per §7.7), wiki-link token
extraction, three-state link records, the re-resolution sweep, and
phantom projection + suggestion queries. Done means: every checklist
invariant test passes inside the dispatcher from AI-IMP-010 and `pnpm
check` is green.

### Out of Scope

Trash/restore/purge of notes and broken-link conversion on purge
(AI-IMP-013 — but expose bindUnresolvedFor(note) for its restore
path); FTS indexes (015); editor UI, debounce policy, CodeMirror
(EPIC-005) — this ticket receives already-debounced UpdateNote
commands; node attachment commands (012).

### Design/Approach

Pure parsing in `@ew/domain`: extract `[[Title]]` and `[[Title|alias]]`
tokens with ranges from Markdown (no rendering concerns). Handlers in
`@ew/persistence/src/handlers/notes.ts`. Saving a note (CreateNote/
UpdateNote/RenameNote) refreshes its outbound link records: resolve
each token by title_key against active AND trashed notes → bound;
otherwise unresolved storing title_key + display text (§7.1). Broken
records never re-bind implicitly. The re-resolution sweep (§7.1,
invariant 27): on note create or rename, bind unresolved records
project-wide whose stored title_key matches the resulting title_key —
same transaction. RenameNote rewrites inbound unaliased tokens in
source-note bodies transactionally (aliased display text untouched)
and rebuilds affected link ranges; one user-level command. Phantom
notes are a query, not a record (invariant 28): group unresolved
records by title_key with reference counts and per-source grouping
(§7.2). Suggestion query returns active titles, phantom titles with
counts, trashed titles flagged (§7.2). Conflicts return the §7.7
structured shape. Inverse commands: CreateNote→TrashNote(purge-safe
variant per 013 — until then a DeleteDraftNote internal inverse),
UpdateNote→UpdateNote(prior body), Rename→Rename(prior title).

### Files to Touch

`packages/domain/src/wiki-links.ts` (+ test): token extraction.
`packages/persistence/src/handlers/notes.ts` (+ test): CreateNote,
UpdateNote, RenameNote handlers + link refresh + sweep.
`packages/persistence/src/links.ts` (+ test): link-record CRUD,
resolution, sweep primitives.
`packages/persistence/src/queries-notes.ts` (+ test): getNote,
phantom projection, title suggestions, uses/backlink counts.
`packages/commands/src/payloads/notes.ts`: payload types.
Registry wiring in existing registry/queries index files (append-only
edits).

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and
**think**. Have you validated all aspects are **implemented** and
**tested**?
</CRITICAL_RULE>

- [ ] `@ew/domain` wiki-links.ts: extract tokens with byte/char ranges, alias support, escaping rules documented; table-driven tests including adjacent tokens, unicode titles, `[[a|b]]`.
- [ ] CreateNote handler: title_key uniqueness via schema + structured NOTE_TITLE_CONFLICT carrying existing note id, requested title, title_key, active-or-trashed flag (§7.7 test for both conflict flavors).
- [ ] Link refresh on save: outbound records replaced per token; bound vs unresolved chosen by title_key against active and trashed notes (test: token matching trashed note binds to it, §7.1).
- [ ] Invariant 26 test: after any save, each token has exactly one link record in exactly one state.
- [ ] Re-resolution sweep on CreateNote and RenameNote binds matching unresolved records project-wide in the same transaction (invariant 27 test across two source notes); broken records untouched by sweep (test).
- [ ] Invariant 28 test: phantom projection exists with zero note rows and no title_key reservation; materializing via CreateNote then binds all references (slice item 14 at service level).
- [ ] RenameNote: rewrites inbound unaliased `[[Old]]` tokens to `[[New]]`, preserves `[[Old|alias]]` display text, rebuilds ranges, single command, single revision bump (test verifies bodies, link rows, one command_log row).
- [ ] UpdateNote returns inverse with prior body; Rename returns inverse with prior title; tests round-trip via dispatcher.
- [ ] Queries: getNote(id), suggestions(prefix→title_key match, phantom+trashed flags), phantom view (title, grouped references), notes list; tests.
- [ ] `pnpm check` green from a fresh `pnpm -r build`; commit on worktree branch.

### Acceptance Criteria

**Scenario:** Two notes reference a nonexistent title, then it is
created (RFC slice item 14, service level).
**GIVEN** notes A and B each saved with `[[Ghost Ship]]` tokens.
**WHEN** their saves commit.
**THEN** each token has one unresolved link record storing title_key
"ghost ship" and display text, and the phantom query returns one
phantom grouping both sources.
**WHEN** CreateNote "Ghost Ship" commits.
**THEN** both records become bound to the new note id in the same
command, and the phantom projection is empty.
**WHEN** the new note is renamed to "Ghost Fleet" while note A holds
`[[Ghost Ship]]` unaliased and B holds `[[Ghost Ship|the ship]]`.
**THEN** A's body reads `[[Ghost Fleet]]`, B's alias display text is
unchanged, all link records stay bound, and exactly one command_log
row was appended.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only
comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the
sprint.
You MUST document any failed implementations, blockers or missing
tests.
-->
