---
node_id: AI-IMP-027
tags:
  - IMP-LIST
  - Implementation
  - canvas
  - decorations
  - feel
kanban_status: planned
depends_on: [AI-IMP-021]
parent_epic: [[AI-EPIC-009-canvas-feel-pass]]
confidence_score: 0.85
date_created: 2026-07-04
date_completed:
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

- [ ] Implement pure arrowPolygon(data) returning the 7-point block
      arrow with head-length clamp for short segments; unit tests:
      symmetry about the axis, tip exactly at (x2,y2), tail edge at
      (x1,y1), clamp behavior, zero-length input yields empty.
- [ ] Replace arrow rendering in line.ts with single poly().fill();
      plain line rendering unchanged; invalid data still renders
      nothing.
- [ ] Verify/adjust arrow AABB in hit-test.ts against the new
      silhouette; regression test if changed.
- [ ] Review shape, path, text, connector renderers at 3 stroke
      widths × 3 zooms; fix what's wrong, record per-kind findings
      (including "no change") in Issues Encountered.
- [ ] Regression tests for every fix made in the review pass.
- [ ] Validation: `pnpm --filter @ew/canvas-engine test`,
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

<!-- Filled out post-work. -->
