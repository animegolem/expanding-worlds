---
node_id: AI-IMP-013
tags:
  - IMP-LIST
  - Implementation
  - lifecycle
  - trash
  - purge
kanban_status: planned
depends_on: [AI-IMP-011, AI-IMP-012]
parent_epic: [[AI-EPIC-003-domain-persistence-core]]
confidence_score: 0.75
date_created: 2026-07-04
date_completed:
---

# AI-IMP-013-lifecycle-trash-restore-purge

## Summary of Issue #1

RFC §9 defines recoverable deletion as a lifecycle state with
aggregate preservation, and invariants 11, 13–15 plus the purge/GC
rules (§9.7–9.8) depend on it. Nothing implements DeletePlacement's
bare-node rule, TrashNote/TrashNode/TrashCanvas aggregates,
RestoreRecord, PurgeRecord, broken-link conversion, or GC
eligibility. Implement the full lifecycle command set with impact
summaries as typed queries. Done means: checklist invariant tests
pass through the dispatcher and `pnpm check` is green.

### Out of Scope

Trash UI, retention scheduler execution (setting is stored; automatic
purge wiring is EPIC-007), undo-stack invalidation on purge (EPIC-007
consumes the purge events this ticket emits), asset blob deletion on
disk (mark-and-sweep eligibility computed here; file deletion joins
014's storage in AI-IMP-016 recovery testing), export.

### Design/Approach

Handlers in `@ew/persistence/src/handlers/lifecycle.ts` using the
lifecycle_state/trashed_at/trashed_by_command_id columns from 009.
DeletePlacement (§9.2): removes the placement; if the node is bare (no
note, no tags, no owned canvas, no other placements) it is trashed in
the same user-level command, and the result flags it so UI can offer
Keep in Project (restore-without-placement is RestoreRecord on the
node). Trashing never cascades to shared notes (invariant 15) or
referenced nodes (invariant 14). TrashCanvas preserves the canvas
aggregate (§9.5) and is not last-placement deletion — no bare-node
auto-trash. TrashNode preserves placements/canvas/tags/appearance/note
reference as one aggregate (§9.6); ordinary queries exclude trashed
records by default (§9.1) — audit and fix queries from 011/012.
RestoreRecord reverses aggregates; trashed notes keep title_key
reservation so restore never conflicts (§9.7). PurgeRecord converts
inbound bound links to broken with last-known display text (§7.1),
frees anchored connector endpoints via 012's helper, and computes GC
eligibility (§9.8): resources referenced by active or trashed records
are never eligible; mark-and-sweep over asset blob references
returning an eligible set (no file IO here). Impact-summary queries
(§9.4–9.5) return the counts the confirmations need. Every handler
returns inverses (Trash↔Restore); purge returns no inverse (it
invalidates — flagged in result).

### Files to Touch

`packages/commands/src/payloads/lifecycle.ts`: payload types.
`packages/persistence/src/handlers/lifecycle.ts` (+ test): all trash/
restore/purge/delete-placement handlers.
`packages/persistence/src/gc.ts` (+ test): reference walk,
eligibility set.
`packages/persistence/src/queries-lifecycle.ts` (+ test): trash view,
impact summaries.
`packages/persistence/src/queries*.ts`: audit default trashed
exclusion (small edits allowed; do not restructure 011/012 logic).
Registry wiring (append-only edits).

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and
**think**. Have you validated all aspects are **implemented** and
**tested**?
</CRITICAL_RULE>

- [x] DeletePlacement: removes placement, never purges the node (invariant 11); bare-node case trashes the node in the same command with one command_log row and result flag (test both bare and non-bare paths; non-bare node stays active and appears in Unplaced query).
- [x] TrashNote: note to trashed, node attachments and bound link target ids intact (§9.4); bound links to it resolve with In Trash state in link queries (§7.1); title_key still reserved (invariant 5 retest while trashed).
- [x] TrashNode: aggregate per §9.6 — placements excluded from canvas-contents query while trashed, owned canvas + tags + appearance + note reference preserved; shared note stays active (invariant 15 test).
- [x] TrashCanvas: aggregate per §9.5 (placements, decorations, background, view state preserved recoverably); referenced nodes/notes stay active (invariant 14 test); no bare-node auto-trash (explicit test); root canvas refuses trash (invariant 2).
- [x] Ordinary queries exclude trashed records by default (invariant 13 + §9.1 sweep test over node library, canvas contents, suggestions, tag views); Trash view query lists trashed records with trashed_at/by.
- [x] RestoreRecord: restores each aggregate losslessly; note restore triggers the 011 re-resolution sweep via its exposed primitive (invariant 27 test: unresolved token binds on restore); node restore revives placements.
- [x] PurgeRecord: removes records, converts inbound bound links to broken storing last display text (§7.1 test), broken never re-binds on later same-title create (test); frees anchored connector endpoints; result flags undo invalidation.
- [x] gc.ts mark-and-sweep: assets referenced by active or trashed appearances/backgrounds are ineligible; purging the last referrer makes the blob hash eligible (test); pending-import and export-lease guards stubbed as always-held sets with TODO wired in 016.
- [x] Impact summary queries: note (§9.4 counts), canvas (§9.5 counts incl. newly-unplaced and bare), node; Empty Trash eligibility list (§9.7); tests.
- [x] Trash retention setting readable/writable via settings table, defaults Never (§9.1 test).
- [x] `pnpm check` green from fresh `pnpm -r build`; commit on worktree branch.

### Acceptance Criteria

**Scenario:** RFC slice items 20–22 at service level.
**GIVEN** a canvas holding placements of two nodes, one bare image
node placed once, and a note linked from another note.
**WHEN** the bare node's placement is deleted.
**THEN** the node is trashed in the same command and Keep in Project
(RestoreRecord) returns it active and unplaced, findable via the
Unplaced query.
**WHEN** the note is trashed.
**THEN** inbound links report In Trash, its title stays reserved, and
restore rebinds nothing because bindings never broke.
**WHEN** the note is purged.
**THEN** inbound links become broken with display text, creating a new
note with the same title binds nothing implicitly, and the note's
now-unreferenced asset appears in the GC-eligible set.

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

- **DeleteDecoration stance (012 handoff):** kept the hard delete with
  a full-state CreateDecoration inverse. §9.2's placement precedent —
  removal "normally recovered through command undo," no user-visible
  Trash entry — fits decorations even better: they are canvas-local
  visual rows with no capabilities (invariant 16) and a one-row
  aggregate, so command undo is lossless, and Trash-view entries for
  strokes would be noise. Canvas purge hard-deletes them with the
  aggregate.
- **Purge precondition:** PurgeRecord requires `lifecycle_state =
  'trashed'` (§9.7 frames purge as Delete Permanently over Trash);
  active records return RECORD_NOT_TRASHED. This also makes the root
  node/canvas unpurgeable (they can never be trashed), with the schema
  delete-triggers as backstop.
- **Purge ordering (FK-safe):** connector anchors released for every
  placement leaving rendering permanently, before row deletion;
  decorations before decoration_groups; note purge converts inbound
  bound links to broken and clears node.note_id before deleting the
  note row. tag_assignment/decoration_group deletions have no
  AffectedRecord kind and are not individually listed.
- **Broken display_text derivation:** bound records store no display
  text, so purge re-reads each source body and matches tokens by
  range_start (raw token title preserved, aliases keep their title
  part); falls back to the purged note's title if a range no longer
  matches.
- **GC interpretation:** the ticket's "hashes referenced by no asset
  row" is not computable without file IO (blob hashes are only known
  through asset rows), and asset rows are shared dedupe metadata
  (§4.7) that survive purges. Implemented eligibility: a content hash
  is eligible when NO asset row carrying it is referenced by any node
  appearance or canvas background in ANY lifecycle state and no guard
  holds it. Guards query pending_imports (state <> 'committed') and
  derivative_jobs (state = 'queued') for real — the 0002 tables exist
  — deviating from the ticket's "stubbed as always-held sets"; only
  the export-lease guard is the named empty stub
  (`exportLeaseGuardedHashes`, EPIC-008). AI-IMP-016's sweep deletes
  blob files and their orphaned asset rows.
- **CreateNote inverse switched** from PurgeDraftNote to TrashNote
  (the AI-IMP-011 handoff): undo of CreateNote can no longer fail once
  links or nodes reference the note. Redo is RestoreRecord via
  TrashNote's inverse. Wrinkle: after undoing a create, the title
  stays reserved by the trashed note until restore or purge.
  PurgeDraftNote remains registered as a standalone command;
  notes.test.ts updated minimally (inverse expectation + direct
  PurgeDraftNote invocation).
- **Result flags without type changes:** HandlerOutcome is strictly
  {affected, inverse}, so the bare-node-trash flag is the node record
  appearing in DeletePlacement's `affected` (absent otherwise), and
  undo invalidation is `inverse: null` on PurgeRecord with `affected`
  naming every removed/converted record. No @ew/commands envelope
  change needed.
- **Acceptance "note's now-unreferenced asset":** the Phase 1 schema
  gives notes no direct asset reference, so the acceptance test
  embodies the note in a node with an image appearance; the hash
  enters the GC-eligible set when purging that node removes the last
  appearance reference.
- **Query audit fixes:** getCanvasContents returns [] for trashed
  canvases and joins out trashed nodes' placements; listNodeLibrary
  and getTagView placement counts join out placements on trashed
  canvases so §9.5 newly-unplaced nodes surface in Unplaced. listNotes
  /listNodes/suggestTitles were already compliant (suggestTitles keeps
  the In Trash flag per §7.2).
- **Validation:** `pnpm -r build && pnpm -r --filter '!@ew/desktop'
  test && pnpm lint` green — persistence 210 tests / 23 files (from
  175 / 20). `pnpm check:spike` fails in this fresh worktree only
  because spike/'s separate npm-prefix deps are not installed; spike/
  is untouched by this ticket.
