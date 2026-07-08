---
node_id: AI-IMP-195
tags:
  - IMP-LIST
  - Implementation
  - canvas
  - rendering
  - perf
kanban_status: planned
depends_on: []
parent_epic:
confidence_score: 0.6
date_created: 2026-07-08
---


# AI-IMP-195-image-crispness

## Summary of Issue #1

Owner testing perception (2026-07-08, v0.15.0): images sometimes
read "soft in hard-to-define ways." Lead diagnosis (session
2026-07-08): NOT the stroke floor (vector-only). Two real causes:
(1) placement textures use auto-generated mipmaps with default
trilinear sampling — deliberately chosen against minification
shimmer (host.ts loadTexture comment) — which low-passes hardest
at fractional zooms between mip levels (softest ~midway between
100/50/25%); placements' mips are GPU box-chain quality while the
background TILES already use createImageBitmap
`resizeQuality:'high'` — a quality asymmetry; (2) a known DPR
footgun: renderer resolution reads devicePixelRatio ONCE at mount
(AI-IMP-029 comment admits it), so moving the window to a
different-DPR monitor renders permanently soft until relaunch.
Done means: (a) the DPR bug is fixed (track window screen changes,
re-init resolution); (b) a measured A/B of minification quality
options ships behind a dev toggle for the owner's eyes on real
art — at minimum current-trilinear vs high-quality-pyramid
(tiles-style resizeQuality levels) and/or LOD bias — with the
findings recorded and the winner defaulted.

### Out of Scope

- Changing antialias/MSAA (geometry AA is fine).
- The §12.2 tile pipeline (already high-quality).
- Integer-zoom snapping (feel change — design conversation if the
  A/B points there).

### Design/Approach

DPR: listen for window moves across displays (Electron
`web-contents` / `window.matchMedia('(resolution:)')` change) and
update `renderer.resolution` + reflow (verify Pixi v8 supports
live resolution change; if it demands re-init, STOP and report
cost). Crispness A/B: add a dev-only toggle (the zoomTuning dial
idiom, AI-IMP-098) switching placement texture pipelines:
(current) GPU automips · (B) offline pyramid via createImageBitmap
resizeQuality:'high' at 1/2..1/16 wired as manual mip levels or
as zoom-band texture swap · (C) optional GL LOD bias. Measure:
screenshot the same board at 44%/67%/87% zoom per mode (the perf
suite's screenshot harness), plus subjective owner pass. Record
findings in Issues Encountered; default the winner; remove or keep
the toggle per owner feel.

### Files to Touch

`apps/desktop/src/renderer/canvas/host.ts` (loadTexture, app init,
DPR tracking), possibly `packages/canvas-engine` texture seam,
dev-toggle surface. Units where logic (pyramid level math); the
visual A/B is a local hardware gate like perf (not CI).

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [ ] DPR tracked live across monitor moves; crisp after a move
      (manual verify + unit for the handler wiring).
- [ ] A/B toggle with at least modes A/B; screenshots captured at
      three fractional zooms per mode.
- [ ] Findings + recommendation recorded; winner defaulted.
- [ ] No perf regression (local perf suite within budgets).
- [ ] Gates: `pnpm -r build && pnpm -r test && pnpm lint` + hidden
      e2e.
- [ ] HUMAN-TESTING entry appended at merge by the lead (the
      owner's eyes are the final gate on real art).

### Acceptance Criteria

**GIVEN** the window moved to a different-DPR display
**THEN** rendering is crisp without relaunch.
**GIVEN** the same artwork at 44% zoom in each A/B mode
**THEN** the recorded screenshots demonstrate the difference and
the shipped default is the owner-preferred mode.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->
