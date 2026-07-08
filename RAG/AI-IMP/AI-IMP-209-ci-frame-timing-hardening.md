---
node_id: AI-IMP-209
tags:
  - IMP-LIST
  - Implementation
  - ci
  - e2e
  - canvas
kanban_status: completed
depends_on: []
parent_epic:
confidence_score: 0.9
date_created: 2026-07-08
date_completed: 2026-07-08
---


# AI-IMP-209-ci-frame-timing-hardening

## Summary of Issue #1

Linux CI went red on the AI-IMP-191/192/193/199/200 wave (runs
28956216134 / 28956356994 / 28958083729) while the same suite ran
226/226 locally: four of the wave's new tests assumed mac-speed
frames, and the runner's xvfb software renderer (~6× slower,
41-minute suite) broke every assumption. One of the four was a REAL
product wart, not just a test wart: AI-IMP-192's floor-crossing
arming lived only in the rAF `layout()`, so back-to-back camera
writes could outrun the frame and the crossing was missed forever
(selection never dismissed). Done means CI green on the same head's
content: the arming is event-driven (product), and the three specs
await conditions instead of wall-clock.

### Out of Scope

- The CI log's stray `fatal: ambiguous argument 'main'` line
  (pre-existing snapshot-spec noise; did not fail a test).
- Runner speed itself.

### Design/Approach

Product: extract `checkFurnitureFloor()` in charms-ui and call it
SYNCHRONOUSLY from the camera and selection `onChanged` hooks (plus
layout() as belt) — the dismissal can never again depend on a
render tick landing between "armed above floor" and "zoomed below".
Tests: panels wedge/burst asserts poll for eventually-interactable
(the positioning gate legitimately holds the pane inert for its
first frames); the 193 flash sampler runs until it records visible
frames (cap 1800 ticks) and the test polls the sampler's own record;
the shell strip-fade assert arms a MutationObserver before the
reveal and reads the mount-instant opacity (in:fade applies its
0-start synchronously on insertion) instead of two wall-clock
samples 90ms apart.

### Files to Touch

`canvas/charms-ui.ts`, `e2e/panels.spec.ts`, `e2e/charms.spec.ts`
(none needed — the product fix makes its sequence deterministic),
`e2e/shell.spec.ts`.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [x] Floor-crossing check event-driven; recursion guarded
      (dismiss inside onChanged re-enters through the guard).
- [x] Panels one-shot state asserts → polls (both spam tests).
- [x] Flash sampler unbounded-until-visible; poll on the sampler's
      record, not the live DOM.
- [x] Strip fade asserted via mount-instant MutationObserver.
- [x] Local gates: build, lint, charms-ui units 6/6, the three
      touched specs 28/28.
- [x] CI green on the fixed head (the actual acceptance — verified
      post-push, run on the close commit).

### Acceptance Criteria

**GIVEN** the Linux runner's software-rendered frames at any speed
**WHEN** the desktop e2e job runs the wave's tests
**THEN** all four previously-failing tests pass deterministically —
and a selection above the furniture floor is ALWAYS armed for
dismissal regardless of frame timing.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->

- The four failures divided honestly into one product defect (192
  arming frame-dependence — the CI catch that mattered) and three
  test-technique defects (wall-clock sampling of frame-driven
  behavior). The lesson institutionalized: e2e must await observable
  conditions (polls, in-page samplers, mount observers), never
  assume a frame budget — macOS-local green is not evidence of
  timing robustness.
- The lead applied this fix directly on main (hotfix discipline):
  the wave was already merged and the tag was holding on CI.
