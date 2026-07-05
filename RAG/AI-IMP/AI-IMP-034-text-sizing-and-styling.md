---
node_id: AI-IMP-034
tags:
  - IMP-LIST
  - Implementation
  - canvas
  - text
  - feel
kanban_status: in-progress
depends_on: [AI-IMP-030]
parent_epic: [[AI-EPIC-010-hands-on-hardening]]
confidence_score: 0.75
date_created: 2026-07-05
date_completed:
---

# AI-IMP-034-text-sizing-and-styling

## Summary of Issue #1

Canvas text has no affordance to change size or face after creation,
and the resize gesture on a text selection is silently broken: it
moves positions but never touches fontSize, so nothing visibly
scales and the measured bounds go stale. RFC rev 0.12 (§4.9)
decides both models the owner weighed, because they converge:
resize handles scale the text's world size uniformly (art-text
scaling, crisp because Pixi re-rasterizes per zoom), and a
whole-object type row (size, family from a curated set, bold,
italic, color) edits the selected text via one UpdateDecoration per
change. Per-span rich text is explicitly deferred — styled runs in
data if ever, never HTML; data.text stays the plain FTS string.

### Out of Scope

Per-span rich styling (deferred, §4.9); wrap-width authoring;
custom/bundled font files (curated CSS stacks only); text rotation;
tool-default styling changes beyond what exists.

### Design/Approach

Schema: TextData gains fontFamily?, bold?, italic? (validator
accepts; renderer maps to fontFamily/fontWeight/fontStyle; default
family stays sans-serif). Resize: in the resize driver's decoration
branch, text scales uniformly by the gesture's dominant axis factor
— fontSize, measuredWidth/measuredHeight, and wrap width multiply by
s; position anchors like any scaled decoration. Style edits: a
measureTextWorld helper (offscreen DOM node styled exactly like the
entry overlay) recomputes measured bounds when family/bold/italic
change; pure fontSize edits scale the existing measurements
linearly. UI: DecorationToolbar gains a selection-scoped text row
(visible when the selection is exactly one text decoration): size
input, family select (sans-serif/serif/monospace stacks), B/I
toggles, color input — each committing UpdateDecoration with
re-measured bounds. The entry overlay mirrors family/bold/italic so
editing stays WYSIWYG and measurement stays exact.

### Files to Touch

`packages/canvas-engine/src/decoration-data.ts` (+ test): style
fields.
`packages/canvas-engine/src/renderers/decorations/text.ts` (+ test):
style mapping.
`packages/canvas-engine/src/gestures/resize.ts` (+ test): uniform
text scaling.
`apps/desktop/src/renderer/canvas/text-entry.ts`: overlay style
parity; export measureTextWorld.
`apps/desktop/src/renderer/DecorationToolbar.svelte`: selection text
row.
`apps/desktop/e2e/decorations.spec.ts`: style edits + resize scale.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and
**think**. Have you validated all aspects are **implemented** and
**tested**?
</CRITICAL_RULE>

- [ ] TextData fontFamily?/bold?/italic? with validation; renderer
      maps them; unit tests both layers.
- [ ] Resize driver: text scales uniformly (fontSize, measured
      bounds, wrap width × dominant factor, anchored position); unit
      tests single and multi-selection.
- [ ] measureTextWorld helper shared by overlay commit and style
      edits; overlay mirrors family/bold/italic.
- [ ] DecorationToolbar text row on single-text selection: size,
      family, bold, italic, color → one UpdateDecoration each with
      fresh measured bounds; testids for e2e.
- [ ] e2e: select text → set size 32 → data.fontSize 32 and bounds
      grew; toggle bold → data.bold true and renderer shows it;
      corner-resize → fontSize scaled ≈ factor; hit box still fits.
- [ ] Full gates: `pnpm -r build`, unit suites, desktop e2e, lint.

### Acceptance Criteria

**Scenario:** Artist labels a map and adjusts the label.
**GIVEN** a placed text decoration selected with the select tool
**WHEN** the artist drags a corner handle outward
**THEN** the text scales up crisply as one durable command and stays
clickable across its whole body.
**WHEN** the artist sets size 32, serif, bold in the type row
**THEN** each change commits one UpdateDecoration, the canvas text
restyles, and double-click editing shows the same styling.
**GIVEN** the FTS index
**WHEN** styled text is searched
**THEN** it matches exactly as before (data.text unchanged).

### Issues Encountered

<!-- Filled out post-work. -->
