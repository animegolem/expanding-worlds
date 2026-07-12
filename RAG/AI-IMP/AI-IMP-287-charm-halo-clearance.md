---
node_id: AI-IMP-287
tags:
  - IMP-LIST
  - Implementation
  - chrome
  - canvas
  - design-adoption
kanban_status: planned
depends_on: [AI-IMP-286]
parent_epic: [[AI-EPIC-029-the-kit-adoption-push]]
confidence_score: 0.8
date_created: 2026-07-12
date_completed:
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

- [ ] Round-1: verify the kit's halo envelope (Home Canvas kit +
      preflight F2) and enumerate every node-anchored positioner
      in current source; record the list here.
- [ ] selectionHaloRect() exported from charms-ui.ts with unit
      tests (halo = card + 12 + charm height; empty when no
      selection).
- [ ] anchored-placement.ts honors `avoid` (flip/clamp away from
      the halo, still inside the reservation frame); unit tests.
- [ ] All enumerated node-anchored call sites pass the halo.
- [ ] No positioner measures clearance off raw card bounds
      (assert via test or targeted grep in review).
- [ ] Full local gate green with counts read.

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

