---
node_id: AI-IMP-258
tags:
  - IMP-LIST
  - Implementation
  - renderer
  - notes
  - field-report
kanban_status: planned
depends_on: []
parent_epic:
confidence_score: 0.55
date_created: 2026-07-10
date_completed:
---


# AI-IMP-258-loose-note-panel-mount

## Summary of Issue #1

alph, v0.20.0, 2026-07-10, two symptoms on the note editor panel:
(1) "eternally tethered to upper right corner, can never drag it
around" — and drag WORKED in his first build (~v0.16), so this is
a REGRESSION with a bisect owed; (2) on a LOOSE note (no placement
— e.g. opened from gallery/outline), "the pin/expand/close buttons
don't work at all." LEAD HYPOTHESIS (unverified): the unplaced-note
panel mount takes a different path from the placed-note panel and
wires neither the drag grip nor the control charms; the tether may
be the §8.8 anchored default with no drag handler attached. The
pre-implementation review must (a) reproduce both on a packaged
build, (b) bisect the drag regression (suspects: the panel-identity
work in EPIC-023, wave 4/5 refactors, or AI-IMP-250's migration —
NotePanel was an explicit 250 guard EXEMPTION, so verify it wasn't
half-migrated), (c) supersede this hypothesis with cited causes
BEFORE repair. Done means: a loose note's panel drags like a
placed note's and its pin/expand/close all function.

### Out of Scope

- Delete-loose-notes (AI-IMP-260).
- Reading-as-camera-verb / note lifecycle design (DESIGN-QUEUE).
- Panel spawn POSITION policy (only drag-after-spawn + controls).

### Design/Approach

Review first (above). Likely shape: one panel mount path for
placed and loose notes, differing only in anchor source — the
loose path reuses the placed path's grip and charm wiring rather
than a parallel mount. Regression tests at the component level for
both mounts (grip present, charms dispatch); e2e covers the placed
path already — add a loose-note open+drag+close spec if the
harness supports it (no OS layer involved here, so e2e CAN prove
this one).

### Files to Touch

(Census in review; expected:)
- `apps/desktop/src/renderer/note/panels.ts` / panel mount
  components — the loose-note path.
- Note panel drag/grip wiring.
- e2e: a loose-note panel spec.
- `RAG/HUMAN-TESTING.md`: alph re-check entry.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [ ] Pre-implementation review: both symptoms reproduced; drag
      regression bisected to a commit; causes cited here.
- [ ] One mount path: loose-note panel gets grip + working
      pin/expand/close.
- [ ] Drag regression fixed at cause (not re-implemented around).
- [ ] Component tests for both mounts; loose-note e2e spec green.
- [ ] HUMAN-TESTING entry for alph.

### Acceptance Criteria

**GIVEN** a note with no placement opened from the gallery
**WHEN** its panel spawns
**THEN** the panel can be dragged anywhere in the window
**AND** pin, expand, and close each perform their verb
**AND** a placed note's panel behaves identically.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->
