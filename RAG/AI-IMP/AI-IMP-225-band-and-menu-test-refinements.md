---
node_id: AI-IMP-225
tags:
  - IMP-LIST
  - Implementation
  - e2e
  - hygiene
kanban_status: planned
depends_on: []
parent_epic:
confidence_score: 0.9
date_created: 2026-07-09
---


# AI-IMP-225-band-and-menu-test-refinements

## Summary of Issue #1

Codex review of f05c34a5 (2026-07-09, non-blocking): two coverage
gaps in the 214/215 tests. (1) The 46px reveal band's inertness is
asserted via CSS (`pointer-events:none` computed) but no test
drives an ACTUAL click through the band onto a board item — the
full interaction contract (reveal arms, click still reaches the
canvas beneath) is unpinned. (2) The 215 swallow rule's complement
is untested: dock/toast clicks while the Board menu is open must
LEAVE it standing (the code scopes dismissal to the canvas
element; nothing regression-pins that). Done means both behaviors
have direct e2e: a click on a placement inside the top band
selects it (and reveals the strip); a dock click and a
notice/toast interaction with the menu open leave the menu up.

### Out of Scope

- Any product change (tests only).

### Design/Approach

Extend shell.spec.ts (band click-through: seed a placement whose
screen position sits at y≈30, click it, assert selection AND strip
revealed) and board-tooling.spec.ts (menu-stays-open: open Board
menu, click the dock's select tool, assert menu still visible;
trigger a toast if cheap, else the dock case suffices with a
comment). House polling idioms throughout.

### Files to Touch

`apps/desktop/e2e/shell.spec.ts`,
`apps/desktop/e2e/board-tooling.spec.ts`.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [ ] Band click-through pinned (click in band selects beneath).
- [ ] Menu-stays-open pinned for chrome clicks.
- [ ] Gates: build, lint, the two touched specs + a full sharded
      run.

### Acceptance Criteria

**GIVEN** the two new tests
**THEN** a regression in either the band's inertness or the
menu's chrome-click tolerance turns the suite red.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->
