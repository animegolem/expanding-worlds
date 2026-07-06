---
node_id: AI-IMP-080
tags:
  - IMP-LIST
  - Implementation
  - gallery
  - keyboard
kanban_status: planned
depends_on: [AI-IMP-079]
parent_epic: [[AI-EPIC-014-gallery]]
confidence_score: 0.7
date_created: 2026-07-06
---

# AI-IMP-080-gallery-keyboard

## Summary of Issue #1

Rev 0.25 closed question 26 with the gallery keyboard model; this
ticket builds it on 079's selection state. The grid gains a cursor
(focus ring distinct from selection): plain arrows move it and
collapse selection to it — Left/Right walk document order wrapping
across rows and buckets, Up/Down move by visual column with
nearest-column mapping; Shift+arrows extend the linear
document-order range from the anchor; Mod+Space toggles membership
(Space alone stays RESERVED for the future preview); Mod+A selects
the current filter scope; Enter runs the kind-appropriate primary
action (note-carrying → note panel over the gallery, board-kind →
close and dive, note-less image → panel via the §8.4
create-on-demand); Delete trashes the selection; Escape peels
selection then takeover; PageUp/PageDown page the viewport;
Mod+Up/Down jump to the previous/next bucket header under date
sort. Done when: the §14.4 keyboard paragraph passes end to end.

### Out of Scope

The preview surface itself (Space stays a no-op). Rebinding UI.
Focus interplay with the facet strip beyond: the grid owns these
keys only while a grid cell has focus, and the tag field keeps
its own (custom-completion) keys.

### Design/Approach

Cursor is view state beside 079's selection (id + visual column
memory for Up/Down runs, the standard grid-nav affordance). Key
handling on the grid container (roving tabindex on the cursor
cell — aria-selected mirrors selection), capture-guarded like
every takeover surface so board seams never fire. Document order =
the current sort/filter's flat order (bucket boundaries are
presentation; Left/Right cross them). Up/Down compute the nearest
column in the adjacent visual row — including short last rows and
cross-bucket hops. Virtualization interplay: moving the cursor
outside the rendered window scrolls it into view BEFORE the range
math reads geometry (or column math works on indices, not DOM —
prefer indices; the grid's column count is known from layout).
Enter reuses 079's activation seam; Delete reuses its trash;
Mod+A selects the query result set (what the facets show), not
the whole project. Mod+Up/Down resolve against the bucket index
from 077's grouping.

### Files to Touch

`apps/desktop/src/renderer/views/GalleryView.svelte`: cursor,
key map, roving focus.
`apps/desktop/e2e/gallery.spec.ts`: keyboard scenarios.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and
**think**. Have you validated all aspects are **implemented** and
**tested**?
</CRITICAL_RULE>

- [ ] Cursor ring distinct from selection; plain arrows collapse
      selection to the cursor; Left/Right wrap rows and buckets;
      Up/Down nearest-column incl. short rows and cross-bucket
      (e2e over a seeded ragged grid).
- [ ] Shift+arrows extend the linear document-order range from
      the anchor; agrees with Shift+click (e2e).
- [ ] Mod+Space toggles the cursor cell without moving the
      anchor; bare Space does nothing (reserved) (e2e).
- [ ] Mod+A selects exactly the current filter scope (e2e with an
      active facet).
- [ ] Enter: note panel for note-carrying, dive for board-kind
      closing the takeover, create-on-demand panel for a bare
      image (e2e per kind).
- [ ] Delete trashes the selection; Escape peels selection then
      takeover; PageUp/Down page; Mod+Up/Down bucket-jump under
      date sort (e2e).
- [ ] `pnpm -r build`, full gates green.

### Acceptance Criteria

**Scenario:** Hands never leave the keyboard.
**GIVEN** a date-sorted gallery of mixed kinds across buckets.
**WHEN** the user arrows right past a row end and a bucket
boundary.
**THEN** the cursor lands on the next entry in document order.
**WHEN** the user holds Shift and presses Down twice.
**THEN** the linear range from the anchor through the landing
cell is selected.
**WHEN** the user presses Enter on a board-kind entry.
**THEN** the takeover closes and the app dives to that canvas.
**WHEN** the user presses Mod+Down.
**THEN** the view jumps to the next bucket header.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->
