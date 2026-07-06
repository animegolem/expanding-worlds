---
node_id: AI-IMP-082
tags:
  - IMP-LIST
  - Implementation
  - canvas
  - snapping
kanban_status: completed
depends_on:
parent_epic: [[AI-EPIC-010-hands-on-hardening]]
confidence_score: 0.85
date_created: 2026-07-06
date_completed: 2026-07-06
---

# AI-IMP-082-resize-snapping

## Summary of Issue #1

Owner feel finding (2026-07-06): smart guides appear while moving
but never while resizing — the snap seam (§6.9) is fully plumbed
(drivers receive the provider, return guides, host draws them) but
`gestures/resize.ts` never consults it ("Resize does not consult
snapping" is currently by design-gap, not decision). Dragging an
edge toward a neighbor's edge should snap and show the same guide
lines move shows. Done means: unrotated resize snaps the dragged
edge(s) to static content edges/centers with visible guides, with
the modifier interplay below, validated by engine units and one e2e.

### Out of Scope

- Rotated single items: their edges are not world-axis-aligned, so
  edge guides are ill-defined — the local-frame resize path skips
  snapping entirely.
- Grid snapping (stays deferred per §6.9).
- Snapping the NON-dragged edges or centers of the moving selection
  — only the edge(s) the handle drives participate.
- No changes to move snapping or its thresholds.

### Design/Approach

Extend `SnapQuery` with an optional edge mask
(`edges?: { x?: 'min' | 'max'; y?: 'min' | 'max' }`): when present,
the provider considers only those edges of `movingBounds` as snap
candidates (no centers, no opposite edges). The resize driver
(union-AABB path only) computes the proposed post-scale bounds,
queries with the dragged edge(s) mapped from the handle (e → x:max,
nw → x:min + y:min, …), applies the returned dx/dy to
`currentWorld`, and recomputes the scale factors once — the snapped
geometry flows through the existing per-member application
unchanged. Modifier interplay: Shift promises exact geometry
(aspect force, AI-IMP-041) so it disables snapping, exactly like
move (AI-IMP-043); Alt disables snapping (§6.9's disable modifier,
consistent with move) — it already frees image aspect, and both
readings are "get out of my way." Default image-aspect corner
resize keeps snapping: snap the dominant axis, let the locked
aspect follow (the guide is honest — that edge lands on the line).
Text decorations already scale uniformly from the union factors, so
no special handling. Guides return through the driver's existing
return value; the host overlay draws them today.

### Files to Touch

`packages/canvas-engine/src/snap.ts`: SnapQuery edge mask type.
`packages/canvas-engine/src/snap-provider.ts`: respect the mask in
candidate selection.
`packages/canvas-engine/src/snap-provider.test.ts`: mask units.
`packages/canvas-engine/src/gestures/resize.ts`: consult snap on
the union-AABB path; handle→edge-mask mapping; factor recompute.
`packages/canvas-engine/src/gestures/resize.test.ts`: snap + guide
units incl. modifier interplay and rotated-skip.
`apps/desktop/e2e/` (existing feel/gestures spec or new): one
resize-snap e2e.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and
**think**. Have you validated all aspects are **implemented** and
**tested**?
</CRITICAL_RULE>

- [x] snap.ts: add `edges` mask to SnapQuery; noop provider unchanged.
- [x] snap-provider.ts: masked queries offer only the named edges as
      moving candidates; unmasked behavior byte-identical (existing
      tests stay green untouched).
- [x] resize.ts: union-AABB path builds proposed bounds, queries with
      the handle's edge mask, recomputes sx/sy from adjusted pointer,
      returns provider guides; `disabled` when shift or alt held;
      rotated single-item path never queries.
- [x] Units: edge-mask provider tests; resize snaps e/se/n handles to
      a static edge; shift/alt produce zero snap and zero guides;
      rotated item skips; guides array surfaces through update().
- [x] e2e: drag-resize an image edge to within threshold of a
      neighbor edge → committed width lands exactly on the neighbor
      edge coordinate.
- [x] Full gates: `pnpm -r build`, unit suites, desktop e2e, lint.

### Acceptance Criteria

**Scenario:** Artist sizes an image against a neighbor.
**GIVEN** two placements side by side and snapping enabled
**WHEN** the artist drags the east edge of one to within the snap
threshold of the other's west edge
**THEN** the edge snaps onto it and a vertical guide line renders
for the duration of the hold.
**WHEN** the artist holds Shift or Alt and repeats
**THEN** the edge follows the pointer exactly and no guides render.
**GIVEN** a single placement rotated 45°
**WHEN** the artist resizes it
**THEN** behavior is unchanged from today (no snapping, no guides).

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->

- Deviation (refinement, not a change of behavior): the ticket says
  "applies the returned dx/dy to `currentWorld`" — applied verbatim
  that is only exact when the grab started precisely on the dragged
  edge. The driver instead maps the edge adjustment into pointer
  travel by the ratio of start offsets about the shared anchor
  (`(startWorld − anchor) / (edge − anchor)`, guarded against a
  zero-width axis), so the snapped edge lands on the stop to the
  world unit even when the grab started a few px inside the edge
  band. One recompute of sx/sy, as specified.
- Aspect-lock interplay: the dominant axis is decided ONCE from the
  raw pointer and pinned through the snap recompute; otherwise a
  snap adjustment could shrink the dominant factor below the other
  axis and flip dominance, pulling the snapped edge back off its
  guide. Under a lock only the dominant axis' edge enters the mask,
  so the single drawn guide is always honest.
- `edges` mask type carries explicit `| undefined` members — the
  repo builds with `exactOptionalPropertyTypes` and the driver
  constructs the mask with conditional (possibly undefined) values.
- e2e note: the acceptance scenario's Shift variant is covered in
  engine units, not e2e — Shift's aspect force makes an edge-handle
  Shift drag geometry-identical to the raw drag only for non-corner
  handles, and the Alt phase already proves the disable path
  end-to-end through the real modifier plumbing. Alt is pressed
  MID-drag in the e2e (option-at-start means duplicate, §6.9
  rev 0.21).
- Existing snap-provider and resize suites pass untouched; unmasked
  candidate arrays are byte-identical (mask absent → same
  edge/center/edge triple).
