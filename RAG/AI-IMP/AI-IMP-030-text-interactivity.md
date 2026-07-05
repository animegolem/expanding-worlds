---
node_id: AI-IMP-030
tags:
  - IMP-LIST
  - Implementation
  - canvas
  - decorations
  - text
kanban_status: in-progress
depends_on: [AI-IMP-021, AI-IMP-029]
parent_epic: [[AI-EPIC-010-hands-on-hardening]]
confidence_score: 0.85
date_created: 2026-07-05
date_completed:
---

# AI-IMP-030-text-interactivity

## Summary of Issue #1

Text decorations are inert once placed: they cannot be clicked,
marquee-selected, moved, or double-click re-edited — even though the
re-edit path (text-entry's select-tool dblclick → UpdateDecoration)
is fully built. Root cause: TextData stores `{x, y, text, fontSize}`
with no height (and `width` means wrap-width, usually absent), so
`decorationAABB` yields a zero-area box and no hit-test can ever
succeed. Done means: text bounds are measured and stored at every
create/edit, hit-testing uses them (with a font-metrics estimate for
legacy rows), and select/move/delete/re-edit all work end to end.

### Out of Scope

Text rotation (no rotation field; group-rotation orbit-only is a
recorded limitation); wrap-width authoring UI; font family/style
options; charm bar and node double-click semantics (§19 Q3, parked).

### Design/Approach

`data.width` already means word-wrap width (the renderer feeds it to
wordWrapWidth), so measured size gets its own fields: optional
`measuredWidth`/`measuredHeight` on TextData, ignored by the renderer
and refreshed on every commit. The entry overlay is a DOM div with
the exact text, matching font (sans-serif, line-height 1.2) and
`fontSize × zoom` pixels — measure its rect at commit and divide by
zoom for world units; write into both CreateDecoration and
UpdateDecoration data. hit-test.ts gets a text-specific branch:
measured fields when present, else an estimate (lines × fontSize ×
1.2 high; longest line × fontSize × 0.55 wide) so legacy rows become
selectable too. Movement then works through the existing decoration
move path (mapDecorationPoints translates x/y).

### Files to Touch

`packages/canvas-engine/src/decoration-data.ts`: TextData optional
measuredWidth/measuredHeight; validator accepts.
`packages/canvas-engine/src/hit-test.ts`: text AABB branch
(measured-or-estimated).
`packages/canvas-engine/src/hit-test.test.ts`: measured + estimate
bounds tests.
`apps/desktop/src/renderer/canvas/text-entry.ts`: measure div at
finish(); include fields in create/update payloads.
`apps/desktop/e2e/decorations.spec.ts`: select/move/re-edit e2e.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and
**think**. Have you validated all aspects are **implemented** and
**tested**?
</CRITICAL_RULE>

- [ ] TextData gains measuredWidth?/measuredHeight?; isTextData
      accepts them (finite, positive when present); unit test.
- [ ] hit-test decorationAABB text branch: measured fields when
      present, font-metric estimate otherwise; unit tests for both.
- [ ] text-entry finish(): measure the div (rect ÷ zoom), write
      measuredWidth/measuredHeight into CreateDecoration and
      UpdateDecoration payloads.
- [ ] e2e: create text via tool → click selects it; drag moves it
      (data x/y change, one TransformContent); dblclick reopens the
      overlay seeded with the text; edit commits one
      UpdateDecoration with refreshed measured bounds.
- [ ] Full gates: `pnpm -r build`, unit suites, desktop e2e, lint.

### Acceptance Criteria

**Scenario:** Artist annotates a board with text.
**GIVEN** a text decoration placed with the text tool
**WHEN** the artist clicks it with the select tool
**THEN** it selects with a fitting outline.
**WHEN** the artist drags it
**THEN** it moves and commits one durable command.
**WHEN** the artist double-clicks it
**THEN** the entry overlay reopens seeded with the current text and
an edit commits one UpdateDecoration.
**GIVEN** a text row created before this change (no measured fields)
**WHEN** it is clicked
**THEN** the estimated bounds make it selectable.

### Issues Encountered

<!-- Filled out post-work. -->
