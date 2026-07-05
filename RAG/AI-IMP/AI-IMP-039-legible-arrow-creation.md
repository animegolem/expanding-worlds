---
node_id: AI-IMP-039
tags:
  - IMP-LIST
  - Implementation
  - canvas
  - decorations
  - feel
kanban_status: completed
depends_on: [AI-IMP-038]
parent_epic: [[AI-EPIC-010-hands-on-hardening]]
confidence_score: 0.85
date_created: 2026-07-05
date_completed: 2026-07-05
---

# AI-IMP-039-legible-arrow-creation

## Summary of Issue #1

Owner finding: on a board of real reference images (thousands of
world units wide), a default pen arrow drawn at fit zoom is a
hairline with an invisible head — strokeWidth 2 world units at zoom
~0.1 is sub-pixel. The world-space invariant forbids zoom-relative
rendering, but §4.9 already holds the answer for text: default to a
size LEGIBLE AT THE CREATING VIEWPORT, fixed thereafter. The pen
arrow adopts the same rule (RFC rev 0.14): creation thickness =
max(stroke-width setting, ARROW_LEGIBLE_SCREEN_PX / creation zoom),
so an arrow drawn zoomed-out is born readable at the zoom it was
drawn, and remains an ordinary fixed world object.

### Out of Scope

Sub-pixel stroke rendering of EXISTING content at other zooms
(separate proposal); lines/connectors (annotation weight stays the
user setting — arrows differ because the head must read); shape
arrows (box-sized by the artist already).

### Design/Approach

`ARROW_LEGIBLE_SCREEN_PX = 4` beside TEXT_LEGIBLE_SCREEN_PX in
decoration-data (≈12px head on screen at creation). SegmentSession
gains an optional legible floor applied to its data's strokeWidth;
beginDrawSession computes it for the 'arrow' kind from opts.zoom.
An explicitly larger stroke-width setting still wins (max).

### Files to Touch

`packages/canvas-engine/src/decoration-data.ts`: constant.
`packages/canvas-engine/src/tools/draw-tools.ts` (+ tools.test.ts):
floor at creation.
`RAG/RFC-0001-...md`: §6.8 legibility-at-creation sentence, §20,
rev 0.14.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and
**think**. Have you validated all aspects are **implemented** and
**tested**?
</CRITICAL_RULE>

- [x] Constant + SegmentSession floor for arrows only; unit tests:
      arrow at zoom 0.1 births thickness 40; at zoom 1 births 4; a
      larger user setting wins; lines/connectors untouched.
- [x] RFC rev 0.14 sentence + decision bullet; pandoc check.
- [x] Full gates: build, unit suites, desktop e2e, lint.

### Acceptance Criteria

**Scenario:** Artist annotates a zoomed-out reference board.
**GIVEN** the pen arrow tool at zoom 0.1
**WHEN** an arrow is drawn across two images
**THEN** it is born ~4 screen px thick (40 world units) with a
readable head, and behaves as a fixed world object thereafter.
**GIVEN** a stroke-width setting of 80
**THEN** the setting wins over the floor.

### Issues Encountered

<!-- Filled out post-work. -->
Scope generalized mid-cut by the owner (recorded in the summary):
instead of an arrow-only floor, ALL strokes are born legible at the
creating viewport and the toolbar control became a weight multiplier
(ToolStyle.strokeWidth → strokeScale; sessions receive a resolved
world width from legibleStrokeWidth). Stored decoration data is
untouched — absolute world units, so zoom-1 × weight-1 behavior is
byte-identical to before and every existing e2e passed unchanged
except type-level fixes. The checklist below reads as originally cut
for the arrow; the implemented rule supersedes it per the summary.
