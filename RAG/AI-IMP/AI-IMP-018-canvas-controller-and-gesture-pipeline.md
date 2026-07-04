---
node_id: AI-IMP-018
tags:
  - IMP-LIST
  - Implementation
  - canvas
  - controller
  - gestures
kanban_status: completed
depends_on: [AI-IMP-017]
parent_epic: [[AI-EPIC-004-canvas-board-loop]]
confidence_score: 0.75
date_created: 2026-07-04
date_completed: 2026-07-04
---

# AI-IMP-018-canvas-controller-and-gesture-pipeline

## Summary of Issue #1

RFC §13.1 requires a Canvas Controller owning camera, selection,
interaction state machine, hit-testing policy, highlight mode, and
durable command coalescing — none exists, and the domain has no way to
commit a multi-selection transform as one command (invariant 25: one
durable command per completed gesture). Build the controller in
`@ew/canvas-engine`, the `TransformContent` v1 batch command and
`SetCanvasCamera` v1 persist command in persistence, and wire pointer
input in CanvasHost. Done means: pan, zoom-at-cursor, click/shift/
marquee selection, and camera persistence work in the app; the gesture
contract and SnapProvider seam are in place with tests for 019/021/022
to build against.

### Out of Scope

Move/resize/rotate/reorder gestures and labels (AI-IMP-019).
Decoration tools (AI-IMP-021). Snapping implementation, align/
distribute, zoom-to-fit UI (AI-IMP-022 — the camera `fitToBounds`
primitive lands here). Highlight-mode consumers (§7.5, EPIC-005).

### Design/Approach

CanvasController is framework-free TS: camera {x, y, zoom} with
world↔screen transforms, wheel zoom anchored at the cursor with
clamped zoom range, and `fitToBounds(rect)` as the camera primitive
behind zoom-to-fit/selection (§6.9: camera-only, never durable).
Camera persists per §4.4 via `SetCanvasCamera` v1: inverse `null`,
debounced on camera rest and flushed on canvas leave/quit — the
EPIC-007 undo stack will skip inverse-null commands. Selection is a
set of item ids with click, shift-toggle, and marquee (overlay-plane
rect); hit testing walks content-plane items top-down by render_order,
skipping locked/hidden decorations and the background plane. The
interaction state machine (idle → pan | marquee | gesture-pending →
gesture) is the single owner of pointer state. The gesture contract:
`beginGesture(items)` snapshots prior transforms; `updateGesture`
mutates display objects only (ephemeral, §10.2); `commitGesture`
issues exactly one `TransformContent` command carrying prior + next
values; `cancelGesture` restores the snapshot. `TransformContent` v1
payload: {canvasId, items: [{kind:'placement', placementId, set:{x,y,
width,height,scale,rotation}} | {kind:'decoration', decorationId,
data}]}, validated same-canvas and active; inverse is the same command
with prior values. A `SnapProvider` interface (query(movingBounds) →
{snappedDelta, guides}) ships with a no-op default; AI-IMP-022
implements it. A `CommandGateway` wraps `window.ew.project.execute`
with revision threading and conflict surfacing for all canvas UI.

### Files to Touch

`packages/commands/src/payloads/structure.ts`: TransformContent + SetCanvasCamera payloads/constants.
`packages/persistence/src/handlers/placements.ts` (or new `handlers/transform.ts`): TransformContent handler + inverse.
`packages/persistence/src/handlers/canvases.ts`: SetCanvasCamera handler (inverse null).
`packages/persistence/src/handlers/*.test.ts`: handler tests.
`packages/persistence/src/service.ts`: registration (append-only).
`packages/canvas-engine/src/{controller.ts,camera.ts,selection.ts,hit-test.ts,gesture.ts,snap.ts,command-gateway.ts}`: controller core.
`packages/canvas-engine/src/*.test.ts`: unit tests per module.
`apps/desktop/src/renderer/canvas/host.ts` + `CanvasHost.svelte`: pointer/wheel/key wiring, selection visuals, camera persist debounce.
`apps/desktop/e2e/canvas.spec.ts`: pan/zoom/selection/camera-persist e2e.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [x] `TransformContent` v1: payload type, handler applying placement transform columns and decoration `data` replacement in one transaction, same-canvas + active validation, inverse with prior values; tests: multi-item apply, inverse round-trip, mixed placement+decoration, stale-revision conflict, cross-canvas rejection.
- [x] `SetCanvasCamera` v1: persists camera JSON, inverse null, no-op on trashed canvas; tests incl. command_log row present.
- [x] Camera module: world↔screen, pan, wheel-zoom anchored at cursor with min/max clamp, `fitToBounds` with padding; unit tests for anchor invariance (world point under cursor fixed through zoom) and fit math.
- [x] Hit-test module: top-down render_order walk, per-kind bounds (placement rect w/ rotation, decoration bounds from data), skip locked/hidden; unit tests incl. tie-break and rotated bounds.
- [x] Selection model: click select, shift toggle, marquee intersect, clear on empty click; selection-changed callback for UI chrome; unit tests.
- [x] Interaction state machine: idle/pan(space or middle-drag)/marquee/gesture-pending(threshold)/gesture; transition unit tests; Escape cancels active gesture.
- [x] Gesture contract: begin/update/commit/cancel as specified; commit issues exactly ONE TransformContent through CommandGateway; cancel restores snapshot exactly; unit tests with a fake gateway counting commands.
- [x] SnapProvider interface + no-op default exported; gesture update calls it and renders returned guides into the overlay plane (no-op renders none).
- [x] CommandGateway: revision threading from init/onChanged, Conflict surfaced as a typed result (UI toast stub), used by all canvas command paths.
- [x] CanvasHost wiring: pointer/wheel/keyboard → controller; selection box + selected-item outline in overlay plane; camera persist debounced (~500ms rest) + flush on unmount.
- [x] e2e: pan+zoom then reload app → camera restored (SetCanvasCamera in command log exactly once per rest); marquee-select two placements → outlines reported via `__ewDebug`.
- [x] Full gates green: `pnpm -r build && pnpm -r --filter '!@ew/desktop' test && pnpm lint` and desktop e2e.

### Acceptance Criteria

**Scenario:** Camera and selection behave as §13.1's controller.
**GIVEN** a canvas with three placements at known positions.
**WHEN** the user wheel-zooms at a placement and pans.
**THEN** the world point under the cursor stays fixed during zoom and the camera persists after rest as one SetCanvasCamera command.
**WHEN** the user drags a marquee over two placements.
**THEN** both are selected and shown with overlay outlines; clicking empty space clears the selection.
**WHEN** a gesture is begun, updated, and cancelled with Escape.
**THEN** display objects return exactly to their prior transforms and no durable command was issued.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->
- The DB-side camera-persistence e2e originally used
  `waitForFunction` with an async predicate; a Promise is truthy, so
  the wait passed vacuously and the reload raced ahead of the 500 ms
  debounce (camera read back 0/0/1). Replaced with `expect.poll` from
  the test side. Lesson for later e2e: never hand waitForFunction an
  async closure.
- Same run also caught the recurring stale-dist trap: the utility
  bundle is built from persistence dist, so `pnpm -r build` must
  precede desktop e2e after handler changes (SetCanvasCamera
  "errored" until rebuilt).
- Conflict surfacing is a typed result plus an onConflict listener
  seam on the gateway; a visible toast is deferred until any UI can
  actually produce concurrent writers (single-writer local app).
- "Exactly one SetCanvasCamera per rest" is asserted at unit level
  (debounce) and by DB value in e2e; there is no command-log query to
  count rows from the renderer — acceptable, the log itself is
  asserted in persistence tests.
- destroy() now flushes a pending camera debounce so the last rest
  survives app quit (caught in self-review against the checklist).
