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

- [ ] DeletePlacement: removes placement, never purges the node (invariant 11); bare-node case trashes the node in the same command with one command_log row and result flag (test both bare and non-bare paths; non-bare node stays active and appears in Unplaced query).
- [ ] TrashNote: note to trashed, node attachments and bound link target ids intact (§9.4); bound links to it resolve with In Trash state in link queries (§7.1); title_key still reserved (invariant 5 retest while trashed).
- [ ] TrashNode: aggregate per §9.6 — placements excluded from canvas-contents query while trashed, owned canvas + tags + appearance + note reference preserved; shared note stays active (invariant 15 test).
- [ ] TrashCanvas: aggregate per §9.5 (placements, decorations, background, view state preserved recoverably); referenced nodes/notes stay active (invariant 14 test); no bare-node auto-trash (explicit test); root canvas refuses trash (invariant 2).
- [ ] Ordinary queries exclude trashed records by default (invariant 13 + §9.1 sweep test over node library, canvas contents, suggestions, tag views); Trash view query lists trashed records with trashed_at/by.
- [ ] RestoreRecord: restores each aggregate losslessly; note restore triggers the 011 re-resolution sweep via its exposed primitive (invariant 27 test: unresolved token binds on restore); node restore revives placements.
- [ ] PurgeRecord: removes records, converts inbound bound links to broken storing last display text (§7.1 test), broken never re-binds on later same-title create (test); frees anchored connector endpoints; result flags undo invalidation.
- [ ] gc.ts mark-and-sweep: assets referenced by active or trashed appearances/backgrounds are ineligible; purging the last referrer makes the blob hash eligible (test); pending-import and export-lease guards stubbed as always-held sets with TODO wired in 016.
- [ ] Impact summary queries: note (§9.4 counts), canvas (§9.5 counts incl. newly-unplaced and bare), node; Empty Trash eligibility list (§9.7); tests.
- [ ] Trash retention setting readable/writable via settings table, defaults Never (§9.1 test).
- [ ] `pnpm check` green from fresh `pnpm -r build`; commit on worktree branch.

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
