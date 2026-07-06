---
node_id: AI-IMP-098
tags:
  - IMP-LIST
  - Implementation
  - canvas
  - feel
kanban_status: planned
depends_on:
parent_epic: [[AI-EPIC-010-hands-on-hardening]]
confidence_score: 0.8
date_created: 2026-07-06
date_completed:
---

# AI-IMP-098-zoom-smoothing

## Summary of Issue #1

Owner finding (2026-07-06, side-by-side with PureRef): our zoom is
jumpier. Diagnosis from the code: the wheel/pinch path applies the
camera mutation INSTANTLY per event (`zoomAt(…, Math.exp(-dy·k))`)
— §6.9's "eases toward the target rather than jumping" exists in
camera-flight but scroll/pinch bypass it. Input is not the problem
(Chromium delivers macOS's system-tuned pixel deltas with the
momentum tail; PureRef reads the same events). Done = wheel/pinch
zoom updates a TARGET and the camera chases it per frame with a
short damped ease; pan stays 1:1 passthrough; the constants are
dev-tunable live so the owner can dial against PureRef, then the
chosen numbers freeze as feel constants.

### Out of Scope

- Pan smoothing (Apple's deltas ARE the tuned curve for pan —
  1:1 with momentum stays).
- Camera-flight/fit behavior (already eased).
- Persisting tuning values as user settings (feel constants are
  not settings, §11.5).

### Design/Approach

A small zoom-chase in the engine: wheel/pinch events multiply a
`targetZoom` (anchored at the cursor point — the anchor must track
the TARGET math so the zoom stays cursor-centered through the
chase); a per-frame tick moves actual zoom toward target with
exponential smoothing (time-constant τ ≈ 50–90ms, frame-rate
independent: `k = 1 − exp(−dt/τ)`). Snap-to-target under an
epsilon so rest is exact. Pinch and Cmd+wheel share the chase.
Dev tuning: behind the existing dev/test surface (e.g. a
`window.__ewDebug.zoomTuning({tau, wheelSpeed, pinchSpeed})`
setter + current-value getter — NO settings UI), so the owner
tunes live in a dev session. Gesture interplay: an in-flight
zoom-chase must not fight camera flights or drags — study how
camera-flight cancels/holds and mirror it.

### Files to Touch

`packages/canvas-engine/src/camera.ts` or a new
`camera-zoom-chase.ts` (+tests: τ math frame-rate independence,
cursor anchoring through a chase, snap at epsilon);
`apps/desktop/src/renderer/canvas/host.ts` (wheel handler feeds
targets; rAF tick; __ewDebug tuning hooks);
e2e: extend canvas.spec or new — a synthetic wheel burst ends at
the exact analytic target zoom and the camera converges.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and
**think**. Have you validated all aspects are **implemented** and
**tested**?
</CRITICAL_RULE>

- [ ] Zoom chase in the engine with frame-rate-independent τ;
      cursor-anchored target math; epsilon snap; units.
- [ ] host.ts: wheel/pinch feed targets, pan untouched; chase
      cancels/yields correctly vs camera flights and gestures.
- [ ] __ewDebug zoom tuning hooks (dev/test only).
- [ ] e2e: wheel burst converges to the analytic target; zoom
      stays centered on the cursor point.
- [ ] Full gates.
- [ ] HUMAN-TESTING entry queued for the owner's PureRef
      side-by-side dial-in (lead adds on merge).

### Acceptance Criteria

**GIVEN** a trackpad pinch or Cmd+wheel burst
**WHEN** events arrive faster than frames
**THEN** the camera glides to the same final zoom the instant math
would have produced, anchored at the cursor, with no per-event
jumps — and at rest the zoom is exactly the target.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->
