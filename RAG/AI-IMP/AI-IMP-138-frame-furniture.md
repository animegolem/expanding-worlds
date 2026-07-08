---
node_id: AI-IMP-138
tags:
  - IMP-LIST
  - Implementation
  - design-pass
  - frames
  - canvas
kanban_status: planned
depends_on: [AI-IMP-133]
parent_epic:
confidence_score: 0.65
date_created: 2026-07-07
date_completed:
---


# AI-IMP-138-frame-furniture

## Summary of Issue #1

The shipped frame is region-only (wash + border). Rev 0.55/§4.9 +
the Style Guide give it FURNITURE: the frame's title renders ON its
top edge in mono (`--ew-frame-label`) — deliberately where an item
label never sits, so the position itself is the tell. The
sort-state control (grid · rows · float ▾; "float" is the visible
off-state) lives in the FRAME'S CHARM BAR, not on the edge —
owner ruling 2026-07-07 ("it has to be in the charm bar"),
resolving the design-queue location question against the drawn
title-row chip. Furniture is zoom-gated by the shrink ladder
(exists only above EW_FURNITURE_MIN_PX-derived threshold; the
region keeps a ≥1px stroke so membership never vanishes). Done
means: a titled frame shows its on-edge label above the threshold,
the selected frame's charm bar carries the sort chip reflecting
and setting the AI-IMP-129 sort state, and nothing renders below
the threshold except the minimum stroke.

### Out of Scope

- (Location call RESOLVED 2026-07-07: charm bar. A follow-on
  conversation is noted in DESIGN-QUEUE on whether deep-nest charm
  clutter ever matters; nothing here waits on it.)
- Frame rename UX beyond what exists (menu row is 137).
- Hover-dim/focus (shipped in 127).

### Design/Approach

Furniture rides the DOM adornment layer (charms-ui pattern — "UI,
not pixels": never in exports/crops), positioned from the frame
placement's screen rect, following the engagement cadence. Title =
the node's title (empty → no label; rename via existing surfaces).
The sort chip joins the CHARM BAR shown for a selected frame
(charms-ui.ts): it reads placement presentation (129's
`frame_sort_on_drop` + a sort-mode fact if 129 stores one; else
chip = On/float toggle + sort-now action matching the Dock's) and
dispatches the same actions as the Dock buttons (no new commands).
Zoom gate via 133's helper applies to the on-edge label; the ≥1px
region stroke is engine-side (placement renderer minimum). The
charm bar follows its own existing visibility rules — the zoom
gate governs edge furniture only.

### Files to Touch

`apps/desktop/src/renderer/canvas/frames-furniture.ts` (new, in
the charms-ui family) + wiring in host adornment refresh.
`packages/canvas-engine/src/renderers/placement.ts`: minimum
stroke at deep zoom (+ unit).
`apps/desktop/e2e/frames.spec.ts`: extend — label+chip visible at
working zoom, gone below threshold (stroke persists), chip
toggles sort-on-drop.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [ ] On-edge mono title, tokens only, engagement cadence, never
      in exports (adornment layer).
- [ ] Zoom gate via the shared constant; region stroke ≥1px
      always (unit).
- [ ] Sort chip in the frame's charm bar reflects + sets sort
      state (same action path as Dock); e2e round-trip.
- [ ] Gates: `pnpm -r build`, `pnpm -r test`, `pnpm lint`, desktop
      e2e hidden.
- [ ] HUMAN-TESTING entry appended at merge by the lead (label
      position as the tell; chip legibility on nests).

### Acceptance Criteria

**GIVEN** a titled frame with sort-on-drop on
**THEN** its top edge carries the mono title, and selecting the
frame shows a "grid ▾"-style chip in its charm bar that toggles
the 129 behavior
**AND** below the furniture threshold the label vanishes while the
region keeps a hairline stroke.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->
