---
node_id: AI-IMP-024
tags:
  - IMP-LIST
  - Implementation
  - canvas
  - input
  - feel
kanban_status: planned
depends_on: [AI-IMP-018]
parent_epic: [[AI-EPIC-009-canvas-feel-pass]]
confidence_score: 0.85
date_created: 2026-07-04
date_completed:
---

# AI-IMP-024-native-camera-input-and-cursors

## Summary of Issue #1

On a Mac trackpad the board fights muscle memory: every wheel event
zooms, so two-finger scroll (which should pan) lurches the zoom, and
pinch (delivered by Chromium as ctrl-flagged wheel events) gets no
special handling. The cursor never changes, so panning, dragging, and
handle interactions give no state feedback. RFC §6.9 (rev 0.9) now
specifies the mapping normatively. Done means: pinch zooms centered
on the pointer, two-finger scroll pans, discrete mouse-wheel zooms,
Space/middle-drag still pans, the cursor reflects interaction state,
and wheel-zoom speed has been tuned on real hardware.

### Out of Scope

Tool modes (B-for-move etc.); touch screens; configurable bindings
(open question 18 records the possible wheel-zoom/pan preference);
board-tooling's background-edit wheel capture (it intercepts before
the host handler and stays as-is); snapping/guides (AI-IMP-026).

### Design/Approach

Chromium encodes macOS trackpad pinch as `wheel` with `ctrlKey: true`
and fractional deltas; two-finger scroll arrives as plain `wheel`
with `deltaX/deltaY`. The host's `onWheel` splits on that: ctrl (or
metaKey) → `controller.wheel` zoom at pointer; plain → new
`camera.panByScreen(-deltaX, -deltaY)` path. Discrete mouse wheels
also emit plain wheel events — Phase 1 accepts that a physical mouse
wheel pans vertically (same trade Figma makes); Cmd+wheel zooms.
deltaMode is normalized (line/page → px multiplier) before use.
Zoom factor stays exponential; the constant is exposed once and tuned
by hand on hardware with the owner (record chosen value in ticket).
Cursor: a small `cursorFor(state, hover)` helper in the host maps
controller state (panning → grabbing; Space held → grab; gesture kind
→ move/resize/rotate cursors from the active driver; idle hover over
an item → move affordance) onto `app.canvas.style.cursor`, updated in
the existing pointermove/keydown paths — no new render plane, no
Svelte involvement. Handle-hover cursors are set by gestures-ui where
handles already hit-test.

### Files to Touch

`apps/desktop/src/renderer/canvas/host.ts`: split onWheel
(pinch/scroll/zoom), deltaMode normalization, cursor helper wired to
controller state; expose zoom-speed constant.
`packages/canvas-engine/src/camera.ts`: only if panByScreen needs a
delta clamp; otherwise untouched.
`apps/desktop/src/renderer/canvas/gestures-ui.ts`: cursor on handle
hover (resize/rotate directional cursors).
`apps/desktop/e2e/canvas.spec.ts`: wheel-mapping e2e (ctrl-wheel
zooms at pointer; plain wheel pans; camera asserted via __ewDebug).
`packages/canvas-engine/src/camera.test.ts`: only if camera changes.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and
**think**. Have you validated all aspects are **implemented** and
**tested**?
</CRITICAL_RULE>

- [ ] Add wheel-delta normalization (deltaMode 1/2 → px) and split
      onWheel in host.ts: ctrlKey/metaKey → controller.wheel (zoom at
      pointer), plain → camera pan by −deltaX/−deltaY.
- [ ] Preserve Space-drag and middle-button panning unchanged;
      confirm board-tooling's capture-phase wheel handler still wins
      during background edit mode.
- [ ] Expose the zoom-speed constant (single definition) and tune on
      hardware; record the final value in Issues Encountered.
- [ ] Implement cursorFor(state, hover) in host.ts: grabbing while
      panning, grab while Space held, default otherwise; update on
      pointermove, keydown/keyup, and state transitions.
- [ ] Add directional resize/rotate/move cursors on handle hover in
      gestures-ui.ts using its existing handle hit-test.
- [ ] e2e: dispatch ctrl-wheel at an offset point → camera zoom
      changes and the world point under the pointer is invariant;
      dispatch plain wheel → zoom unchanged, camera x/y shifted by
      the expected pan.
- [ ] e2e: cursor style asserted grabbing during Space-drag pan and
      default after release.
- [ ] Run gates: `pnpm -r build`, engine/persistence unit suites,
      desktop e2e, lint; manual trackpad checklist (pinch, two-finger
      pan, Cmd+wheel) verified by owner on hardware.

### Acceptance Criteria

**Scenario:** Trackpad user navigates the board.
**GIVEN** a canvas with placed content and the app focused
**WHEN** the user two-finger scrolls
**THEN** the camera pans by the scroll delta and zoom is unchanged.
**WHEN** the user pinches (ctrl-flagged wheel)
**THEN** the camera zooms and the world point under the pointer stays
fixed.
**WHEN** the user holds Space and drags
**THEN** the canvas pans and the cursor shows grabbing for the drag's
duration.

### Issues Encountered

<!-- Filled out post-work. -->

