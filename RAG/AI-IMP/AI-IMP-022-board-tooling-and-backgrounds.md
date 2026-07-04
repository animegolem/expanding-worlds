---
node_id: AI-IMP-022
tags:
  - IMP-LIST
  - Implementation
  - canvas
  - snapping
  - backgrounds
kanban_status: in-progress
depends_on: [AI-IMP-019, AI-IMP-021]
parent_epic: [[AI-EPIC-004-canvas-board-loop]]
confidence_score: 0.7
date_created: 2026-07-04
date_completed:
---

# AI-IMP-022-board-tooling-and-backgrounds

## Summary of Issue #1

§6.9 board tooling and §6.7 backgrounds have no UI: no align/
distribute, no zoom-to-fit, no snapping or smart guides, and no way to
set an image or color background. Implement the real SnapProvider
behind AI-IMP-018's interface, align/distribute as one durable command
each, zoom-to-fit/selection over the 018 camera primitive, and the
full §6.7 background operation set with its explicit edit mode. Done
means: §17 items 2 and 4 pass end to end with command-log assertions.

### Out of Scope

Gesture mechanics (AI-IMP-019 — snapping only supplies deltas/guides
through the SnapProvider seam). Tiled/pyramidal oversized backgrounds
and derivatives (AI-IMP-023; this ticket renders the original asset
untiled). Auto-arrange/pack and grid (deferred in RFC §6.9).
Decoration tools (AI-IMP-021). Do NOT touch: gesture modules,
scene-sync core, decoration renderers; persistence changes limited to
nothing — all needed commands exist (TransformContent,
SetCanvasBackground, SetCanvasBackgroundColor).

### Design/Approach

SnapProvider (§6.9): build a per-gesture spatial index of non-moving
content bounds (edges + centers, plus canvas origin); query returns
the smallest within-threshold delta per axis (threshold in screen
pixels, converted by current zoom) and the matching guide lines;
guides render in the overlay plane and clear on commit/cancel; a held
modifier (Alt) bypasses snapping entirely. Ephemeral by construction —
the provider never issues commands. Align (left/hcenter/right/top/
vmiddle/bottom) and distribute (even horizontal/vertical gaps) compute
target positions over the selection's world bounds and commit exactly
one TransformContent each (§6.9), operating on placements and
decorations alike. Zoom to fit (all content bounds) and zoom to
selection call controller.fitToBounds — camera-only, no durable
command, wired to toolbar + shortcuts. Backgrounds (§6.7): Set Image
as Canvas Background from (a) an image placement's context menu (Set
as Background uses its existing asset) and (b) file pick → importAsset
— both commit SetCanvasBackground {assetId, settings}; Replace reuses
the same command; Edit Background Position enters an explicit mode
(§6.7: background is otherwise never selectable) where drag/resize
adjust transform ephemerally and exit commits one SetCanvasBackground
with new settings; Reset Transform and Remove are single commands
(settings = identity / assetId = null); background color set/clear via
SetCanvasBackgroundColor rendered beneath the image (§4.4).

### Files to Touch

`packages/canvas-engine/src/snap-provider.ts` (+ test): real SnapProvider implementation.
`packages/canvas-engine/src/arrange.ts` (+ test): align/distribute target computation → TransformContent payloads.
`packages/canvas-engine/src/background-mode.ts` (+ test): explicit background-edit interaction mode.
`apps/desktop/src/renderer/canvas/host.ts`: toolbar wiring (align/distribute/zoom buttons, snap modifier), background mode entry/exit, guide rendering hookup.
`apps/desktop/src/renderer/BoardToolbar.svelte`: arrange + zoom + background controls, color picker.
`apps/desktop/e2e/board-tooling.spec.ts`: §17 items 2 and 4 e2e.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [x] SnapProvider: index of static content edges/centers built at gesture begin; per-axis nearest within zoom-adjusted threshold; returns snappedDelta + guide segments; Alt disables; unit tests for edge/center hits, threshold scaling with zoom, moving-set exclusion.
- [x] Guide rendering: overlay-plane lines from provider output during drag, cleared on commit/cancel (visual state never outlives the gesture).
- [x] arrange.ts: six align ops + two distribute ops over mixed placement/decoration selections (decoration geometry via its data bounds); each returns one TransformContent payload with prior values for inverse; unit tests incl. two-item distribute no-op and rotated-placement bounds.
- [x] Toolbar + shortcuts for align/distribute; disabled below the operable selection sizes (align ≥2, distribute ≥3).
- [x] Zoom to fit / zoom to selection via controller.fitToBounds; verify no command_log growth (camera persist is the debounced SetCanvasCamera only).
- [x] Set Image as Canvas Background from placement context menu (existing asset) and from file pick (importAsset first); Replace Background; both = one SetCanvasBackground each.
- [x] Background edit mode: explicit enter/exit, background not hittable outside the mode, drag/scale ephemerally then one SetCanvasBackground on exit; Escape reverts; Reset Background Transform and Remove Background commands wired.
- [x] Background color: picker sets, clear removes (SetCanvasBackgroundColor); renders beneath the image background when both exist (§4.4); e2e asserts layering.
- [x] e2e board-tooling.spec.ts: set/edit/reset/replace/remove an image background on the root canvas (§17 item 2, command log asserted per op); align + distribute a 3-item selection (exactly one TransformContent each); drag with snapping showing guides then commit (still one command); Alt-drag bypasses snap; zoom-to-fit and to-selection adjust camera without durable commands.
- [x] Full gates green: `pnpm -r build && pnpm -r --filter '!@ew/desktop' test && pnpm lint` and desktop e2e.

### Acceptance Criteria

**Scenario:** §6.9 arrangement stays one-command-per-act and §6.7 backgrounds round-trip.
**GIVEN** three placements and one text decoration selected.
**WHEN** the user clicks Align Left, then Distribute Horizontally.
**THEN** the command log gains exactly two TransformContent commands and each inverse restores prior positions.
**WHEN** the user drags a placement near another's edge.
**THEN** a smart guide appears, the drop snaps, exactly one durable command commits, and holding Alt repeats the drag without snapping.
**WHEN** the user sets an image background, edits its position in background mode, resets, and removes it.
**THEN** each operation is one durable command, the background is never selectable outside the edit mode, and the background color remains beneath the image while both exist.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->

- Deviations from "Files to Touch": the planned
  `packages/canvas-engine/src/background-mode.ts` landed as
  `apps/desktop/src/renderer/canvas/board-tooling.ts` per the lead
  brief — the mode is DOM capture-phase pointer interception plus
  Pixi sprite mutation, which has no clean engine-side seam. Toolbar
  wiring went into `CanvasHost.svelte` (mount) rather than deeper
  host.ts changes; host.ts only gained the `__ewDebug.guides()` hook
  (3 lines + 1 declaration line).
- Keyboard shortcuts for align/distribute were left out: the lead
  brief marked them optional and the toolbar buttons carry the gating
  (align ≥2, distribute ≥3, asserted disabled in e2e).
- "Set as Background from placement context menu" is a toolbar button
  enabled when exactly one image-appearance placement is selected
  (per the lead brief), not a node-menu entry — node-menu.ts was
  fenced off.
- Set-from-file in e2e drives the real hidden `<input type=file>` via
  Playwright setInputFiles and asserts revision +2 (CommitAssetImport
  + SetCanvasBackground): the import pipeline commits a durable
  CommitAssetImport even for deduplicated bytes, so "one durable
  command" holds for the background operation itself, not the import.
- Edit-mode commit skips the command when settings are unchanged
  (identical enter/exit is a no-op, zero commands), mirroring the
  gesture pipeline's no-change behavior.
- A scene re-render during the edit mode (e.g. a debounced camera
  persist landing mid-mode) re-applies durable settings to the
  sprite; refreshBackground() re-applies the pending ephemeral state
  after each project-changed to self-heal. Window is narrow and
  untested.
- Layering e2e asserts `scene.background.color` and `assetId` coexist
  through replace/remove; the beneath-image rendering is structural
  (color is the renderer clear color, behind every plane) and was not
  pixel-asserted.
- Worktree electron postinstall failed silently (dist missing);
  repaired from the cached zip + path.txt as documented in the brief.
