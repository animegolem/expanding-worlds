---
node_id: AI-EPIC-004
tags:
  - EPIC
  - AI
  - canvas
  - renderer
date_created: 2026-07-03
date_completed: 2026-07-04
kanban_status: completed
AI_IMP_spawned:
  - AI-IMP-017
  - AI-IMP-018
  - AI-IMP-019
  - AI-IMP-020
  - AI-IMP-021
  - AI-IMP-022
  - AI-IMP-023
---

# AI-EPIC-004-canvas-board-loop

## Problem Statement/Feature Scope

The product must "feel first like an excellent visual board" (RFC §1),
competitive with dedicated art-reference tools (§3.1). With the
renderer chosen (EPIC-001) and the domain core available (EPIC-003),
nothing yet draws a canvas, places content, or handles a single
gesture.

## Proposed Solution(s)

Build the Canvas Controller of RFC §13.1 owning camera, selection,
interaction state machine, hit testing, highlight mode, and
incremental sync to the chosen renderer across the three render planes
of §4.4. Deliver the interaction loop: image import surfaces (drop,
paste, browser drag with URL fetch) per §6.1; Create Pin per §6.2;
move/resize/rotate/reorder gestures committing one durable command
each per §10.2; decorations, grouping, lock/hide per §4.9/§6.8; image
and color backgrounds per §6.7; placement labels per §4.5; and the
§6.9 board tooling (align, distribute, flip, zoom-to-fit/selection,
snapping with smart guides). Meet the §12.1 engineering targets with
culling, texture budgeting, and tiled oversized backgrounds per §12.2.

## Path(s) Not Taken

No named layers, placement-specific appearance overrides, note preview
cards, auto-arrange/pack, or grid (all deferred with scope in the
RFC). The graph/data views and the note editor belong to EPIC-005/006.

## Success Metrics

- RFC §17 slice items 2–6, 9–10, 17–19 pass end to end.
- §12.1 targets hold: 500 pins, 150 visible images, 1,000 stress icons
  without interaction collapse; memory releases on canvas swap.
- Every continuous gesture commits exactly one durable command
  (verified by command-log assertion in Playwright).

## Requirements

### Functional Requirements

- [x] FR-1: Canvas Controller with camera, selection, hit testing, and renderer sync per §13.1.
- [x] FR-2: Three render planes with deterministic shared render_order per §4.4.
- [x] FR-3: Import surfaces (drop, paste, browser drag, URL fetch) per §6.1.
- [x] FR-4: Create Pin flow per §6.2; Place Existing per §6.3.
- [x] FR-5: Gesture pipeline: ephemeral state, one durable command per completed gesture.
- [x] FR-6: Decorations with grouping, ordering, lock, hide, anchored connectors per §4.9/§6.8.
- [x] FR-7: Image background operations and background color per §6.7.
- [x] FR-8: Placement labels with inline visibility toggle per §4.5.
- [x] FR-9: Align, distribute, flip, zoom-to-fit/selection, snapping with smart guides per §6.9.
- [x] FR-10: Culling, lazy textures, eviction, tiled oversized backgrounds per §12.2.

### Non-Functional Requirements

- Display tree remains a projection; domain state lives in EPIC-003's
  service only.
- Interaction latency stays within the §12.1 targets on the
  development machine.

## Implementation Breakdown

- AI-IMP-017 (lead): PixiJS 8 host, three render planes, scene
  projection + incremental sync, renderer registry seam,
  `getCanvasScene` query, `ew-asset://` blob protocol in main.
- AI-IMP-018 (lead): Canvas Controller — camera (pan/zoom/fitToBounds,
  `SetCanvasCamera` persist), selection, hit testing, interaction
  state machine, gesture contract (one durable command per gesture),
  `TransformContent` batch command, SnapProvider seam, CommandGateway.
- AI-IMP-019 (agent): move/resize/rotate gestures, reorder + flip UI,
  placement labels (proportional per rev 0.8) with selection-controls
  toggle.
- AI-IMP-020 (agent): `CreatePin` composite command; drop/paste/
  browser-drag/URL-fetch import surfaces; Create Pin dialog; Place
  Existing sources; attach/detach/make-independent menu.
- AI-IMP-021 (agent): decoration data schemas, renderers, creation
  tools (text/shapes/freehand/lines/arrows/connectors with anchors),
  group/lock/hide.
- AI-IMP-022 (agent): SnapProvider implementation + smart guides,
  align/distribute, zoom-to-fit/selection UI, §6.7 backgrounds with
  explicit edit mode + background color.
- AI-IMP-023 (lead): culling, texture budget/eviction, tiled oversized
  backgrounds, §12.1 perf harness, §17 slice e2e (items 2–6, 9–10,
  17–19) with command-log assertions, epic close.

Waves: 017→018 sequential (lead); then 019/020/021 in parallel
worktrees; 022 after 019 and 021 merge (snapping and arrange tune
against real gestures and decoration bounds); 023 closes on merged
master.
