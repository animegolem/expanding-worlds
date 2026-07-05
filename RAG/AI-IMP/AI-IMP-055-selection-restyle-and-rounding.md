---
node_id: AI-IMP-055
tags:
  - IMP-LIST
  - Implementation
  - decorations
  - feel
kanban_status: completed
depends_on: [AI-IMP-054]
parent_epic: [[AI-EPIC-012-pre-alpha-hardening]]
confidence_score: 0.8
date_created: 2026-07-05
date_completed: 2026-07-05
---

# AI-IMP-055-selection-restyle-and-rounding

## Summary of Issue #1

Owner finding: a placed shape's stroke and fill cannot be changed —
the toolbar's color/weight inputs set the TOOL style for future
draws only; text got selection-aware editing (AI-IMP-034) but
shapes, lines, paths, and connectors never did. Also approved:
rects gain a corner-rounding setting (percentile scale). Done when
selecting drawn decorations exposes stroke/fill/weight/rounding
controls whose edits commit one UpdateDecoration per change and
render immediately.

### Out of Scope

Restyling text via this path (has its own controls). Per-tool
default rounding. Rounding on ellipse/triangle/arrow variants
(rect-only; the scale generalizes later if wanted). Changing arrow
head geometry.

### Design/Approach

DecorationToolbar grows a selection-style row (mirrors the
AI-IMP-034 type row): visible when the selection contains at least
one stroke-bearing decoration (shape/line/path/connector/arrow).
Controls: stroke color, fill color + none toggle (shapes only),
stroke width in world units (displayed as-is; weight multiplier
semantics stay a creation-time concept), and corner radius 0–100%
for rects. Edits compose from FRESH queried data per decoration
(the AI-IMP-049 lesson — never from the component snapshot) and
apply to every eligible selected decoration, one UpdateDecoration
each. Schema: `ShapeData.cornerRadius?: number` (0–1), validator
range-checked; renderer draws roundRect with radius =
cornerRadius × min(w,h)/2, honoring rotation via the existing
transform path. RFC §4.9 gains the field (rev 0.16 bundle).

### Files to Touch

`packages/canvas-engine/src/decoration-data.ts`: cornerRadius +
validator + test.
`packages/canvas-engine/src/renderers/decorations/shape.ts`:
roundRect path for rects.
`apps/desktop/src/renderer/DecorationToolbar.svelte`: selection
style row.
`apps/desktop/e2e/decorations.spec.ts` (or notes-adjacent spec):
restyle + rounding round trip.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and
**think**. Have you validated all aspects are **implemented** and
**tested**?
</CRITICAL_RULE>

- [x] cornerRadius in ShapeData: validator accepts 0–1, rejects out
      of range; unit tests.
- [x] Rect renderer draws rounded corners; radius scales with the
      smaller box dimension; zero/absent = sharp (legacy rows
      unaffected).
- [x] Toolbar selection-style row: stroke, fill (+none), width,
      rounding; each edit = one UpdateDecoration composed from
      fresh data; multi-select applies to all eligible.
- [x] e2e: draw shape → select → change stroke, fill, rounding →
      data asserts each field; a line's stroke edit too.
- [x] RFC §4.9 field noted (rev 0.16 bundle); gates green.

### Acceptance Criteria

**GIVEN** a drawn rect selected with the select tool
**WHEN** the user changes stroke color, sets a fill, and sets
rounding to 50%
**THEN** three UpdateDecoration commands commit, the canvas
reflects each immediately, and reload preserves them.

**GIVEN** a multi-selection of a rect and a line
**WHEN** stroke color changes
**THEN** both decorations update.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->
As scoped. cornerRadius renders via roundRect with radius =
fraction × min(w,h)/2 (1.0 turns a square into a circle); rounded
rects join 'round' instead of 'miter' since their corners are no
longer 90°. Multi-select edits compose each decoration from freshly
queried data and skip fields that don't apply (fill and rounding are
shape/rect-only). e2e gotcha worth remembering: Playwright's click
`modifiers` option does NOT reach synthesized POINTER events in
Electron (only DOM mouse events) — canvas shift-clicks must use
keyboard.down/up, which the spec now documents inline. The RFC §4.9
line landed with the epic-activation commit (rev 0.16).
