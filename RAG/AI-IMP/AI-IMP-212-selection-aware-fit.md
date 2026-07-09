---
node_id: AI-IMP-212
tags:
  - IMP-LIST
  - Implementation
  - canvas
  - camera
kanban_status: planned
depends_on: []
parent_epic:
confidence_score: 0.9
date_created: 2026-07-09
---


# AI-IMP-212-selection-aware-fit

## Summary of Issue #1

Owner review (2026-07-09, v0.16.0): the zoom-to-fit button fits
ALL content even when a selection is active — he expected it to
frame the selection. `zoomToSelection()` exists but lives in the
selection sub-dock next to normalize, which he never found (the
198 discoverability theme). Owner: "makes sense on the selection
aware." Done means the fit verb (dock ⤢ button AND its ⇧1 chord)
is selection-aware: with a non-empty selection it frames the
selection's union bounds; with none it frames the stage extent as
today. The explicit "Zoom selection" button stays.

### Out of Scope

- Moving/redesigning the selection sub-dock (198's audit).
- flyTo/flight feel (unchanged primitive).

### Design/Approach

`board-tooling.ts zoomToFit()`: if
`unionBounds(controller.selectedItems())` is non-null, flyTo that
(same padding path as zoomToSelection — dedupe the two through one
helper); else current stage-extent path. Chord ⇧1 dispatches
through the same function (Dock.svelte ~190) so both agree. Update
the ⤢ tooltip copy if the kit voice wants it ("Zoom to fit —
selection first"? keep terse). E2e: select one of two distant
placements, fit → camera frames the selection; clear selection,
fit → frames all.

### Files to Touch

`canvas/board-tooling.ts`, `chrome/Dock.svelte` (tooltip only if
copy changes), board-tooling/navigation e2e.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [ ] Fit frames selection when present, all content when not;
      chord and button share one path.
- [ ] E2e both branches.
- [ ] Gates: build, per-package units, lint, e2e in 4+ foreground
      shards.
- [ ] HUMAN-TESTING entry appended at merge by the lead.

### Acceptance Criteria

**GIVEN** an active selection and a board with content elsewhere
**WHEN** the user hits ⤢ (or ⇧1)
**THEN** the camera frames the selection — and with nothing
selected, the same verb frames the whole stage.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->
