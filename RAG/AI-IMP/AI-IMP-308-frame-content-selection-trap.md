---
node_id: AI-IMP-308
tags:
  - IMP-LIST
  - Implementation
  - frames
  - selection
  - tester-feedback
kanban_status: planned
depends_on:
parent_epic:
confidence_score: 0.65
date_created: 2026-07-17
date_completed:
---

# AI-IMP-308-frame-content-selection-trap

## Summary of Issue #1

First tester field doc (2026-07-17, item 4): once multiple images
sit in a frame, they cannot be selected or rearranged from within
it — the frame must be DELETED to touch its contents. That is a
trap, and the design grammar bans traps. Done means: frame
members are individually selectable and movable while the frame
exists, via a ruled gesture that coexists with selecting the
frame itself.

### Out of Scope

Frames as arrange-units and dynamic frame growth (DESIGN-QUEUE,
2026-07-17 — needs its ruling first); frame appearance work
(AI-IMP-186's scope).

### Design/Approach

Round-1 convicted the frame's full-body hit area: generic hit testing
walks the render-ordered plane from top to bottom and returns the first
placement body (`packages/canvas-engine/src/hit-test.ts:226-238`), and
pointer-down consumes that result directly
(`packages/canvas-engine/src/controller.ts:165-179`). A later-created
frame therefore lets its translucent wash intercept its earlier
members. Recorded membership and movement were exonerated: the live
frame index expands frame moves (`apps/desktop/src/renderer/canvas/host.ts:1232-1246`)
and resolves capture/release only at completed item-move boundaries
(`apps/desktop/src/renderer/canvas/host.ts:1260-1285`).

The original double-click proposal was rejected in review because it
conflicts with the established double-click = EVERYTHING activation
path, which deliberately retains generic hit testing
(`apps/desktop/src/renderer/note/open-note.ts:351-377`). The accepted
ruling is selection-only: a recorded descendant under the pointer
outranks its ancestor frame; unrelated topmost content keeps normal
render-order priority; uncovered frame wash selects the frame. No new
gesture or membership inference is introduced.

### Files to Touch

Canvas-engine selection/hit-test seam (review locates); frame
tooling in `apps/desktop/src/renderer/canvas/*`;
`apps/desktop/test/e2e/*` frame selection spec.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and
**think**. Have you validated all aspects are **implemented** and
**tested**?
</CRITICAL_RULE>

- [x] Round-1 review: cite how frame/member hit-testing resolves
      today; record the trap's mechanism here.
- [x] Member selection works with the frame intact (ruled or
      minimal dialect, recorded).
- [x] Members move within the frame and drag out per membership
      rules; frame selection still works.
- [x] e2e: build a 3-image frame → select a member → move it →
      select the frame → both behaviors coexist; no deletion
      required anywhere.

### Acceptance Criteria

**Scenario:** Rearranging inside a frame.
**GIVEN** a frame containing three images.
**WHEN** the user single-clicks one image through its ancestor frame wash.
**THEN** that image alone selects and can be moved,
**AND** single-click on uncovered wash still selects the frame,
**AND** the frame never needs deleting to reach its contents.

### Issues Encountered

- The ticket's suggested double-click dialect contradicted the existing
  double-click activation law. The accepted descendant-over-ancestor
  single-click rule replaces that premise and leaves activation untouched.
- The e2e imports three real image assets and deliberately creates their
  placements before the frame to reproduce the exact render-order trap,
  then proves select, move-within, wash-select, and drag-out/release
  without deleting the frame.

<!--
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->
