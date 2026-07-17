---
node_id: AI-IMP-311
tags:
  - IMP-LIST
  - Implementation
  - gallery
  - context-menu
  - tester-feedback
kanban_status: planned
depends_on:
parent_epic:
confidence_score: 0.75
date_created: 2026-07-17
date_completed:
---

# AI-IMP-311-gallery-context-menu

## Summary of Issue #1

First tester field doc (2026-07-17, item 11): right-click does
nothing on gallery images. The ruled context grammar is ONE
INVENTORY, multiple doors (rev 0.55 context-menu grammar; the
node context menu already exists board-side) — the gallery
surface simply never got its door. Done means: right-click (and
long-press per the touch dialect) on a gallery cell opens the
node context menu with the inventory that makes sense from the
gallery (open/fly-to where placed · place-existing · tag ops ·
trash — round-1 review enumerates against the ruled inventory,
excluding board-geometry verbs that have no meaning there).

### Out of Scope

Gallery inspector design (AI-IMP-204, open); thumbnail badges and
caption-description questions (DESIGN-QUEUE, item 12); any new
verbs not already in the ruled inventory.

### Design/Approach

Round-1 review cites the existing node context menu component and
inventory ruling, and the gallery cell event handling. Reuse the
SAME MenuPopover/inventory component filtered to
gallery-meaningful rows — no second menu implementation (one
inventory, one component, N doors). Anchor per one-physics
(menu clamps at viewport edges; gallery is a takeover so §8.8
rungs apply).

### Files to Touch

`apps/desktop/src/renderer/**/Gallery*.svelte`: cell context
events + menu mount.
Context-menu inventory module (review cites): gallery filter.
`apps/desktop/test/e2e/gallery-*.spec.ts`: door + inventory
census.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and
**think**. Have you validated all aspects are **implemented** and
**tested**?
</CRITICAL_RULE>

- [ ] Round-1 review: cite the ruled inventory + existing menu
      component; enumerate the gallery-meaningful subset here.
- [ ] Right-click a gallery cell → the node context menu opens,
      anchored and clamped; long-press parity per touch dialect.
- [ ] Every offered verb works from the gallery (fly-to-placement
      closes the takeover and flies; trash routes §9).
- [ ] Excluded verbs are absent, not disabled-forever rows.
- [ ] e2e: door census + one verb round-trip per category.

### Acceptance Criteria

**Scenario:** Right-clicking a gallery image.
**GIVEN** the gallery takeover with placed and unplaced images.
**WHEN** the user right-clicks a cell.
**THEN** the node context menu opens with the gallery-meaningful
inventory,
**AND** its verbs act correctly from the gallery context,
**AND** the menu clamps inside the viewport at edge cells.

### Issues Encountered

<!--
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->
