---
node_id: AI-IMP-064
tags:
  - IMP-LIST
  - Implementation
  - notes
  - shell
kanban_status: completed
depends_on: [AI-IMP-063]
parent_epic: [[AI-EPIC-006-shell-and-local-scope]]
confidence_score: 0.7
date_created: 2026-07-05
date_completed: 2026-07-05
---

# AI-IMP-064-note-panel-rehost

## Summary of Issue #1

Notes live in the EPIC-005 docked left pane; RFC §8.5 replaces it
with floating panels: a note opens **tethered** beside its node
(dashed tail, tracks the node through camera moves, chrome/type at
screen scale), one tethered panel at a time; a pin action converts
it to a screen-fixed panel; pinned panels accumulate and never
auto-unpin. The indicator escalates with spatial brokenness:
tethered = nothing; pinned + node on-screen = accent halo; node
off-screen = edge chip that flies home; node on another canvas =
origin label in the header (a navigation event). The active
canvas's own note is a screen-fixed lower-left corner charm
(ghost on approach when empty, solid when the note exists).
Panels show the subject node's tag chips; zero-node notes show
none. The CM6 editor controller, autosave gestures, flush seams,
link plugin, and conflict dialogs port unchanged — container-only
work. Covers FR-9 and FR-10. Done when the docked NotePane is
deleted and the full notes e2e suite passes against panels with no
editor-controller changes.

### Out of Scope

The in-panel Uses list and location chooser (065 — UsesSidebar
stays inside the panel as-is until then). Phantom-panel semantics
changes (§7.2 rules already implemented; only the host moves).
Panel content beyond notes. Toasts (066).

### Design/Approach

New NotePanel.svelte hosting the existing note-editor.ts
controller; a panels store manages one tethered + N pinned panel
records {noteId, mode, anchor}. Tethered anchor = placementId (or
corner charm); each frame the panel repositions from the camera
transform (reuse the adornment-plane math from 063; DOM panel,
canvas-independent — position via transform to keep text crisp).
Dashed tail is an SVG overlay between panel edge and node AABB.
Pin action (⇱ in header) switches mode to screen-fixed
coordinates. Escalation states derive per frame: node in viewport
(halo drawn in adornment pass), off-screen (edge chip at viewport
boundary pointing along the direction vector, click = flyTo), on
another canvas (header origin label naming it, click = 060
navigateTo). open-note.ts's requestOpenNote/onRevealNote events
retarget to the panels store — call sites unchanged. Corner charm:
screen-fixed lower-left, ghost on cursor approach when no canvas
note exists, solid otherwise, toggles a panel anchored to itself.
App.svelte drops the NotePane grid column; NotePane.svelte
deleted. notes.spec migrates selectors (panel testids) but keeps
every scenario — the epic's success metric is this suite passing
with the controller untouched.

### Files to Touch

`apps/desktop/src/renderer/note/NotePanel.svelte`, `panels.ts`:
new host + store.
`apps/desktop/src/renderer/NotePane.svelte`: deleted.
`apps/desktop/src/renderer/App.svelte`: grid collapses to
full-bleed canvas + chrome.
`apps/desktop/src/renderer/note/open-note.ts`: events retarget to
panels store (signatures unchanged).
`apps/desktop/src/renderer/canvas/host.ts`: halo/edge-chip
adornments; corner charm.
`apps/desktop/e2e/notes.spec.ts` + `helpers.ts`: selector
migration; new pin/escalation/corner-charm cases.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and
**think**. Have you validated all aspects are **implemented** and
**tested**?
</CRITICAL_RULE>

- [x] NotePanel hosts the untouched note-editor controller;
      autosave/flush/link/conflict behavior verified by the
      existing suite (no diffs under note/note-editor.ts,
      wiki-link-plugin.ts, link-resolution.ts, suggestions.ts).
- [x] Tethered panel: opens beside its node anchored to the
      summoning control, dashed tail, tracks camera (pan/zoom
      keeps tail attached, type at screen scale); opening another
      note replaces it.
- [x] Pin: ⇱ converts to screen-fixed; pinned panels accumulate;
      nothing auto-unpins (navigation, canvas switch, and new
      tethered opens leave pinned panels alone).
- [x] Escalation: halo when pinned + on-screen; edge chip when
      off-screen (click flies home); origin label when
      cross-canvas (click navigates via navigateTo and enters
      history); each state exists exactly while its condition
      holds.
- [x] Corner charm lower-left: ghost on approach when canvas note
      absent, solid when present; click toggles the anchored
      panel; phantom persists nothing until first committed edit
      and the charm turns solid at that moment.
- [x] Tag chips in panel header from the subject node; zero-node
      note shows none.
- [x] NotePane deleted, App grid collapsed; no orphaned imports;
      `pnpm -r build` green.
- [x] Full notes e2e suite green against panels hidden-window;
      new e2e for pin accumulation, all three escalation states,
      corner charm ghost→solid.

### Acceptance Criteria

**GIVEN** a note opened from a node's page charm
**WHEN** the camera pans until the node leaves the viewport after
the panel is pinned
**THEN** the panel stays screen-fixed and an edge chip points
toward the node; clicking it flies home and the chip disappears.

**GIVEN** a pinned panel whose node lives on another canvas
**WHEN** the user clicks the header's origin label
**THEN** that canvas opens as a history entry.

**GIVEN** an empty canvas note (corner charm ghost)
**WHEN** the user opens it and types
**THEN** the note persists on first committed edit and the charm
renders solid.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->
The panel KEEPS the note-pane testids — §8.5 says the panel IS the
note pane's realization — so the full EPIC-005 notes suite passed
with only the shell launch assertion changed, and zero diffs under
note-editor.ts / wiki-link-plugin.ts / link-resolution.ts /
suggestions.ts (verified by git diff). Findings and deviations:
(1) A real race my rehost introduced: the store's fallback rename
(no panel holds the note) uses its own gateway, which learns the
just-flushed buffer's commit revision only via the async
project-changed push — the rename died as a silent conflict.
Fixed with checkRevision:false (RenameNote targets a stable id);
a §7.7 conflict on this no-panel path degrades to a toast, since
the dialog needs an owning panel. (2) CM6 lesson: a content-sized
editor puts a center click ON the text line and Ctrl-End is
unbound on mac — the docked pane worked only because its editor
filled a tall column, so clicks below the text snapped to doc end.
The panel editor gets a definite 16rem height. (3) Window-is-the-
board fallout in two other suites: import.spec's "cursor off the
canvas" now requires a synthesized pointerleave (there is no
docked chrome to park the pointer on), and board-tooling's stage
flight frames differently in the 300px-wider viewport (camera
reset before its screen-coordinate click). (4) Edge chips clamp
48px in from the viewport edges — the corner chrome floats a
z-layer above the panels layer and was eating their clicks.
(5) The §8.5 canvas phantom materializes with title-from-first-
line (§6.2's rule) via CreateNote + AttachNoteToNode; Escape
persists nothing. (6) The Uses sidebar still renders inside the
panel and node-menu's duplicate Open Note row survives — both are
065's churn (it rebuilds those exact surfaces). (7) Anchorless
opens (zero placements on the active canvas) park at a calm
default position; the §7.3 link-anchored handoff is 065 scope.
