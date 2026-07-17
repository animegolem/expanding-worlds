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

Round-1 review establishes how frame hit-testing and selection
currently resolve (who swallows the click — the frame's hit area
or a selection filter). The standard dialect elsewhere:
click selects the frame; double-click (or a ruled modifier)
enters/targets a member; members drag within and out per the
existing membership rules. Follow whatever §6.8/frame grammar
already rules; where unruled, implement the minimal
double-click-to-member dialect and record it as a proposed
ruling in this ticket for the queue — do NOT invent beyond the
minimum needed to break the trap.

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

- [ ] Round-1 review: cite how frame/member hit-testing resolves
      today; record the trap's mechanism here.
- [ ] Member selection works with the frame intact (ruled or
      minimal dialect, recorded).
- [ ] Members move within the frame and drag out per membership
      rules; frame selection still works.
- [ ] e2e: build a 3-image frame → select a member → move it →
      select the frame → both behaviors coexist; no deletion
      required anywhere.

### Acceptance Criteria

**Scenario:** Rearranging inside a frame.
**GIVEN** a frame containing three images.
**WHEN** the user targets one image with the ruled gesture.
**THEN** that image alone selects and can be moved,
**AND** single-click still selects the frame,
**AND** the frame never needs deleting to reach its contents.

### Issues Encountered

<!--
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->
