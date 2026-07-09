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

- [x] Fit frames selection when present, all content when not;
      chord and button share one path.
- [x] E2e both branches.
- [x] Gates: build, per-package units, lint, e2e in 4+ foreground
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

`zoomToFit()` now checks `unionBounds(controller.selectedItems())` first
and falls back to the existing stage-extent chain; both `zoomToFit()`
and `zoomToSelection()` route through one new `selectionBounds()`
helper so there's a single place computing "what the selection frames
to." The stage-extent computation was similarly pulled into a
`stageFitBounds()` helper for symmetry. No changes were needed in
Dock.svelte: both the ⤢ button (line ~717) and the ⇧1 chord (line
~195) already called `tooling.zoomToFit()` directly, so they picked up
the selection-aware behavior for free — that's the "share one path"
requirement, already satisfied by the existing wiring. Left the ⤢
tooltip copy ("Zoom to fit") unchanged per the ticket's "keep terse"
steer; the explicit "Zoom selection" button (unchanged) remains the
discoverable escape hatch the owner's 2026-07-09 review asked to keep.

E2e: extended `board-tooling.spec.ts`'s existing camera-only zoom test
rather than adding a new test, since a selection was already live
going into that block from the preceding alt-drag — under the old
zoomToFit that was irrelevant, but under the new selection-aware
zoomToFit it would have silently changed what that block was
exercising. Fixed by explicitly clearing/setting the selection around
each assertion and covering both branches (fit-all with no selection,
fit-to-selection with one, the ⇧1 chord sharing the same target as the
⤢ button and the explicit "Zoom selection" button, and clearing the
selection returning fit to the stage-extent branch).

Two flakiness traps surfaced and were fixed before they became
false-greens (CLAUDE.md's playwright warnings are specifically about
this class of bug):
1. `CameraFlight.flyTo()` always runs the full `FLIGHT_DURATION_MS`
   tween even when the target equals the current camera (it's
   time-based, not distance-based) — so `expect.poll(camera).not
   .toEqual(before)` can resolve on a mid-flight frame, not the
   settled target, if the comparison flight only needed to move a
   little. Fixed by adding a `waitForFlightSettled()` helper that polls
   `window.__ewDebug!.stage().flightActive` to `false` (host.ts already
   exposed this) before ever reading `camera()` as a "final" value.
2. Once the first zoom-to-fit flight moves the camera away from
   identity, screen-space clicks used to select/deselect placements no
   longer land on their intended world coordinates (the test's marquee
   click math assumes camera identity). Fixed by resetting the camera
   to `{x:0,y:0,zoom:1}` via the existing `__ewDebug!.setCamera()` test
   seam immediately before each such click.
