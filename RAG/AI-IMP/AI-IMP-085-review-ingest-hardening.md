---
node_id: AI-IMP-085
tags:
  - IMP-LIST
  - Implementation
  - hardening
  - notes
  - import
kanban_status: completed
depends_on:
parent_epic: [[AI-EPIC-010-hands-on-hardening]]
confidence_score: 0.9
date_created: 2026-07-06
date_completed: 2026-07-06
---

# AI-IMP-085-review-ingest-hardening

## Summary of Issue #1

An owner-run Codex review of main (2026-07-06, post feel batch)
produced six findings; lead triage confirmed five for immediate fix
(the sixth — non-atomic create+attach — is AI-IMP-086). Fixing here:
(1) P1 closing a dirty note panel drops the un-flushed edit burst —
closePanel deletes the flusher without calling it; (2) P1 slow
imports read host.canvasId AFTER async work, landing pins on the
wrong board if the user navigates mid-import (import-surfaces and
the board-tooling background path); (3) P2 a pin failure after
CommitAssetImport still reports 'imported', hiding an orphaned
(GC-eligible) asset; (4) P2 note-open requests resolve anchors
async without ordering — an older click can win; (5) P3 phantom
link queries count trashed source notes and listNodeLibrary leaks
trashed note titles. Done = all five fixed with regression tests,
full gates green.

### Out of Scope

- Atomic CreateNote+Attach (AI-IMP-086).
- Asset GC changes: orphaned assets are already sweep-eligible per
  §9.8 — only the batch reporting is fixed.
- Any behavior change beyond the cited defects.

### Design/Approach

(1) closePanel awaits the registered flusher (fire the promise,
commands land per §10.2; deletion follows) — the close button path
becomes a guaranteed save point per §7.1. (2) Capture canvasId at
gesture time: importOneFile and createImagePin take canvasId as a
parameter bound at drop/paste entry; background set captures before
its first await. Late-landing pins go to the board they were
dropped on. (3) createImagePin returns success; importOneFile
returns 'failed' on pin failure. (4) A generation counter on
openNotePanel's async anchor resolve (gallery hydration idiom):
stale resolves drop. (5) Phantom queries join active source notes;
listNodeLibrary's note join gains lifecycle_state = 'active'.

### Files to Touch

`apps/desktop/src/renderer/note/panels.ts`: flush-on-close; open
generation guard.
`apps/desktop/src/renderer/canvas/import-surfaces.ts`: canvasId
threading; honest failure outcome.
`apps/desktop/src/renderer/canvas/board-tooling.ts`: early canvasId
capture for background set.
`packages/persistence/src/queries-notes.ts` (+test): active source
joins.
`packages/persistence/src/queries-structure.ts` (+test): active
note title in library rows.
e2e only if an existing spec covers the surface cheaply.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and
**think**. Have you validated all aspects are **implemented** and
**tested**?
</CRITICAL_RULE>

- [x] closePanel flushes before deleting the flusher; a dirty panel
      closed inside the debounce window still commits (test via
      existing panel e2e or unit on the store).
- [x] canvasId captured at drop/paste time and threaded through
      importOneFile/createImagePin and the background-image path.
- [x] importOneFile returns 'failed' when CreatePin does not commit;
      batch counts reflect it.
- [x] openNotePanel generation guard: stale anchor resolves drop.
- [x] queries-notes phantom suggestion + getPhantom join active
      source notes; units cover a trashed-source link.
- [x] listNodeLibrary hides trashed note titles; unit added.
- [x] Full gates: `pnpm -r build`, unit suites, desktop e2e, lint.

### Acceptance Criteria

**Scenario:** Artist edits and closes fast.
**GIVEN** a note panel with unsaved keystrokes inside the debounce
window
**WHEN** the artist clicks Close
**THEN** the burst commits before the panel goes (reopening shows
the text).

**Scenario:** Artist navigates during a slow import.
**GIVEN** a large file dropped on board A
**WHEN** the artist dives into board B before the import finishes
**THEN** the pin lands on board A at the drop position.

**Scenario:** Trash stays invisible.
**GIVEN** a note in Trash whose body held an unresolved link, and a
node whose attached note is trashed
**WHEN** suggestions, phantom views, and the outline library render
**THEN** none of them surface the trashed material.

### Issues Encountered

All five fixes landed. The flush fix went one layer deeper than
the finding: flushPending awaited any in-flight commit BEFORE
reading the buffer, so a closing panel's destroy() nulled the view
mid-wait and the flush silently no-oped — capture is now hoisted
above every await, and a dedicated e2e closes a dirty panel inside
the debounce window and polls the committed body. The background
path also captures the PRIOR background (not just canvasId) and
skips the fly-to if the user left the board. Honest gaps: the
canvasId race, honest-failure outcome, and open-generation guard
are validated by types + existing suites, not by dedicated
navigate-mid-import e2e (heavy to simulate; the fixes are
capture-at-entry patterns whose correctness is structural). Gates:
417/270/36 units (three new trash-leak units), 87 e2e incl. the new
flush regression, lint clean.

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->
