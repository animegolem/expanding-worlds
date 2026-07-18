---
node_id: AI-IMP-310
tags:
  - IMP-LIST
  - Implementation
  - pins
  - tester-feedback
kanban_status: planned
depends_on:
parent_epic:
confidence_score: 0.7
date_created: 2026-07-17
date_completed:
---

# AI-IMP-310-pin-spawn-size-and-border

## Summary of Issue #1

First tester field doc (2026-07-17, item 10): the pin tool (§6.2
Create Pin) spawns "excessively small," and resizing it breaks
its border rendering. Done means: pins spawn at a ruled,
camera-aware default size that reads at the zoom it was placed
at, and the border/ring renders correctly across the full resize
range.

### Out of Scope

Pin semantics (§6.2 unchanged); the signature path-tail pin
(separate object); appearance-kind work (307's territory).

### Design/Approach

Round-1 source review convicted a geometry handoff, not a stroke
failure:

- The provisional was 31.2×44 screen px, while materialization
  carried no size or zoom (`pin-tool.ts:27-83` and
  `NotePanel.svelte:438-470` before this repair). The persisted dot
  therefore fell back to 24 world units (`placement.ts:20,417-426`),
  only 6 rendered px at 25% zoom.
- A dot has no border. The reported broken border is the selection
  chrome (`host.ts:893-928`). Resize could persist different width
  and height, dot rendering consumed width only, and hit/selection
  consumed both (`resize.ts:184-220`; `hit-test.ts:17-25,205-217`).
  That disagreement produced the apparent broken ring/ellipse.
- The 1.6 S3 pin-tool specimen names a 26px provisional mark. The
  accepted ruling supersedes its teardrop silhouette with a circle
  and adopts feel defaults of 26px spawn, 13px minimum, 104px
  maximum.

Implementation uses one camera-agnostic `CreatePin.diameter` in
world units. The renderer converts 26 screen px ÷ placement zoom
before opening the phantom; the command handler validates finite,
positive, dot-only input and writes the same diameter into the
existing placement width and height columns. No schema or second
command. Render, radial hit, selection bounds, and aspect-locked
resize share the same diameter; resize clamps its rendered size to
13–104px at the live camera zoom.

### Round-1 correction and follow-up ruling

The original review and first verdict both referred to “existing
optional CreatePin dimensions.” Fresh implementation-boundary review
found that seam does not exist: `CreatePinPayload` was dimensionless
and its handler wrote only image natural dimensions or NULL. Work
stopped before changes. The follow-up ruling authorized a narrow
`diameter?: number` extension, dot-only, with omitted callers retaining
their byte-compatible behavior. `DeleteDraftPin` needs no new inverse
data because it hard-deletes the placement; the regression confirms
the diameter disappears in the existing one-step inverse.

### Files to Touch

Pin creation default in commands/canvas seam (review cites); pin
rendering in canvas-engine; e2e/unit pins spec.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and
**think**. Have you validated all aspects are **implemented** and
**tested**?
</CRITICAL_RULE>

- [x] Round-1 review: cite spawn-size and border-draw mechanisms.
- [x] Spawn size camera-aware and ruled; recorded value + basis.
- [x] Border renders intact at min→max resize at both zoom
      extremes (visual capture evidence).
- [x] Unit: size derivation; e2e: place at far zoom-out → pin
      legible; resize sweep → border intact.
- [ ] HUMAN-TESTING entry for the feel value (lead-owned at wave close;
      suggested hand pass recorded below).

### Acceptance Criteria

**Scenario:** Placing and resizing a pin.
**GIVEN** a board at 25% zoom.
**WHEN** the user places a pin.
**THEN** it spawns legibly sized for the current camera.
**WHEN** the user resizes it across its range.
**THEN** the border/ring renders correctly at every size.

### Issues Encountered

- **Verdict seam corrected before code:** optional dimensions belonged
  to `CreatePlacementPayload`, not `CreatePinPayload`. The STOP round
  produced the authorized single-diameter interface above instead of
  splitting birth into two commands and breaking one-command undo.
- **Border hypothesis exonerated:** no dot border exists. Actual
  selection-chrome bounds are asserted square at the 13/26/104px
  states and again after zooming from 25% to 200%.
- **Mixed-selection disposition:** if legacy dots already differ by
  more than the 8× feel range, no uniform factor can satisfy both
  bounds. Minimum legibility wins deliberately; a regression records
  that maximum may be exceeded only in this already-impossible case.
- **Full-gate coordinate proxies corrected:** the prior detach test clicked
  the old square body's `+12,+12` corner, and the rename test derived a label
  point from disagreeing width/height. They now click the circle center and
  the renderer's measured label bounds respectively; the verb assertions are
  unchanged.
- **Owner hand pass suggested (lead-owned):** assess the 26px default
  and 13–104px resize range at 25%, 100%, and 200%; adjust feel
  constants only, with circle/one-diameter law held fixed.
