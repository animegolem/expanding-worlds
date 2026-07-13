---
node_id: AI-IMP-190
tags:
  - IMP-LIST
  - Implementation
  - canvas
  - decorations
  - design-pass
kanban_status: cancelled
depends_on: []
parent_epic:
confidence_score: 0.6
date_created: 2026-07-08
---


# AI-IMP-190-shape-picker-and-gap-review

> SUPERSEDED (2026-07-12): the hold flyout is ruled and drawn (kit 2a; DESIGN-LETTER ruling 3) and re-scoped as AI-IMP-290 under AI-EPIC-029, which cites this ticket's Miro comparison table as the shape-set benchmark — the table stays authoritative reading.

> ROUND-1 DELTA (2026-07-12): this ticket never contained the claimed
> comparison table. AI-IMP-290 authors it and ships the ratified
> rectangle · ellipse · triangle · diamond · block-arrow set; its Issues
> table is the authoritative gap record.

## Summary of Issue #1

Owner testing note + ruling (2026-07-08): the shape tool's current
row of shape buttons (Rect · Ellipse · Triangle · Arrow shape)
should become a HOLD-PICKER, "like Photoshop": press-and-hold (or
long-press/right-click) the dock's shape button opens a small grid
palette of shapes anchored to the button; pick one and it becomes
the active shape (the button's glyph updates to show it). Plus a
GAP REVIEW: compare our shape set against the basic-shapes set of a
tool like Miro (rounded rect, diamond, pentagon, hexagon, star,
parallelogram, speech bubble, cross, cylinder…) and record which
gaps matter for an art reference board — the review TABLE is a
deliverable; building missing shapes is follow-up scope unless
trivial. Done means hold-to-open grid picker per the kit grammar
(cascade, tokens), active-shape-on-the-button, quick-click keeps
the last shape, and the gap table in Issues Encountered with a
recommendation.

### Out of Scope

- Building the full missing-shape set (gap table first; new shapes
  are follow-up tickets unless ≤ trivial path additions).
- Shape STYLE controls (stroke/fill bars — 189's restyle).
- Freehand/pencil.

### Design/Approach

Interaction: pointerdown on the shape button starts a hold timer
(~350ms) → grid popover (menu-cascade, kit button grammar, one
glyph per shape, tooltip names); release-over-shape or click
selects. Quick click = activate tool with last shape (current
behavior preserved). Keyboard: the existing S binding cycles or
opens — match the current binding's meaning, don't change semantics
without flagging. Shapes are decorations (validated in handlers,
NOT SQLite CHECK — house rule) so adding kinds later is cheap;
note this in the gap table's recommendation. Picker state (last
shape) persists per-project via the existing settings surface.

### Files to Touch

`apps/desktop/src/renderer/chrome/Dock.svelte` (button + picker),
`canvas/` shape-tool wiring, e2e: hold opens grid, pick changes
active shape + button glyph, quick-click draws last shape.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [ ] Hold-picker grid per kit grammar; active shape on the
      button; quick-click = last shape.
- [ ] Last-shape persists per project.
- [ ] Gap table vs Miro basics in Issues Encountered with a
      recommendation (build list for follow-up).
- [ ] Gates: `pnpm -r build && pnpm -r test && pnpm lint` + hidden
      e2e.
- [ ] HUMAN-TESTING entry appended at merge by the lead (hold
      delay feel; grid legibility).

### Acceptance Criteria

**GIVEN** the dock's shape button
**WHEN** the user holds it
**THEN** a shape grid opens; picking one arms the tool and updates
the button glyph
**AND** a quick click arms the previously-used shape — and the
ticket's Issues Encountered carries the shape-set gap table.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->
