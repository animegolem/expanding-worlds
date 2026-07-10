---
node_id: AI-IMP-262
tags:
  - IMP-LIST
  - Implementation
  - canvas-engine
  - rendering
  - field-report
kanban_status: planned
depends_on: []
parent_epic:
confidence_score: 0.5
date_created: 2026-07-10
date_completed:
---


# AI-IMP-262-board-pin-label-legibility

## Summary of Issue #1

alph, v0.20.0, 2026-07-10 ("major bug" per owner): board pins on
Home render as large ring outlines whose NAME LABELS are "all
blurry and tiny" — illegible enough that he initially read his own
boards as "weird artifacts" and deleted one. He explicitly wants
Home-as-worlds-view to work ("I'd like this as a way to view the
different starting worlds"), so label legibility on board pins is
the load-bearing part. Screenshots show: large ring (the board
pin), two small charms inside it, and a label beneath at a tiny
size with soft/blurred glyphs. LEAD HYPOTHESES (unverified —
pre-implementation review supersedes): (a) the label texture is
rasterized for one zoom and scaled up at another (the AI-IMP-216
label family — check the label-resolution policy against the
pin-ring's own scale); (b) the New-board verb's default placement
size and the label's world-size don't agree — the ring is sized
generously while the label stays at note-card label size; (c) a
DPR/resolution miss on Windows display scaling (alph's box) that
mac testing wouldn't show. The review must reproduce at alph's
approximate zoom and record which. Done means: a board pin's name
is crisp and readable at the zooms Home is actually used at, on
both platforms.

### Out of Scope

- Whether Home should be a launcher/grid (DESIGN-QUEUE cluster —
  and note alph now endorses spatial Home).
- Ring VISUAL design (charms, proportions) — legibility only,
  unless the review proves the ring scale is itself the label bug.
- Untitled-board display names (parked naming debate).

### Design/Approach

Pre-implementation review first: reproduce with a board pin on
Home at several zooms; inspect the label render path in
canvas-engine (texture resolution vs camera zoom vs DPR); check
whether pin-ring labels share the placement-label pipeline of
AI-IMP-216 ("labels fade with their art") or a separate one; test
on a >1 DPR display profile. Fix at the cause the review convicts
— likely re-rasterizing label textures at an effective-resolution
bucket (zoom × DPR) the way crisp text on canvas is normally kept,
or aligning the board-pin label size with the ring's world scale.
Regression: a perf-conscious unit/e2e that asserts the label
texture resolution tracks the effective scale bucket.

### Files to Touch

(Census in review; expected:)
- `packages/canvas-engine/src/` label/adornment renderers.
- Possibly the New-board default placement sizing.
- `RAG/HUMAN-TESTING.md`: alph re-check at his real zoom + display.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [ ] Pre-implementation review: reproduction + convicted cause
      (texture resolution / size mismatch / DPR) recorded here.
- [ ] Fix at the convicted cause; labels crisp at Home-use zooms.
- [ ] Resolution-tracking regression test.
- [ ] Full desktop units + relevant e2e shard green.
- [ ] HUMAN-TESTING entry for alph (Windows display scaling).

### Acceptance Criteria

**GIVEN** boards placed on Home as ring pins
**WHEN** the user views Home at ordinary zooms (fit-view through
mid-zoom)
**THEN** each board's name renders crisp (no upscaled blur) and at
a readable size relative to its ring
**AND** the behavior holds on a Windows display-scaled monitor.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->
