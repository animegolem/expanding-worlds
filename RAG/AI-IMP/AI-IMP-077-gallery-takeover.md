---
node_id: AI-IMP-077
tags:
  - IMP-LIST
  - Implementation
  - gallery
  - takeover
kanban_status: in-progress
depends_on: [AI-IMP-076]
parent_epic: [[AI-EPIC-014-gallery]]
confidence_score: 0.6
date_created: 2026-07-06
---

# AI-IMP-077-gallery-takeover

## Summary of Issue #1

There is no browsable projection of what a project holds. This
ticket lands the gallery's skeleton per §14.4: the ⊞ rail charm and
takeover kind 'gallery' joining the 068 framework and its mode
switcher; a `getGalleryView` read model over the project's nodes;
a VIRTUALIZED thumbnail grid (paint and memory scale with the
viewport, not the collection) rendering thumbnails via
`ew-asset://…/thumb` with original fallback and repainting on
`derivative-ready`; and grouped time under date sort — bucketed
sections (relative near the top, degrading to calendar months then
years) whose current section header names where you are and opens
the period list for random access. Done when: a 500+-image project
opens the gallery, scrolls smoothly, shows bucketed sections under
date sort, and the header jump lands anywhere in deep time.

### Out of Scope

Facets and filters (078), selection and actions (079), keyboard
model (080), import strip (081). Library scope toggle (EPIC-015).
Preview/lightbox (Space stays reserved, rev 0.25).

### Design/Approach

Query: `getGalleryView` beside the outline's read models
(queries-structure precedent — projections, no new records):
active nodes with appearance columns, thumb-capable asset hash,
title (note title ?? short code), created_at, byte size, and kind
discrimination (image · note · board) per the §14.4 facet. Paged:
the query accepts offset/limit windows OR returns a compact index
(id + timestamp + kind) with a batched hydrate — pick during
build and record why; either must keep the grid virtualizable.
View: `views/GalleryView.svelte` mounted by TakeoverLayer for kind
'gallery'; CharmRail gains ⊞ with the same toggle/mode-switch
grammar as ▤ (a takeover click swaps kinds); the mode switcher
lists it. Grid: CSS grid of fixed-height cells, windowed by a
scroll-driven range (an intersection-observer or manual math —
no dependency), cells render thumbnail `<img>` with
loading="lazy" and the original-URL fallback; `derivative-ready`
patches the cell. Buckets: computed VIEW-side from indexed
timestamps (relative: today · this week · this month · earlier
this year; then months; then years); sticky current header doubles
as the jump control (click → period list → scroll anchor). Bucket
grouping is presentation state — no schema.

### Files to Touch

`packages/persistence/src/queries-structure.ts` (+units) or a new
`queries-gallery.ts`: getGalleryView.
`apps/desktop/src/renderer/chrome/takeover.ts`: kind 'gallery'.
`apps/desktop/src/renderer/chrome/CharmRail.svelte`: ⊞ charm.
`apps/desktop/src/renderer/chrome/TakeoverLayer.svelte`: mount.
`apps/desktop/src/renderer/views/GalleryView.svelte`: new.
`apps/desktop/e2e/gallery.spec.ts`: new.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and
**think**. Have you validated all aspects are **implemented** and
**tested**?
</CRITICAL_RULE>

- [ ] getGalleryView read model with kind discrimination, labels,
      timestamps, sizes; excludes trashed; root node handled per
      the outline precedent (units).
- [ ] ⊞ charm + takeover kind 'gallery': toggle grammar, mode
      switcher participation, Esc returns, camera untouched,
      board shortcuts stay guarded (e2e).
- [ ] Virtualized grid: DOM cell count bounded by the viewport
      under a 500+ item seed (assert bounded cell count in e2e);
      thumbnails load via /thumb with original fallback and
      repaint on derivative-ready.
- [ ] Date-sort buckets with correct relative→month→year
      degradation over a seeded timestamp spread (unit for the
      bucketing function, e2e for render).
- [ ] Sticky section header names the current bucket and its
      period list jumps to a distant bucket (e2e).
- [ ] `pnpm -r build`, full gates green.

### Acceptance Criteria

**Scenario:** Browsing the hoard.
**GIVEN** a project seeded with several hundred imported images
across many months.
**WHEN** the user clicks ⊞.
**THEN** the gallery takeover opens on a thumbnail grid grouped
under date buckets, scrolling stays smooth, and the DOM holds only
viewport-scale cell counts.
**WHEN** the user clicks the current section header and picks a
month a year back.
**THEN** the grid lands on that section.
**WHEN** the user presses Esc.
**THEN** the board returns with its camera untouched.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->
