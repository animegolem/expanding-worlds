---
node_id: AI-IMP-071
tags:
  - IMP-LIST
  - Implementation
  - tags
kanban_status: completed
depends_on: [AI-IMP-069]
parent_epic: [[AI-EPIC-013-global-views]]
confidence_score: 0.75
date_created: 2026-07-05
date_completed: 2026-07-06
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

- [x] getTagView returns per-node active placement locations with
      canvas labels; persistence units cover placed, multi-placed,
      and unplaced carriers.
      (Also gained `noteId` and `childCanvasId` per carrier — the
      row's open-note action and ⊡ glyph need them and the ticket's
      no-N+1 rule forbids fetching them per row. Labels follow the
      outline convention: owner's note title, else short code; the
      root canvas reads "Home" like the navigation stack's root
      entry. Trashed placements excluded, unit-covered.)
- [x] tag-panel store: one instance, anchor-positioned, Escape
      closes, reopen replaces tag and anchor.
      (`tags/tag-panel.ts`; anchor is the §8.5 client-point grammar
      the location chooser uses, clamped by the component. Escape is
      LAYERED — see Issues.)
- [x] TagPanel rows via NodeRow + location line; unplaced carriers
      row with loose badge; per-row open-note works.
- [x] Fly-to: same-canvas selects + flyTo; cross-canvas goes
      through navigateTo (history entry) then centers after the
      scene applies.
      (Both through the onCenterPlacements seam; e2e also asserts
      same-canvas fly-to adds NO history entry.)
- [x] Completion field: type-ahead against listTags, picking swaps
      the panel's tag; exactly one tag at a time.
      (Custom list per the AI-IMP-069 rule — never <datalist>;
      Enter on an exact name also swaps.)
- [x] Door 1: charm-bar # chip click opens the panel on that tag,
      anchored to the chip. Door 2: note-panel tag chip ditto.
- [x] Lens toggle rendered in the header; wired to the 072 host API
      when present, else disabled with an "arrives with the lens"
      tooltip.
      (072 merged before this ticket ran, so the toggle is wired
      LIVE — no feature-detect, no deferred tooltip. On =
      setLens(carrier placements on the active canvas), off =
      clearLens; onLensChanged unsets the toggle when Escape peels
      the lens engine-side; disabled only when the tag has no
      carrier on the active board.)
- [x] e2e: both doors, cross-canvas fly-to lands centered with a
      Back entry, unplaced carrier listed.
      (`e2e/tags.spec.ts`: plus lens dim/toggle sync, layered
      Escape, viewport restore on Back, completion swap.)
- [x] `pnpm -r build`, full gates green.
      (build + lint green; persistence 381 passed — baseline 379 +
      2 new units; desktop unit 11 passed; full Playwright suite
      58 passed, 0 flaky — baseline 56 + 2 new.)

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

- **Lens toggle wired live, not disabled.** The ticket predates the
  072 merge order; 072's host API (`setLens`/`clearLens`/`lens`/
  `onLensChanged` on CanvasHostHandle) was merged before this ticket
  ran, so the "disabled with a deferred tooltip" fallback was never
  built. The two riding checklist items in AI-IMP-072 are checked
  off there with a delivered-here note.
- **Layered Escape needed capture-phase handling.** "Escape closes
  the panel" collides with 072's engine Escape (peels lens, then
  selection) — both listen on window, and the host registered
  first. The panel uses a capture-phase window keydown: with a lens
  active it declines the event (the host peels the lens; the toggle
  follows via onLensChanged; the panel stays — matching 072's
  "toggle resets" acceptance), with no lens it closes the panel AND
  consumes the press (stopPropagation) so the host does not also
  clear the board selection under the closing panel. One layer per
  press, e2e-asserted. Reviewer note: the stopPropagation also
  suppresses gestures-ui's window keydown (duplicate-drag cancel)
  for that single press — only reachable mid-drag with the panel
  open and no lens.
- **getTagView note join tightened.** The old query LEFT JOINed
  `note` without a lifecycle filter, so a trashed note's title
  could label a carrier row; the rewrite filters
  `lifecycle_state = 'active'` like getCanvasScene/getOutlineTree
  do. Behavior change visible only with a trashed shared note.
- **Same-canvas fly-to is deliberately not a history event** —
  requestCenterPlacements only; the e2e pins this (§8.1 says
  cross-canvas jumps enter history, and the Workspace seam already
  handles the bounded scene-wait for the cross-canvas case).
- **Worktree friction (same as 072's session):** fresh worktree had
  no workspace dists (`pnpm -r build` needed before anything) and
  Electron's package was a husk (dist/ contained only
  LICENSES.chromium.html, no path.txt); copied `dist/` + `path.txt`
  from the main repo's electron@39.8.10 store per the known repair.
- `RAG/scripts/generate-index.sh` NOT run and kanban_status left
  untouched — lead's merge-time call; regenerating INDEX.md from a
  worktree collides with parallel agents.
