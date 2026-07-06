---
node_id: AI-IMP-071
tags:
  - IMP-LIST
  - Implementation
  - tags
kanban_status: planned
depends_on: [AI-IMP-069]
parent_epic: [[AI-EPIC-013-global-views]]
confidence_score: 0.75
date_created: 2026-07-05
date_completed:
---

# AI-IMP-071-tag-panel

## Summary of Issue #1

Tags exist as records with assignment UI but have no surface: the
charm bar's # chips and the note panel's tag chips currently lead
nowhere. This ticket builds the §4.8 tag panel — panel physics, not
a takeover: it floats above the canvas anchored to the control that
summoned it. A name-completing search field (exactly one tag in
Phase 1) over project-wide rows in the shared §7.4 grammar (node
appearance/thumbnail, note title, other tags, location), unplaced
nodes included, with per-row open-note and fly-to-placement
actions; a cross-canvas fly-to is a navigation event through
navigateTo. Two of the three doors land here: charm-bar tag chips
and note-panel tag chips (the ⌕ tag mode door is 073). The header
carries the lens toggle (wired to 072's setLens when merged;
rendered disabled until then). Covers EPIC-013 FR-4 and FR-6 (two
doors) and RFC §17 slice item 8. Done when: both doors open one
panel on the right tag, rows list every carrier with locations,
fly-to works same- and cross-canvas as history events, and a tags
e2e spec passes.

### Out of Scope

The lens implementation itself (072). The ⌕ door (073). Multi-tag
queries, note-attached tags, tag rename/management UI beyond what
exists.

### Design/Approach

Extend `getTagView` to carry locations: per node, its active
placements as `{ placementId, canvasId, canvasLabel }` so rows can
print location and drive fly-to without N+1 renderer queries. The
panel is one instance managed like the location chooser: a small
store in note/ or a new `tags/tag-panel.ts` holding
`{ tagId, anchor }`; opening from a chip passes the chip's rect as
anchor (same PanelAnchor point grammar as §8.5); Escape or reopen
replaces. Rows reuse `rows/NodeRow.svelte` from 069 plus a location
line and two actions: open-note → requestOpenNote; fly-to →
same-canvas selects and flyTo, cross-canvas navigateTo then centers
via the bounded scene-wait (the onCenterPlacements seam already
does exactly this). The completion field lists matching tag names
from listTags as you type; picking one swaps the panel's tag.
Doors: charms-ui's tag chip popover entries and NotePanel's tag
chips both call the panel store with their anchor. Header renders
the lens toggle disabled with a deferred tooltip until 072's host
API exists (feature-detect the export).

### Files to Touch

`packages/persistence/src/queries-structure.ts`: getTagView +=
locations; units.
`apps/desktop/src/renderer/tags/tag-panel.ts`: new — panel store.
`apps/desktop/src/renderer/tags/TagPanel.svelte`: new — field,
rows, actions, lens toggle slot.
`apps/desktop/src/renderer/canvas/charms-ui.ts`: tag chips open the
panel anchored to the chip.
`apps/desktop/src/renderer/note/NotePanel.svelte`: tag chips open
the panel.
`apps/desktop/src/renderer/CanvasHost.svelte` (or NotePanels
layer): render TagPanel.
`apps/desktop/e2e/tags.spec.ts`: new.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and
**think**. Have you validated all aspects are **implemented** and
**tested**?
</CRITICAL_RULE>

- [ ] getTagView returns per-node active placement locations with
      canvas labels; persistence units cover placed, multi-placed,
      and unplaced carriers.
- [ ] tag-panel store: one instance, anchor-positioned, Escape
      closes, reopen replaces tag and anchor.
- [ ] TagPanel rows via NodeRow + location line; unplaced carriers
      row with loose badge; per-row open-note works.
- [ ] Fly-to: same-canvas selects + flyTo; cross-canvas goes
      through navigateTo (history entry) then centers after the
      scene applies.
- [ ] Completion field: type-ahead against listTags, picking swaps
      the panel's tag; exactly one tag at a time.
- [ ] Door 1: charm-bar # chip click opens the panel on that tag,
      anchored to the chip. Door 2: note-panel tag chip ditto.
- [ ] Lens toggle rendered in the header; wired to the 072 host API
      when present, else disabled with an "arrives with the lens"
      tooltip.
- [ ] e2e: both doors, cross-canvas fly-to lands centered with a
      Back entry, unplaced carrier listed.
- [ ] `pnpm -r build`, full gates green.

### Acceptance Criteria

**Scenario:** Following a tag across the project.
**GIVEN** tag "ruins" on nodes placed on canvas A and canvas B and
on one unplaced node, with canvas A active.
**WHEN** the user clicks the "ruins" chip in a selected node's
charm bar.
**THEN** the tag panel opens anchored to the chip listing all three
carriers with locations.
**WHEN** the user clicks fly-to on the canvas-B row.
**THEN** the app navigates to B as a history event and centers the
placement.
**AND** Back returns to canvas A with its viewport restored.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->
