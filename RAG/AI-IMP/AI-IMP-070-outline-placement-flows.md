---
node_id: AI-IMP-070
tags:
  - IMP-LIST
  - Implementation
  - outline
  - placement
kanban_status: planned
depends_on: [AI-IMP-069]
parent_epic: [[AI-EPIC-013-global-views]]
confidence_score: 0.75
date_created: 2026-07-05
date_completed:
---

# AI-IMP-070-outline-placement-flows

## Summary of Issue #1

The outline renders the library but cannot act as one: §6.10's
placement sources (drag to canvas, Place on Current Canvas) still
live only in the interim PlacementSourcePanel behind the title
strip's Sources button. This ticket gives outline rows their
actions — Place on Current Canvas per row (nodes place via
CreatePlacement, note rows via CreatePin, exactly the Workspace
handlers that exist), drag a row out of the takeover onto the board
to place at the drop point, per-row open-note, and dive on canvas
rows via navigateTo — then retires PlacementSourcePanel, the
Sources button, and the ew-toggle-sources event. Covers EPIC-013
FR-3 and closes RFC §17 slice items 9 and 21. Done when: both
placement paths work from the outline for nodes and notes, an
unplaced node recovered from the loose bin lands on the active
canvas, the interim panel is deleted, and the e2e coverage moves to
outline.spec.

### Out of Scope

Multi-select placement, drag-reordering inside the outline, and
drag between outline rows (re-parenting) — not in the RFC. The tag
panel's own fly-to rows (071).

### Design/Approach

Place on Current Canvas reuses the existing open-note.ts event
seams (`onPlaceNode`, `onPlaceNote` handled in Workspace.svelte) —
the outline fires the same requests; the takeover closes on
placement so the user sees the result land at view center.
Drag-to-canvas: HTML5 drag from the row (dragstart sets an
`application/x-ew-node` payload with nodeId or noteId); dragging
out of the takeover sheet closes it (pointer past the sheet edge)
so the board is visible for the drop; the canvas host's existing
drop surface (import-surfaces.ts) gains a branch for the internal
mime type that executes CreatePlacement/CreatePin at the drop's
world point instead of an asset import. Dive on canvas rows goes
through navigateTo (every jump enters history). Open-note uses
requestOpenNote. Retirement: delete PlacementSourcePanel.svelte,
the Sources title-strip button, the ew-toggle-sources listener;
migrate the sources e2e assertions to outline.spec equivalents.

### Files to Touch

`apps/desktop/src/renderer/views/OutlineView.svelte`: row actions +
dragstart; close-on-drag-out.
`apps/desktop/src/renderer/canvas/import-surfaces.ts`: internal
drop payload branch → CreatePlacement/CreatePin at world point.
`apps/desktop/src/renderer/Workspace.svelte`: delete panelOpen/
PlacementSourcePanel wiring.
`apps/desktop/src/renderer/chrome/TitleStrip.svelte`: delete
Sources button.
`apps/desktop/src/renderer/PlacementSourcePanel.svelte`: delete.
`apps/desktop/e2e/outline.spec.ts`: placement flows; migrate
placement-sources coverage; drop stale sources testids from
helpers/specs.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and
**think**. Have you validated all aspects are **implemented** and
**tested**?
</CRITICAL_RULE>

- [x] Place on Current Canvas on node and note rows; takeover
      closes; placement lands at view center; failures toast.
      (Node rows: outline.spec asserts takeover closed, exactly one
      CreatePlacement, x/y at view center. Note rows: slice.spec
      item 9 places via the loose bin and sees the labeled dot.
      Failures ride the existing Workspace boardNotice → status.ts
      toast seam — wiring verified by reading, not e2e-injected.)
- [x] Drag from an outline row onto the board places at the drop
      world point (CreatePlacement for nodes, CreatePin for notes);
      one command per drop, undo removes it cleanly. (Note drag:
      outline.spec asserts the pin at the drop's world point, a
      command log of exactly ['CreatePin'], and DeleteDraftPin
      removing pin + placement with the attached note loose again.
      Node payload → one CreatePlacement at the drop point:
      import.spec drop-surface test.)
- [x] Dragging past the sheet edge closes the takeover so the board
      receives the drop. (Implemented as "past the originating
      row's bounds" — the outline sheet is full-bleed, so a literal
      sheet edge is unreachable mid-drag; see Issues. Asserted in
      outline.spec before the drop is dispatched.)
- [x] Canvas rows dive via navigateTo (history entry asserted via
      __ewNav.entries()/cursor()); note rows open the note panel
      (note-pane visible with the row's title).
- [x] PlacementSourcePanel, Sources button, ew-toggle-sources
      deleted; no orphaned imports or testids (repo-wide grep
      clean); `pnpm -r build` green.
- [x] e2e: unplaced node recovered from the loose bin onto the
      active canvas (slice item 21's stashed material); note placed
      by drag at a specific point; sources coverage migrated
      (import.spec test re-seeded via direct CreatePin and renamed;
      slice item 9 now flows through the outline).
- [x] Full desktop e2e suite green: 57 passed on the 70b8839 base
      (baseline 56 + this ticket's placement-flows test).

### Acceptance Criteria

**Scenario:** Recovering stashed material onto the board.
**GIVEN** an unplaced image node in the outline's loose bin.
**WHEN** the user clicks its Place on Current Canvas action.
**THEN** the takeover closes and the node appears at view center
as one undoable command.
**WHEN** the user drags a note row from a reopened outline onto a
board location.
**THEN** a pin with that note lands at the drop point, and undo
removes pin and placement together.
**AND** the title strip no longer offers Sources.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->

- **"Sheet edge" is unreachable on the outline sheet.** The design
  says the takeover closes when the pointer drags "past the sheet
  edge", but the outline sheet is full-bleed (only settings is
  inset), so a drag can never cross its edge while staying in the
  window. Implemented the operative equivalent: a window-level
  dragover watcher armed at dragstart closes the takeover the moment
  the pointer leaves the originating row's bounds. Any real drag
  toward the board triggers it immediately; jiggles inside the row
  do not. Flagging for lead review as an interpretation, not a
  literal reading.
- **The import-surfaces drop branch already existed.** The ticket
  says import-surfaces.ts "gains a branch" for the internal mime;
  the NODE_DRAG_MIME/NOTE_DRAG_MIME branches (CreatePlacement /
  CreatePin at the drop's world point) were already built for the
  panel era. Only comments changed there. Deviation from the ticket
  text: the payload stays on the existing two-mime scheme
  (application/x-ew-node + application/x-ew-note) rather than one
  mime carrying either id — same wire behavior, no dead code.
- **Right-aligned row actions are unclickable under the charm
  rail.** First cut pushed Place to the row's right edge
  (margin-left auto); the chrome layer (z 10) floats above the
  takeover (z 9) and the charm rail swallowed the clicks —
  Playwright caught it as "charm-outline intercepts pointer
  events". The action now sits inline after the row content, with a
  comment in the stylesheet.
- **Pre-existing inconsistency, left alone (review flag):** the two
  §6.10 zero-node-note paths use different dot tokens — Workspace's
  onPlaceNote (Place button) uses --ew-node-dot-default while
  import-surfaces' placeZeroNodeNote (drag) uses
  --ew-zero-node-note-dot. Both predate this ticket; unifying them
  is a one-line decision the lead may want.
- **Failure toasts are wired but not e2e-exercised.** Place failures
  route through the existing onPlaceNode/onPlaceNote handlers →
  boardNotice → status.ts toasts; forcing a CreatePlacement failure
  from the UI would need fault injection the suite doesn't have.
- **Worktree electron repair gotcha:** copying dist/ from the main
  repo with `cp -R src/dist dest/dist` nests dist/dist when the
  destination partially exists — every e2e launch then fails ENOENT.
  Flatten (ditto + mv) and check for
  dist/Electron.app/Contents/MacOS/Electron before running.
- import.spec's combined "placement sources + node context menu"
  test was renamed to "node drag payload on the drop surface (§6.3)
  and node context menu (§6.6)"; its §6.6 half is unchanged, seeded
  by a direct CreatePin at the view center instead of the panel.