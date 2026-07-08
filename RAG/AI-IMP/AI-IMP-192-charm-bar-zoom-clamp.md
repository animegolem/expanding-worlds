---
node_id: AI-IMP-192
tags:
  - IMP-LIST
  - Implementation
  - canvas
  - feel
kanban_status: planned
depends_on: []
parent_epic:
confidence_score: 0.7
date_created: 2026-07-08
---


# AI-IMP-192-charm-bar-zoom-clamp

## Summary of Issue #1

Owner testing note (2026-07-08, v0.15.0, screenshot): zoomed far
out, a selected placement renders a few pixels wide while its charm
bar floats full-size beside it — chrome dwarfing the thing it
annotates. Owner's proposal: clamp at a maximum relative zoom —
when the selected item's on-screen size falls below a threshold,
DISMISS the selection (which takes the bar with it). This matches
the shrink-ladder doctrine: furniture exists only where the thing
it serves is legible. Done means selection auto-clears when the
selected item(s) shrink below the threshold during zoom-out, with
the threshold derived from the existing shrink-ladder constants
(EW_FURNITURE_MIN_PX family, AI-IMP-133) — no new magic numbers.

### Out of Scope

- Changing bar anatomy or position math (AI-IMP-187 owns rotation).
- Hiding-but-keeping-selection (owner proposed dismissal; if build
  reveals dismissal fights marquee-then-zoom-out workflows, STOP
  and flag rather than choosing).

### Design/Approach

In the camera-change path that already repositions the bar
(charms-ui's refresh loop), compute the selection's max on-screen
edge; below the shared furniture threshold, call
`controller.selection.clear()` once (guard re-entry). Applies to
single and multi selection. Zooming back in does NOT resurrect
selection (deliberate: dismissal, not hiding). Unit the threshold
fn; e2e: select, zoom out past the floor → selection empty, bar
gone; zoom out to just ABOVE the floor → selection intact.

### Files to Touch

`apps/desktop/src/renderer/canvas/charms-ui.ts` (threshold check in
the existing refresh), `packages/canvas-engine` only if the shared
constant needs exporting, e2e in charms.spec.ts.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [ ] Threshold from the shared shrink-ladder constant; unit-
      tested.
- [ ] Zoom-out past the floor dismisses selection (single + multi);
      just-above keeps it.
- [ ] No dismissal during pan at constant zoom; no re-entry loops.
- [ ] Gates: `pnpm -r build && pnpm -r test && pnpm lint` + hidden
      e2e.
- [ ] HUMAN-TESTING entry appended at merge by the lead (does
      dismissal feel right vs hiding? — the owner's call to trim).

### Acceptance Criteria

**GIVEN** a selected placement and the camera zooming out
**WHEN** the placement's on-screen size crosses below the furniture
floor
**THEN** the selection clears and the charm bar dismisses — and
zooming back in leaves the board unselected.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->
