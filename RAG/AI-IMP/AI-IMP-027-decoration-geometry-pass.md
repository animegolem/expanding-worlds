---
node_id: AI-IMP-027
tags:
  - IMP-LIST
  - Implementation
  - canvas
  - decorations
  - feel
kanban_status: completed
depends_on: [AI-IMP-021]
parent_epic: [[AI-EPIC-009-canvas-feel-pass]]
confidence_score: 0.85
date_created: 2026-07-04
date_completed: 2026-07-05
---

# AI-IMP-027-decoration-geometry-pass

## Summary of Issue #1

The arrow decoration renders with a visible defect: the shaft is
stroked to the tip with `cap: 'round'`, so the cap bulges half the
stroke width past and beside the arrowhead triangle — at thick
strokes the tip is a lump, not a point (owner screenshot on the
epic). The owner wants a bulkier, block-style arrow overall. The
other decoration kinds have never had a deliberate geometry review
across stroke widths and zoom levels. Done means: arrows render as a
single filled block polygon (no stroke/fill seam possible), every
decoration kind has been reviewed and corrected at thin/default/thick
widths and far/default/near zooms, and geometry is unit-tested.

### Out of Scope

New arrow-style variants or tool UI (schema stays as-is; only the
default rendering changes); connector anchor resolution logic;
decoration data schemas (`decoration-data.ts` changes only if a
rendering constant genuinely belongs there); hit-testing (bounds in
`hit-test.ts` only if the new arrow silhouette makes current AABBs
wrong); anything outside `packages/canvas-engine/`.

### Design/Approach

Arrow: compute a seven-point filled polygon from (x1,y1)→(x2,y2) plus
strokeWidth — rectangular shaft of width `strokeWidth` (treated as
shaft thickness), triangular head of width ~3× shaft and length
~2.2× shaft thickness clamped to at most 60% of segment length so
short arrows stay arrow-shaped; one `poly().fill()` call, zero
strokes. Keep `data.stroke` as the fill color and `strokeWidth` as
the thickness driver so existing rows render without migration.
Plain lines keep stroked rendering (round caps are correct there).
Review pass for line, shape (rect/ellipse), path (freehand), text,
connector: stroke alignment/caps/joins, degenerate inputs
(zero-length, tiny), and how strokes read at world-space extremes —
document per-kind findings in Issues Encountered even when "no
change". Export a pure `arrowPolygon(data): number[]` helper so
geometry is unit-testable without Pixi, and reuse `drawSegment`'s
callers unchanged. Visual approval: render a small matrix
(3 widths × 3 zooms × kinds) via existing vitest browser-less checks
where possible; final look sign-off is the owner's, at merge.

### Files to Touch

`packages/canvas-engine/src/renderers/decorations/line.ts`: block
arrow polygon; keep line rendering stroked.
`packages/canvas-engine/src/renderers/decorations/{shape,path,text,connector}.ts`:
corrections from the review pass only.
`packages/canvas-engine/src/renderers/decorations/decorations.test.ts`:
arrowPolygon geometry tests; per-kind regression tests for any fix.
`packages/canvas-engine/src/hit-test.ts` + `hit-test.test.ts`: only
if arrow bounds change materially.
`packages/canvas-engine/src/index.ts`: export arrowPolygon if useful.
Forbidden: everything else — especially `apps/desktop/**`,
`snap-provider.ts`, `controller.ts`, `renderers/placement.ts`,
`renderers/background.ts`.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and
**think**. Have you validated all aspects are **implemented** and
**tested**?
</CRITICAL_RULE>

- [x] Implement pure arrowPolygon(data) returning the 7-point block
      arrow with head-length clamp for short segments; unit tests:
      symmetry about the axis, tip exactly at (x2,y2), tail edge at
      (x1,y1), clamp behavior, zero-length input yields empty.
- [x] Replace arrow rendering in line.ts with single poly().fill();
      plain line rendering unchanged; invalid data still renders
      nothing.
- [x] Verify/adjust arrow AABB in hit-test.ts against the new
      silhouette; regression test if changed. (Verified, unchanged:
      the new silhouette is contained in the old one's envelope in
      every direction — see Issues Encountered.)
- [x] Review shape, path, text, connector renderers at 3 stroke
      widths × 3 zooms; fix what's wrong, record per-kind findings
      (including "no change") in Issues Encountered.
- [x] Regression tests for every fix made in the review pass.
- [x] Validation: `pnpm --filter @ew/canvas-engine test`,
      `pnpm -r build`, `pnpm lint` all green; no files outside
      packages/canvas-engine touched (`git status` proof in report).

### Acceptance Criteria

**Scenario:** Artist draws a thick arrow annotation.
**GIVEN** an arrow decoration with strokeWidth 12
**WHEN** it renders at any zoom
**THEN** the silhouette is one filled block polygon with a clean
point at (x2,y2) — no cap lump, no seam between shaft and head.
**WHEN** the arrow is very short relative to its thickness
**THEN** the head clamps so the result still reads as an arrow.
**GIVEN** existing decoration rows from EPIC-004 projects
**WHEN** they render after this change
**THEN** no data migration is required and no kind regresses (unit
suites green).

### Issues Encountered

**Arrow (fixed).** Replaced stroke+triangle with one filled 7-point
polygon (`arrowPolygon` in line.ts, exported from index.ts).
Constants: head width 3× shaft thickness, head length 2.2× shaft
thickness, clamped to ≤60% of segment length. `drawSegment`'s
signature is unchanged so the connector caller is untouched. Bonus
fix the polygon gives for free: a zero-length arrow now renders
nothing — the old code drew a stray world-size-8 head pointing left
(atan2(0,0)=0) for degenerate segments. Note for the owner's visual
sign-off: the old head had a world-space floor of 8 units
(`max(8, 4×strokeWidth)`), the new formula has no floor per the
ticket design, so at strokeWidth 1–2 the head is a little smaller
than before (6×4.4 world units at width 2). If thin arrows need more
presence, raising ARROW_HEAD_WIDTH/LENGTH_FACTOR or adding a floor is
a one-line change.

**Hit-test (verified, no change).** decorationAABB for line/arrow is
the segment endpoints' AABB + 4 world-unit slop; it has never
included stroke thickness or the head. The new silhouette is strictly
inside the old rendering's envelope: perpendicular half-extent is now
1.5×strokeWidth vs the old head's ~1.74×strokeWidth
(max(8,4sw)·sin(π/7)), and along the axis the flat tail ends exactly
at (x1,y1) where the old round cap overhung by strokeWidth/2. So the
change cannot make existing AABBs worse; no hit-test edit. The
pre-existing looseness (thick strokes clickable only near the
spine) is common to line/path/connector and out of scope here.

**Shape (one fix).** Triangle apexes stroke with the Pixi default
miter join, miterLimit 10 — a sharp apex (half-angle just above
5.7°) miter-spikes up to 5×strokeWidth past the vertex at thick
strokes, far outside the shape's hit AABB. Fixed: triangles stroke
with `join: 'round'`; rects keep miter (corners are always 90°,
miter factor √2, correctly crisp). Ellipses have no joins.
Regression test asserts the join style per shape via
`Graphics.context.instructions` (local bounds pad uniformly by
width/2 and do not model miter, so bounds cannot detect this).
Zero-size shapes (validator allows width/height 0) render without
crashing at all three variants — test added, no code change needed.

**Path (no change).** Round cap + round join is correct for freehand
at every width/zoom; joins cannot spike. Degenerate two-identical-
point path (minimum the validator admits) renders without crashing —
test added.

**Text (no change).** No stroke geometry; fontSize > 0 enforced by
the validator; world-space sizing per §4.9 is zoom-agnostic by
construction. Texture resolution at extreme zoom is AI-IMP-023
territory, not geometry.

**Connector (no change).** Renders through the same
`drawSegment(..., false)` path as plain lines (round caps, correct);
zero-length degenerate covered by the line test. Anchor resolution
untouched per Out of Scope.

**Zoom-level review note.** Decorations are world-space (§4.9), so
zoom is a uniform scale on the whole Graphics — geometry defects are
zoom-invariant; the width×zoom matrix reduces to reviewing geometry
per stroke width, which the tests pin numerically (bounds of the
sw=12 arrow hug the silhouette exactly; no cap overhang at any zoom).

**Process deviation.** Worktree branched from 48bb4c5 (pre-ticket);
fast-forwarded to main 88561ee to pick the ticket file up before
starting. No AI-LOG entry written: the agent fence forbids touching
RAG files other than this ticket — the lead's merge session owns the
log. INDEX.md untouched (also fenced): generate-index.sh does want to
add the grown decorations.test.ts to its LOC listing — the lead
should re-run it at merge.
