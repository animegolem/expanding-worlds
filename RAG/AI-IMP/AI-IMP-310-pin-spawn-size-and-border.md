---
node_id: AI-IMP-310
tags:
  - IMP-LIST
  - Implementation
  - pins
  - tester-feedback
kanban_status: planned
depends_on:
parent_epic:
confidence_score: 0.7
date_created: 2026-07-17
date_completed:
---

# AI-IMP-310-pin-spawn-size-and-border

## Summary of Issue #1

First tester field doc (2026-07-17, item 10): the pin tool (§6.2
Create Pin) spawns "excessively small," and resizing it breaks
its border rendering. Done means: pins spawn at a ruled,
camera-aware default size that reads at the zoom it was placed
at, and the border/ring renders correctly across the full resize
range.

### Out of Scope

Pin semantics (§6.2 unchanged); the signature path-tail pin
(separate object); appearance-kind work (307's territory).

### Design/Approach

Round-1 review cites the spawn-size derivation (fixed world units
vs camera-scaled?) and the border draw (stroke width scaling —
likely a world-unit stroke degenerating at small sizes or a
non-uniform scale distorting the ring). Fix: spawn size derives
from CAMERA (a ruled screen-size at placement zoom, like charm
visibility keys on rendered size); border uses resolution-aware
stroke that survives resize. If the kit draws a pin size, cite
it; otherwise propose the constant in-ticket as a feel value for
the owner's hand pass (HUMAN-TESTING entry on close).

### Files to Touch

Pin creation default in commands/canvas seam (review cites); pin
rendering in canvas-engine; e2e/unit pins spec.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and
**think**. Have you validated all aspects are **implemented** and
**tested**?
</CRITICAL_RULE>

- [ ] Round-1 review: cite spawn-size and border-draw mechanisms.
- [ ] Spawn size camera-aware and ruled; recorded value + basis.
- [ ] Border renders intact at min→max resize at both zoom
      extremes (visual capture evidence).
- [ ] Unit: size derivation; e2e: place at far zoom-out → pin
      legible; resize sweep → border intact.
- [ ] HUMAN-TESTING entry for the feel value.

### Acceptance Criteria

**Scenario:** Placing and resizing a pin.
**GIVEN** a board at 25% zoom.
**WHEN** the user places a pin.
**THEN** it spawns legibly sized for the current camera.
**WHEN** the user resizes it across its range.
**THEN** the border/ring renders correctly at every size.

### Issues Encountered

<!--
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->
