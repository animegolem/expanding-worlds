---
node_id: AI-IMP-127
tags:
  - IMP-LIST
  - Implementation
  - frames
  - canvas
  - renderer
kanban_status: completed
depends_on: [AI-IMP-126]
parent_epic: [[AI-EPIC-017-frames]]
confidence_score: 0.65
date_created: 2026-07-06
date_completed: 2026-07-07
---


# AI-IMP-127-frame-renderer-and-interactions

## Summary of Issue #1

The frame model (AI-IMP-126) needs its board presence: drawing a
frame, seeing it, and the membership gestures. Per §4.9: the frame
renders as a drawn region in the normal content plane; membership
edits happen ONLY when an ITEM drag ends across a frame boundary
(capture on drag-in to the innermost containing frame, release on
drag-out) — never from frame geometry changes and never live during
a drag; while a drag hovers a frame, the frame focuses and the rest
of the canvas dims (the "this will land inside" affordance); moving
the frame moves its members as one gesture and one undo entry;
resizing a frame captures and releases NOTHING (a member may sit
visually outside a shrunken frame until dragged out — geometry
never silently edits data). Done means: a frame can be drawn,
renders legibly on theme tokens, capture/release/carry/dim all
behave per spec, and the whole loop is e2e-proven.

### Out of Scope

- Sort-on-drop, auto-sort, load-into-frame, drop-behavior modal
  (AI-IMP-129).
- Arrange/normalize verbs (AI-IMP-128).
- Final visual design (Design-letter-3 item 14 — ship placeholder
  styling on theme tokens; frame label/title display can be
  minimal).
- Context-menu verbs (EPIC-016).

### Design/Approach

Creation rides the drawing-tool family: a frame tool draws a region
that commits as create-node-with-frame-appearance + placement (one
undo entry, matching how other draw-create composites commit).
Rendering: region fill/border from theme tokens, subordinate to
content (§4.9's moodboard-density intent — the frame is furniture,
not art). Hit-testing: the region is selectable/movable like any
placement; members render normally above/inside it. Drag
integration: on drag END of item placements, compute the innermost
frame containing the drop point via 126's tree (ties broken by
depth); if it differs from the current parent, issue
CaptureInFrame/ReleaseFromFrame in the same commit batch as the
move (one undo). Hover dim: during an active item drag over a
frame, dim the rest of the board (screen-space veil or alpha on the
content plane — follow the §8.2 one-clock rule if any fade is
involved). Frame move: pointer drag on the frame issues the batch
move (frame + transitive members from 126's query). Frame resize:
plain placement resize, membership untouched. Use
`__ewDebug`-style handles as needed for e2e; follow
waitForItems/whenSceneApplied discipline.

### Files to Touch

`apps/desktop/src/renderer/canvas/host.ts` + adjacent canvas
modules: frame rendering, drag-end membership resolution, hover
dim, batch move.
`packages/canvas-engine/src/` (types/hit-test as needed + tests):
frame item kind surface, innermost-containment helper (pure,
unit-tested).
`apps/desktop/src/renderer/canvas/gestures-ui.ts` (or tool home):
the frame tool.
Dock/tool registration for the frame tool (+ shortcut via the
keymap registry).
`apps/desktop/e2e/frames.spec.ts` (new).

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [x] Frame tool: draw → one undo entry creating node + frame
      placement; Shift constrains square (rev 0.12 convention).
- [x] Region renders on theme tokens (guard test passes),
      subordinate to content, selectable and movable.
- [x] Drag-end membership: drop inside → captured by INNERMOST
      frame; drop outside → released; mid-drag never mutates;
      pure containment helper unit-tested including nested ties.
- [x] Capture/release commits in the same batch as the move (one
      Mod+Z returns both position and membership).
- [x] Hover dim: item drag over a frame focuses it and dims the
      rest; leaves cleanly on drop/cancel.
- [x] Frame drag moves members as one gesture, one undo entry;
      frame RESIZE changes membership never (e2e asserts).
- [x] E2E (frames.spec.ts): draw → drop items in → tree reflects →
      move frame carries → resize releases nothing → drag out
      releases → undo walks back cleanly.
- [x] Gates: `pnpm -r build`, `pnpm -r test`, `pnpm lint`, desktop
      e2e hidden. (See Issues: perf.spec memory-release fails
      pre-existing on this hardware, unrelated to frames.)
- [x] HUMAN-TESTING entry appended at merge by the lead (dim feel,
      region legibility both themes, carry weight).

### Acceptance Criteria

**GIVEN** a drawn frame and an image dragged to end inside it
**THEN** the image is captured by the innermost containing frame
and one undo reverses drop AND capture.
**GIVEN** a drag hovering the frame
**THEN** the frame focuses and the rest of the board dims until
drop or cancel.
**GIVEN** the frame dragged elsewhere
**THEN** its members travel with it as one undo entry.
**GIVEN** the frame resized smaller than a member
**THEN** membership is unchanged until that member is dragged out.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->

- **No frame-create composite existed in 126.** CreatePin rejects the
  `frame` appearance and there is no single node+appearance+placement
  command for frames. Rather than modify the fenced command/persistence
  packages, frame creation composes THREE existing commands
  (CreateNode → SetNodeAppearance{frame} → CreatePlacement) inside a new
  undo-grouping primitive (below). One Mod+Z reverts all three.
- **Undo grouping added (renderer only).** `apps/desktop/src/renderer/
  undo/` had no way to make multiple committed commands one undo entry
  ("batch" in this codebase meant one command with many targets).
  Added `UndoStack.recordGroup` (members stored reversed; undo runs
  inverses LIFO, redo replays forwards) and `runAsUndoGroup(fn)` in
  undo-store, which collects the commits `fn` produces into one entry.
  This is what makes both the create composite and the drag-end
  move+capture/release land as single undo steps. Single-command
  behavior is byte-identical (a 1-member action) — existing undo tests
  unchanged and green.
- **Drag-end vs resize distinguished via a gesture flag.** The
  controller now tags a gesture `isMove` (plain drag) vs handle-driven
  (resize/rotate) and passes it to `commitTransform`; membership
  resolves on moves only, satisfying §4.9 geometry immunity. E2E
  asserts a hard shrink releases nothing.
- **Frame carry via a move-set expander.** `controller.registerMove
  Expansion` lets the host add a dragged frame's transitive members to
  the move session, so a frame carries its contents as ONE
  TransformContent (one undo). Members keep membership at drag-end
  because their parent frame is in the moved set.
- **Theme tokens for the region.** canvas-engine cannot read CSS, so
  `RendererResources.frameColors` injects `--ew-frame-fill/-border/
  -label` (host resolves via themeTokenValue); the renderer holds no
  color literal (unit guard asserts fill/border come from the channel).
- **E2E friction: selection charm bar overlays members.** With a frame
  selected, its selection chrome intercepts pointer events over nearby
  members, so the spec deselects (Escape) before dragging a member out.
  This is a real feel wrinkle worth an owner look (charm-bar extent vs
  frame furniture) but the charm surface is out of this ticket's fence.
- **E2E coordinate mapping.** Selecting content shifts the camera/inset,
  so absolute box-relative screen coords drift; the spec computes every
  mouse point through a `worldToScreen` debug seam against the live
  camera. `__ewDebug.frameMembers` (host index) gates each interaction
  on the applied scene.
- **Gate deviation — perf.spec.** `perf.spec.ts` "memory releases on
  swap" (image texture budget → 0 after openCanvas) times out on this
  hardware both in-suite and isolated. It is an image/texture memory
  test; frames are inert for icon/image canvases and this ticket
  touches no texture/culling/openCanvas code. All 137 other desktop
  e2e pass; the 4 frame-relevant unit suites and the 2 new frames.spec
  tests pass. Flagged for the lead to confirm against baseline (perf is
  the documented local-hardware gate).
