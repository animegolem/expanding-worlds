---
node_id: AI-IMP-133
tags:
  - IMP-LIST
  - Implementation
  - design-pass
  - canvas
  - feel
kanban_status: planned
depends_on:
parent_epic:
confidence_score: 0.8
date_created: 2026-07-07
date_completed:
---


# AI-IMP-133-shrink-ladder-constants

## Summary of Issue #1

Rev 0.55 §8.2 ratifies the shrink ladder: world shrinks honestly,
chrome holds size, furniture exists only above a shared threshold —
governed by exactly two constants, `EW_FURNITURE_MIN_PX` (~8) and
`EW_PAGE_FLOOR_PX` (~48). Today the codebase has scattered
per-element rendered-size conditionals (charm visibility, panel
legibility floor `PANEL_LEGIBILITY_FLOOR`, label rules). Done
means: the two constants exist in one module, every existing
rendered-size conditional references them (or a documented derived
value), and a guard test fails any new magic-number size gate.

### Out of Scope

- New furniture (frame title/sort chip ride 138; page rings ride
  134 — they CONSUME these constants).
- Changing current feel values (map existing behavior onto the
  constants at equivalent values; the feel pass tunes).

### Design/Approach

One module (canvas-engine or renderer feel home — pick by who
imports; likely canvas-engine since renderers gate there) exporting
the two constants + tiny helpers (`isFurnitureVisible(renderedPx)`,
`pageDegradeStage(renderedPx)`). Inventory every rendered-size
conditional (grep px thresholds in charms-ui, feel.ts, placement
renderer, labels) and re-express each as the constant or a
documented ratio of it. The guard: a vitest scanning the renderer +
engine for numeric comparisons against rendered-size variables not
importing the module — pragmatic implementation: a lint-style
source scan for known patterns with an allowlist, mirroring the
raw-hex guard's approach; perfect static analysis is not the bar,
catching drive-by magic numbers is.

### Files to Touch

`packages/canvas-engine/src/shrink-ladder.ts` (new, + test).
Call sites: `charms-ui.ts`, `chrome/feel.ts` consumers,
`renderers/placement.ts`, label/panel floors.
`apps/desktop/src/renderer/` guard test (sibling to theme guard).

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [ ] Module + helpers land; existing thresholds mapped at
      behavior-equivalent values (e2e suite green unchanged is the
      proof).
- [ ] Guard test catches an injected magic size-gate (prove, then
      remove the plant).
- [ ] Gates: `pnpm -r build`, `pnpm -r test`, `pnpm lint`, desktop
      e2e hidden.

### Acceptance Criteria

**GIVEN** the merged branch
**THEN** exactly two shared constants govern furniture/page
thresholds, all prior behavior is unchanged (full e2e green), and
a new magic-number size conditional fails the guard.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->
