---
node_id: AI-IMP-048
tags:
  - IMP-LIST
  - Implementation
  - notes
  - navigation
kanban_status: completed
depends_on: [AI-IMP-045]
parent_epic: [[AI-EPIC-005-notes-links-phantoms]]
confidence_score: 0.8
date_created: 2026-07-05
date_completed: 2026-07-05
---

# AI-IMP-048-link-activation-and-degraded-links

## Summary of Issue #1

Links decorate but do not activate. §7.3: activating a bound link
loads the note immediately and unconditionally, then resolves space
by location count — zero: canvas unchanged + "no placed locations"
indicator; one: center and highlight the placement; many: keep the
viewport (chooser deferred to EPIC-006 — non-blocking "N locations"
notice instead). §7.1 degraded states: a bound-to-trashed target
opens with an In Trash banner and Restore; a broken link offers
Create New from display text and, when an active title_key match
exists, Relink This Occurrence. Done when §17 items 13 and 22 pass
and zero/one/many behavior is covered (item 16's chooser deferred).

### Out of Scope

The grouped location chooser and cross-canvas navigation/highlight
mode (§7.4–7.5, EPIC-006). Purge UI beyond what the broken-link e2e
needs (EPIC-007 owns Trash surfaces).

### Design/Approach

Activation = Mod-click or click on a decorated token (plugin event →
pane controller). Bound: load note (pane mode note), then
`getNoteUses`: zero → status notice; one location on the active
canvas → CameraFlight to the placement + select/highlight it; one
location on another canvas → same notice path as many for now
(navigation is EPIC-006; noted in ticket and epic). Many → keep
viewport, non-blocking notice via the existing ew-board-notice
channel. Bound-to-trashed: `getNote` returns lifecycleState trashed →
read-only editor + In Trash banner with Restore (RestoreRecord); Purge
and Start Fresh is a MAY, skipped. Broken: activation panel offers
Create Note from display text and Relink when an active note matches
the display text's title_key. DESIGN CORRECTION (caught at
implementation): a text rewrite cannot relink — refreshNoteLinks
deliberately keeps a title_key broken across saves (invariant 27),
so the RECORD must flip. New user-level command `RelinkBrokenLinks
{ sourceNoteId, displayTitle, targetNoteId | create }` flips the
source's broken records for that key to bound (creating the target
in the same transaction on the recreate path), validating the
target's title_key equals the broken key so the next save
re-resolves identically; internal inverse `BreakNoteLinks` restores
broken state for undo. Relink granularity is per (source,
title_key) — occurrences are not individually tracked, matching
refreshNoteLinks. Unresolved activation already opens the phantom
view (AI-IMP-046).

### Files to Touch

`apps/desktop/src/renderer/note/wiki-link-plugin.ts`: activation events.
`apps/desktop/src/renderer/note/note-editor.ts`: activation routing.
`apps/desktop/src/renderer/NotePane.svelte`: In Trash banner,
broken-link affordances, read-only state.
`apps/desktop/src/renderer/Workspace.svelte` / `canvas/host.ts`: flyTo +
highlight hook for the one-location case.
`apps/desktop/e2e/notes.spec.ts`: items 13 and 22, zero/one/many.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and
**think**. Have you validated all aspects are **implemented** and
**tested**?
</CRITICAL_RULE>

- [x] Bound-link activation loads the target note immediately in all
      location cases (e2e asserts note pane content before camera
      settles).
- [x] Zero locations: canvas untouched, "no placed locations" notice.
- [x] One location on the active canvas: camera flight centers the
      placement and it is selected/highlighted (poll for eased
      camera per EPIC-010 lesson).
- [x] Many locations: viewport kept, non-blocking "N locations"
      notice; no chooser.
- [x] Trashed target: read-only note + In Trash banner; Restore
      re-enables editing and the link renders bound-normal.
- [x] Broken link (after PurgeRecord): distinct render; activation
      offers Create Note from display text and, when an active
      title_key match exists, relink via the RelinkBrokenLinks
      command (see Design correction); both paths e2e-covered
      (item 22), plus unit tests incl. inverse round-trip.
- [x] Gates: full build/test/lint/e2e green.

### Acceptance Criteria

**GIVEN** a bound link to a note whose node has one placement on the
active canvas
**WHEN** the user activates it
**THEN** the note loads immediately
**AND** the camera centers the placement and highlights it.

**GIVEN** a link bound to a trashed note
**WHEN** activated
**THEN** the note opens read-only with In Trash and Restore
**AND** after Restore the note is editable and the token renders bound.

**GIVEN** a broken link whose display text matches an active note
**WHEN** activated
**THEN** the user may create a new note from the text or relink this
occurrence, and relinking rewrites only that token.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->
The load-bearing find: the ticket's original relink design (rewrite
the token text) was WRONG — refreshNoteLinks keeps a title_key
broken across saves precisely so titles never re-bind implicitly
(invariant 27), so a text rewrite leaves the link broken forever.
Fixed with a new user-level command RelinkBrokenLinks (relink to a
key-matching active note, or recreate from display text in the same
transaction — one revision, sweep included) and an internal
BreakNoteLinks inverse; unit tests cover both paths, validation
rejections, and the inverse round-trip. Relink granularity is per
(source, title_key), matching the storage model's decision not to
track occurrences across edits — the panel wording avoids "this
occurrence". Broken key with a TRASHED same-key match gets neither
action (create would conflict with the reservation, relink requires
an active target); the panel explains and defers to Trash flows
(EPIC-007). The first e2e run failed on a camera equality check —
the eased flight from the prior activation was still animating when
the baseline was sampled; fixed with a settle-poll (the standing
EPIC-010 lesson: never read the camera synchronously). Full suite
green; two known-class load flakes passed on retry.
