---
node_id: AI-EPIC-009
tags:
  - EPIC
  - AI
  - canvas
  - feel
  - polish
date_created: 2026-07-04
date_completed:
kanban_status: backlog
AI_IMP_spawned:
---

# AI-EPIC-009-canvas-feel-pass

## Problem Statement/Feature Scope

First hands-on use of the EPIC-004 build was jarring where it should
have been invisible: trackpad gestures don't work (two-finger scroll
zooms instead of panning; pinch does nothing special), an uploaded
image turned into a black box after a move, adornments appear to
separate from their object during drags, snap guides flash
aggressively, the arrowhead renders with a lump, and there is no way
to remove anything from the board. The RFC's opening promise is
"feels first like an excellent visual board" (§1); none of these are
inherent to the stack, and all of them will dominate an artist
tester's first impression. This is the 004.1 feel-and-correctness
pass, before EPIC-005 builds the second floor. RFC rev 0.9 carries
the normative decisions (§6.8, §6.9, §9.2).

## Proposed Solution(s)

Make the existing board loop feel like a native Mac tool. Camera
input follows platform muscle memory per §6.9: pinch zooms at the
pointer, two-finger scroll pans, wheel zooms, Space/middle-drag pans,
and the cursor communicates state (grab while panning, directional
over handles). Moving content is boringly smooth: the black-box
texture-residency bug is reproduced and fixed, and the object, its
selection outline, handles, and label provably move in the same frame.
Snapping becomes quiet per §6.9: thin dotted low-opacity guides shown
only while a snap is engaged, with hysteresis so content stops
oscillating at the threshold. Arrows render as a single filled block
polygon (shaft and head in one poly — no stroke/fill seam, no cap
lump), with a geometry pass over every decoration kind at multiple
stroke widths and zoom levels. Delete/Backspace removes the selection:
placements per §9.2 (bare-node auto-trash with the Keep in Project
notice; invested nodes stay active with an Unplaced pointer) and
decorations with a tested inverse. Z-order actions (forward, backward,
front, back) become reachable on any selection so occluded content is
recoverable, and Select All plus zoom-to-fit-everything round out the
safety nets. Wheel-zoom speed is tuned by hand on real hardware.

## Path(s) Not Taken

No grouping primitive beyond the existing canvas-local presentation
groups — frames are deferred per §6.8/§19. No canvas contents outline
(deferred with scope, §14.3, navigation iteration). No tool-mode
system (B-for-move etc.) — cursor-follows-context first; modes only
if complexity later justifies itself. No panel/chrome rework (§8.2
design language guides later epics). No arrow-style variations UI —
the schema leaves room; only the default rendering changes.

## Success Metrics

- On a Mac trackpad: pinch zooms at the pointer, two-finger scroll
  pans, and a scripted manual feel checklist (drag, resize, rotate,
  snap, zoom) passes with no visible adornment lag or texture
  drop-out, verified by the project owner on hardware.
- The black-box repro (import image, move it, texture stays correct
  through cull/residency cycles) is fixed and guarded by an automated
  test that asserts texture state, not just scene state.
- Delete/Backspace on any selection empties it from the board with
  §9.2 semantics, covered by e2e including the bare-node notice path.
- Snap guides render dotted/low-opacity only while engaged and
  release with hysteresis, asserted via __ewDebug.guides in e2e.
- All existing gates stay green: full unit suites, 15 desktop e2e,
  §12.1 perf suite on hardware GL, lint.

## Requirements

### Functional Requirements

- [ ] FR-1: Trackpad/mouse camera input per §6.9 — pinch (ctrl-wheel)
      zooms at the pointer, plain two-finger scroll pans by delta,
      Space/middle-drag pans; wheel-zoom speed tuned on hardware.
- [ ] FR-2: Cursor state feedback — grab/grabbing while panning,
      directional resize/rotate cursors over handles, default
      otherwise.
- [ ] FR-3: Black-box texture bug reproduced, root-caused in the
      residency/cull path, fixed, and regression-tested at the
      texture-state level.
- [ ] FR-4: Drag fidelity — selection outline, handles, and labels
      update in the same frame as the object during ephemeral
      gestures; no repaint flash at gesture commit.
- [ ] FR-5: Snap feel per §6.9 — dotted, reduced-opacity guides
      rendered only while a snap is engaged; engage/release
      hysteresis; threshold reviewed against real drags.
- [ ] FR-6: Arrow renders as one filled block polygon derived from
      endpoints plus thickness; geometry pass over line, shape, path,
      connector at multiple widths and zooms (visual approval by the
      project owner).
- [ ] FR-7: Delete/Backspace removes selected placements per §9.2
      (bare-node auto-trash + Keep in Project notice; invested-node
      notice) and selected decorations with a tested inverse.
- [ ] FR-8: Z-order controls (bring forward/backward, to front/back)
      reachable on any selection — keyboard and context surface —
      covering both placements and decorations.
- [ ] FR-9: Select All (Cmd+A) and zoom-to-fit-everything when
      nothing is selected.

### Non-Functional Requirements

- No persistence schema changes expected; if a command is added
  (decoration delete), it follows the envelope/inverse contract and
  ships with round-trip tests.
- §12.1 perf suite remains green on hardware GL; no new frame-time
  regressions from cursor/guide work.
- Renderer never touches persistence or SQL (RFC §11.1); feel fixes
  stay inside canvas-engine and the desktop renderer host.
- Existing e2e remain green; new behavior lands with e2e where
  automatable and an explicit manual-checklist note where not
  (feel items 1, 4, 6 include a human pass).

## Implementation Breakdown

To be filled as AI-IMP tickets are cut.
