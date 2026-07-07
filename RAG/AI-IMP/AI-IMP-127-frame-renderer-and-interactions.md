---
node_id: AI-IMP-127
tags:
  - IMP-LIST
  - Implementation
  - frames
  - canvas
  - renderer
kanban_status: planned
depends_on: [AI-IMP-126]
parent_epic: [[AI-EPIC-017-frames]]
confidence_score: 0.65
date_created: 2026-07-06
date_completed:
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

- [ ] Frame tool: draw → one undo entry creating node + frame
      placement; Shift constrains square (rev 0.12 convention).
- [ ] Region renders on theme tokens (guard test passes),
      subordinate to content, selectable and movable.
- [ ] Drag-end membership: drop inside → captured by INNERMOST
      frame; drop outside → released; mid-drag never mutates;
      pure containment helper unit-tested including nested ties.
- [ ] Capture/release commits in the same batch as the move (one
      Mod+Z returns both position and membership).
- [ ] Hover dim: item drag over a frame focuses it and dims the
      rest; leaves cleanly on drop/cancel.
- [ ] Frame drag moves members as one gesture, one undo entry;
      frame RESIZE changes membership never (e2e asserts).
- [ ] E2E (frames.spec.ts): draw → drop items in → tree reflects →
      move frame carries → resize releases nothing → drag out
      releases → undo walks back cleanly.
- [ ] Gates: `pnpm -r build`, `pnpm -r test`, `pnpm lint`, desktop
      e2e hidden.
- [ ] HUMAN-TESTING entry appended at merge by the lead (dim feel,
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
