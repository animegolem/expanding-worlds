---
node_id: AI-IMP-072
tags:
  - IMP-LIST
  - Implementation
  - canvas-engine
  - tags
kanban_status: completed
depends_on: []
parent_epic: [[AI-EPIC-013-global-views]]
confidence_score: 0.75
date_created: 2026-07-05
date_completed: 2026-07-06
---

# AI-IMP-072-lens

## Summary of Issue #1

No dim-to-hits mechanism exists anywhere: §7.5's highlighted-
placement visualization never shipped (only the connector tool's
transient hover highlight), and §4.8's tag lens specifies the same
mechanism aimed at tag results — the RFC says the two surfaces
share one implementation. This ticket builds that implementation in
the canvas engine: a lens view state that dims every placement not
in the match set to a fraction of full strength (without hiding),
keeps matches at full color with an accent ring, survives pan, zoom,
and scene reapplication, and drops on Escape or explicit clear. The
host exposes `setLens(placementIds)` / `clearLens()`; the tag
panel's header toggle consumes it for the active tag's placements
on the current canvas. Covers EPIC-013 FR-5. Done when: engine
units cover the state machine and scene-apply survival, the tag
panel toggle dims a mixed board correctly, and Escape drops the
lens without disturbing selection.

### Out of Scope

The §7.5 note-uses trigger surface (a later ticket wires the uses
list/chooser to the same API — this ticket only leaves the seam).
Fit-camera-to-matches (SHOULD, deferred until a consumer wants it).
Tag panel internals (071) beyond wiring its toggle.

### Design/Approach

Lens is renderer view state, not selection and not scene data: a
`lensSet: ReadonlySet<string> | null` held by the controller
beside selection, applied at draw time — non-members render with a
dim factor (engine constant, e.g. 0.25 alpha multiply or a scrim
pass over non-matches; pick whichever the renderer does cheaply and
uniformly for images, pins, and decorations), members render normal
plus an accent ring in the adornment pass (same stroke family as
selection but visually distinct — reuse the §7.5 language: outline/
halo). Scene reapply intersects the set with surviving placement
ids rather than clearing (pan/zoom/edit survival); an empty
intersection clears the lens. Escape clears it at the same priority
as selection-clear (before tool fallthrough); clicking neutral
canvas space does NOT auto-drop in Phase 1 (§4.8: survives until
Escape or the toggle). Host surface: `setLens/clearLens/onLensChanged`
on CanvasHostHandle, mirrored on `window.__ewGestureDebug` for e2e
introspection. The tag panel toggle computes the active canvas's
matching placement ids from its extended getTagView rows.

### Files to Touch

`packages/canvas-engine/src/` (controller + renderers): lens state,
dim pass, accent ring; feel-style constant for the dim factor.
`packages/canvas-engine/src/*.test.ts`: state units — set,
intersect-on-apply, clear-on-empty, Escape.
`apps/desktop/src/renderer/canvas/host.ts`: expose setLens/
clearLens; debug hook.
`apps/desktop/src/renderer/tags/TagPanel.svelte`: header toggle
wires the lens for the active tag on the current canvas.
`apps/desktop/e2e/tags.spec.ts`: lens toggle coverage.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and
**think**. Have you validated all aspects are **implemented** and
**tested**?
</CRITICAL_RULE>

- [x] Engine lens state: setLens/clearLens/onLensChanged; draw pass
      dims non-members uniformly (images, pins, decorations) and
      rings members; dim factor is a named constant.
      (`Lens` + `lensAlpha` + `LENS_DIM_ALPHA` in
      `packages/canvas-engine/src/lens.ts`; dim = root-container
      alpha multiply applied in host draw pass; accent ring in the
      host adornment pass beside the selection box.)
- [x] Scene reapply intersects the lens set with surviving ids;
      empty intersection clears; units cover placement deletion and
      unrelated edits under an active lens.
- [x] Pan and zoom leave the lens untouched (unit AND e2e).
- [x] Escape clears the lens without clearing selection when both
      are active — lens first, selection on the next press.
      (`CanvasController.escape()`; in-flight gesture/marquee cancel
      still takes priority over both.)
- [x] Host handle + debug hook expose lens state for tests.
      (Deviation: exposed on `window.__ewDebug` — where every other
      host-level probe lives — not `__ewGestureDebug`, which is
      gestures-ui's zone/label surface. `lens`, `setLens`,
      `clearLens`, `lensAlpha`, `lensRings`.)
- [ ] TagPanel toggle: on = setLens(matching placements on current
      canvas), off = clearLens; toggle state tracks onLensChanged
      so Escape unsets the toggle.
      (UNCHECKED by lead decision: AI-IMP-071 builds the tag panel
      in parallel and wires this via the handle's
      setLens/clearLens/onLensChanged seam.)
- [ ] e2e: mixed board, toggle on → debug hook reports the right
      set; pan; Escape drops it and the toggle resets.
      (Toggle half UNCHECKED — belongs to 071. The engine-observable
      half ships here as `apps/desktop/e2e/lens.spec.ts`: mixed
      board, set via debug hook, dim/ring assertions, pan survival,
      reapply intersection, Escape ordering.)
- [x] `pnpm -r build`, engine units, full gates green.

### Acceptance Criteria

**Scenario:** Isolating a tag's material on a busy board.
**GIVEN** a canvas with three placements, two carrying tag "ruins",
and the tag panel open on "ruins".
**WHEN** the user switches the header lens toggle on.
**THEN** the untagged placement dims, both carriers keep full color
with an accent ring, and panning/zooming changes nothing about the
lens.
**WHEN** the user presses Escape.
**THEN** the lens drops, the toggle shows off, and any prior
selection is still intact.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->

- **Scope adjustment (lead decision):** AI-IMP-071 (tag panel) is
  being built in parallel, so this ticket ships the engine state,
  host API, and debug hook only. No `renderer/tags/` files were
  created or touched; the two TagPanel checklist items stay
  unchecked for 071 to wire through
  `CanvasHostHandle.setLens/clearLens/onLensChanged`. E2E coverage
  went to a new `apps/desktop/e2e/lens.spec.ts` (not tags.spec.ts)
  and drives the lens through `window.__ewDebug`.
- **Escape now clears selection when nothing else is left to peel.**
  The ticket's ordering ("lens first, selection on the next press")
  implies Escape clears selection — behavior that did not exist
  before (controller.escape only cancelled gestures/marquees).
  Implemented as one-layer-per-press in `CanvasController.escape()`:
  in-flight gesture/marquee → lens → selection; non-idle states
  return early so Escape mid-pan or mid-gesture never touches view
  state. Every existing unit and e2e still passes, but this is a
  real behavior change worth a reviewer's eye: any window-level
  Escape (e.g. closing a DOM menu) that reaches the host keydown
  handler now also clears board selection.
- **Dim mechanism:** root-container alpha multiply
  (`object.alpha = lensAlpha(...)`). It is the one mechanism uniform
  across images, pins, and every decoration kind, and no item
  renderer writes root alpha, so it survives renderer updates; the
  host re-stamps it after every scene apply (created objects default
  to alpha 1). A scrim pass was rejected — it would dim the rings
  and cost a full-screen quad.
- **Renderer-architecture friction (candid):** the "draw pass" for
  adornments lives in host.ts, not the engine — selection outlines,
  marquee, and now lens rings are host Graphics fed by engine state.
  The engine can unit-test the state machine and the `lensAlpha`
  mapping but not the actual pixels; the e2e asserts object-level
  alpha and the host's ringed-id list instead. Fine at this scale,
  but a third adornment consumer would justify extracting an engine
  adornment pass.
- **Worktree friction:** the agent worktree branch started two
  commits behind main (ticket cut + AI-IMP-068 did not exist here);
  fast-forwarded before starting. `pnpm install` state was broken
  and Electron's binary was missing `dist/Electron.app`/`path.txt`;
  `install.js` exited 0 without repairing it, so the dist was copied
  from the main repo's pnpm store (same electron@39.8.10).
- **Validation results:** `pnpm -r build` green (desktop tsc
  included); `pnpm lint` green; canvas-engine vitest 253 passed
  (24 files, includes the new `lens.test.ts`); desktop vitest 8
  passed; full Playwright suite exit 0 — 52 passed, 2 flaky
  (`notes.spec.ts` rename-flush and attach-share: both failed once
  at `electron.launch`/`firstWindow` timeout in this worktree and
  passed on retry — launch infrastructure, not behavior; the two
  new `lens.spec.ts` tests passed first try).
- `RAG/scripts/generate-index.sh` was NOT run: frontmatter is
  unchanged (kanban transition is the lead's merge-time call) and
  regenerating INDEX.md from a worktree would collide with parallel
  agents.
