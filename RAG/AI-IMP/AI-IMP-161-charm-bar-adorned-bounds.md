---
node_id: AI-IMP-161
tags:
  - IMP-LIST
  - Implementation
  - charms
  - canvas
kanban_status: planned
depends_on:
parent_epic:
confidence_score: 0.8
date_created: 2026-07-07
date_completed:
---


# AI-IMP-161-charm-bar-adorned-bounds

## Summary of Issue #1

Owner report (build 9, screenshot on file): the §8.4 charm bar
floats at a flat `bottomCenter.y + 10` under the selected
placement's AABB (`charms-ui.ts` ~811) — the same band where the
title label renders — so in most labeled cases the bar covers the
title. No guard exists in code or spec (§8.4 says only "floats
beneath the selected node"). Owner-agreed fix (2026-07-07): anchor
the bar to the ADORNED bounds — placement rect plus the rendered
label when one is visible — so the bar sits below the title; when
no label shows, the bar hugs the image as today (the owner chose
the tighter variant over always-stable positioning). Done means a
labeled selection shows title AND bar unoccluded at any zoom, and
an unlabeled selection is pixel-identical to today.

### Out of Scope

- Any charm-bar restyle; popover geometry (already derives from
  live bar height and follows automatically).
- The §8.4 RFC wording (flag for the next consistency pass; the
  behavior is a presentation guard, not a semantic change).

### Design/Approach

The engine computes label bounds to draw the label; expose them to
the adornment pass (e.g. an `adornedWorldAABB(item)` or a label-
height accessor beside `itemWorldAABB` in canvas-engine hit-test/
placement renderer), and charms-ui anchors `bottomCenter` at
max(placement bottom, label bottom). Label is world-scaled, so the
seam must return world units and go through the same
worldToScreen the bar already uses. Unit-test the accessor; e2e
asserts bar.top ≥ label bottom on a labeled selection at two zooms
and unchanged position on an unlabeled one.

### Files to Touch

`packages/canvas-engine/src/` label-bounds seam (+ unit).
`apps/desktop/src/renderer/canvas/charms-ui.ts` anchor change.
`apps/desktop/e2e/charms.spec.ts` two assertions.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [x] Label-bounds seam exposed from the engine (world units),
      unit-tested.
- [x] Bar anchors below the label only when a label is visible;
      unlabeled anchor byte-identical.
- [x] E2E at two zooms; popovers still hang correctly.
- [x] Gates: `pnpm -r build`, `pnpm -r test`, `pnpm lint`, desktop
      e2e hidden.
- [ ] HUMAN-TESTING entry appended at merge by the lead.

### Acceptance Criteria

**GIVEN** a selected placement with a visible title
**THEN** the charm bar renders fully below the title at any zoom
**GIVEN** one with the label hidden
**THEN** the bar sits exactly where it does today.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->

- The label's rendered vertical extent is Pixi Text line-box metric,
  not a value a pure engine function can measure without a GPU Text.
  The seam therefore names one constant, `LABEL_TEXT_HEIGHT_RATIO =
  1.3`, sized to slightly OVER-cover Pixi's ~1.2×fontSize single-line
  box (the `open-note.ts` label-band precedent already uses 1.3).
  Over-covering keeps the invariant one-directional — `bar.top ≥
  label bottom` — so the guard can only push the bar clear, never
  cut into a descender; the e2e asserts exactly that at two zooms.
- Seam split across two engine files to keep each truthful:
  `placementLabelWorldBottom(item, zoom)` lives in
  `renderers/placement.ts` beside the label layout it mirrors
  (`labelBasis`, `LABEL_CLEARANCE_PX`, `LABEL_HEIGHT_RATIO`), so text
  metrics are named once and never re-derived in the desktop app;
  `adornedWorldAABB(item, zoom)` in `hit-test.ts` composes it with
  `itemWorldAABB` and is what charms-ui calls. The zoom argument is
  unavoidable — the label's body gap is a fixed SCREEN clearance
  (`LABEL_CLEARANCE_PX / zoom` in world), so a purely world AABB
  would be untruthful at the extremes.
- Byte-identical unlabeled anchor proven two ways: the unit test
  asserts `adornedWorldAABB === itemWorldAABB` (deep-equal) for
  hidden-label, no-note, §4.6-card, and y-flipped placements; the
  e2e asserts the bar returns to `worldToScreen(bodyBottom).y + 10`
  when the label is hidden. y-flip is handled because the renderer
  lifts a flipped label ABOVE the body, so nothing reaches below.
- Popovers were not touched: they derive from the live
  `bottomCenter.y` + measured bar height, so moving the anchor
  carries them automatically. Verified by the still-green tag-chips
  and appearance-switcher charm specs.
- `pnpm -r test`'s recursive reporter does not flush through a pipe
  to a file, so its captured output looked empty; the run exited 0
  and the canvas-engine suite reported 377 passed directly.
