---
node_id: AI-IMP-065
tags:
  - IMP-LIST
  - Implementation
  - notes
  - navigation
kanban_status: planned
depends_on: [AI-IMP-060, AI-IMP-064]
parent_epic: [[AI-EPIC-006-shell-and-local-scope]]
confidence_score: 0.75
date_created: 2026-07-05
date_completed:
---

# AI-IMP-065-uses-list-and-location-chooser

## Summary of Issue #1

The Uses list is a docked sidebar (UsesSidebar.svelte) and §7.3
link activation dead-ends: Workspace.svelte posts a "chooser
arrives with navigation" notice for the many-placements case and
cannot fly cross-canvas at all. Per RFC §7.3–7.4 (rev 0.17) this
ticket moves the Uses list in-panel behind the header's "⌖ n
places" control (rows grouped by canvas, Unplaced group last,
"here" marking the placement being read) and ships full activation
behavior: zero placements = inline notice at the link offering the
loose-note panel; one = fly there (cross-canvas via navigateTo)
AND the note opens tethered at the destination, anchored to the
clicked link until spatial resolution lands, then re-tethered;
many = location chooser panel anchored to the clicked link,
sharing the Uses row grammar. Covers FR-11; closes slice item 16.

### Out of Scope

Tag-panel rows (EPIC-013) — the shared row grammar is built here
and reused there. §6.10 placement flows themselves (exist; rows
keep invoking them). Quick-open (EPIC-013).

### Design/Approach

UsesSidebar's content (getNoteUses query, grouping, placement
actions from AI-IMP-049) transplants into a UsesList.svelte
rendered inside NotePanel behind the "⌖ n places" header
disclosure; the docked sidebar and its Workspace toggle retire.
Rows: canvas-grouped, thumbnail + label, per-row fly-to and Place
actions, Unplaced last, "here" tag on the placement whose panel
you are reading. Row click on another canvas = navigateTo + flyTo
placement + selection (a history entry). Activation: the
onRevealNote handler in Workspace.svelte moves into the panels
layer — zero placements shows the §7.2 inline notice anchored at
the link with "open note" opening a loose-note panel; one
placement flies (cross-canvas allowed now) and opens the note
tethered at the destination with the anchor handoff (panel anchors
to the clicked link's screen position, re-tethers to the placement
when the flight lands); many opens the chooser panel anchored to
the link — same UsesList rows, choosing one performs the
one-placement behavior. The chooser is a panel per the one-physics
rule and follows panel dismissal norms (Esc, click-away).

### Files to Touch

`apps/desktop/src/renderer/note/UsesList.svelte` (new, from
UsesSidebar content); `UsesSidebar.svelte` deleted.
`apps/desktop/src/renderer/note/NotePanel.svelte`: ⌖ n places
header + disclosure.
`apps/desktop/src/renderer/note/LocationChooser.svelte` (new).
`apps/desktop/src/renderer/note/open-note.ts` + panels store:
activation pipeline with anchor handoff.
`apps/desktop/src/renderer/Workspace.svelte`: onRevealNote interim
handler removed.
`apps/desktop/e2e/notes.spec.ts` (+ navigation.spec): zero/one/many
including cross-canvas flight; uses-list grouping and "here".

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and
**think**. Have you validated all aspects are **implemented** and
**tested**?
</CRITICAL_RULE>

- [ ] UsesList in-panel behind "⌖ n places": canvas groups,
      Unplaced last, "here" marker correct for the reading
      placement; count in header live-updates on placement
      changes.
- [ ] Row actions preserved from AI-IMP-049 (fly-to, Place on
      Current Canvas, place-note) with identical command
      payloads; cross-canvas row click navigates via navigateTo
      and enters history.
- [ ] Zero placements: inline notice anchored at the activated
      link; "open note" opens the loose-note panel; canvas
      viewport untouched.
- [ ] One placement: flight (same- and cross-canvas) + note opens
      tethered at the destination; anchor starts at the clicked
      link and re-tethers on arrival (no flash of unanchored
      panel).
- [ ] Many placements: chooser panel anchored to the clicked
      link, shared row grammar; selection executes the
      one-placement path; Esc dismisses.
- [ ] UsesSidebar + Workspace interim notice deleted; no orphaned
      events; `pnpm -r build` green.
- [ ] e2e: zero/one/many scenarios including a cross-canvas
      flight that Back reverses; uses grouping asserted; full
      gates green hidden-window.

### Acceptance Criteria

**GIVEN** a note placed once on another canvas
**WHEN** its wiki link is activated from an open panel
**THEN** the app flies to that canvas and placement as a history
entry, the note opens tethered there, and Back returns to the
origin canvas with viewport restored.

**GIVEN** a note with three placements across two canvases
**WHEN** its link is activated
**THEN** a chooser anchored to the link lists rows grouped by
canvas, and choosing one flies there and tethers the note.

**GIVEN** a note with zero placements
**WHEN** its link is activated
**THEN** an inline notice at the link offers opening the loose
note and the camera does not move.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->
