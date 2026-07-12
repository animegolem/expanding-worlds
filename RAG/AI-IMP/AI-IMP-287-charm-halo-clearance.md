---
node_id: AI-IMP-287
tags:
  - IMP-LIST
  - Implementation
  - chrome
  - canvas
  - design-adoption
kanban_status: completed
depends_on: [AI-IMP-286]
parent_epic: [[AI-EPIC-029-the-kit-adoption-push]]
confidence_score: 0.8
date_created: 2026-07-12
date_completed: 2026-07-12
---

# AI-IMP-287-charm-halo-clearance

## Summary of Issue #1

RFC §8.8.4 (rev 0.71): a selected node's clearance envelope is its
card bounds + 12px + the charm height — the HALO — and anything
chrome positions near a selected node pads by the halo, never the
card edge. Shipped code positions node-anchored surfaces (charm-bar
panels, appearance popover, node context menus) off card rects, so
well-meaning chrome can graze charms. Remediation: one exported
halo-rect accessor for the current selection, consumed by every
node-anchored positioner. Done means: node-anchored surfaces
measure against the halo, unit tests prove the 12px + charm-height
pad, and no positioner reads raw card bounds for clearance.

### Out of Scope

- The reservation-frame clamp itself (AI-IMP-286 — this ticket
  layers the halo on top of it).
- The ⌗/◧ panels (AI-IMP-291) — they adopt the helper when built.
- Any change to charm rendering or the hover census.

### Design/Approach

`charms-ui.ts` already owns charm geometry (height, offsets); add
an exported `selectionHaloRect()` (screen space, card bounds +
12px + charm height on the charm side, 12px elsewhere — match the
kit's drawn envelope; verify the exact shape against the Home
Canvas kit edges specimen in round-1). `anchored-placement.ts`
gains an optional `avoid: Rect` the caller passes; node-anchored
callers (charm popovers, ContextMenu.ts when opened on a node)
pass the halo. Event-driven only: the halo is computed at open and
on selection change, never per frame.

### Files to Touch

`apps/desktop/src/renderer/canvas/charms-ui.ts`: export
  selectionHaloRect(); unit tests beside existing charm math.
`apps/desktop/src/renderer/chrome/anchored-placement.ts`: `avoid`
  rect support + tests.
`apps/desktop/src/renderer/menus/ContextMenu.ts`: pass halo when
  the target is a selected node.
Node-anchored popover call sites (appearance popover et al. —
  enumerate in round-1; charms-ui.ts:998-1019 region is the known
  anchor path).

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [x] Round-1: verify the kit's halo envelope (Home Canvas kit +
      preflight F2) and enumerate every node-anchored positioner
      in current source; record the list here.
- [x] selectionHaloRect() exported from selection-halo.ts with unit
      tests (halo = card + 12 + charm height; empty when no
      selection).
- [x] anchored-placement.ts honors `avoid` (flip/clamp away from
      the halo, still inside the reservation frame); unit tests.
- [x] All enumerated node-anchored call sites pass the halo.
- [x] No positioner measures clearance off raw card bounds
      (assert via test or targeted grep in review).
- [x] Full local gate green with counts read.

### Acceptance Criteria

**Scenario:** chrome opens beside a selected node.
**GIVEN** a selected node with its charm bar visible
**WHEN** a node-anchored popover or context menu opens
**THEN** the surface's rect does not intersect the halo (card +
12px + charm height)
**AND** the surface still clamps inside the reservation frame
**AND** with no selection the avoid rect is absent and placement is
unchanged from today.

### Issues Encountered

#### Round-1 source verification (2026-07-12)

- The kit drawing is ambiguous about which sides include charm height;
  shipped selection furniture resolves it. The pure halo is card + 12 on
  left/right/top and card + 12 + the measured selection-bar height on
  bottom, with a 32px fallback.
- The four raw node-relative positioners are charm tags, charm
  appearance, the node context menu, and caption editing/promotion.
  TagPanel remains point-anchored to its opener and receives only the
  reservation-frame clamp.
- `placeAnchored` gains an optional avoid rect. It chooses a
  non-intersecting side first, then the reservation frame wins in a
  degenerate viewport; the result reports `avoided: false` when both
  constraints cannot be satisfied.
- Halo measurement is event driven through a mounted-provider
  registration. No render-frame polling is introduced.
