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
shared verb context menu with the inventory that makes sense from the
gallery (dive or place/pull · fly-to where placed · open note or add a
note · tag · trash — round-1 review enumerates against the ruled inventory,
excluding board-geometry verbs that have no meaning there).

### Out of Scope

Gallery inspector design (AI-IMP-204, open); thumbnail badges and
caption-description questions (DESIGN-QUEUE, item 12); any new
verbs not already in the ruled inventory.

### Design/Approach

Round-1 correction: there was no shared `MenuPopover`/node-menu
component. Canvas owns an imperative placement menu; `MenuPopover` is
the app ☰. The valid seam was Outliner's one verb inventory plus its
Svelte context renderer. The renderer is now generalized and the
inventory extended only by Gallery's already-shipped Pull verb. Gallery
supplies a filtered action bag — no second row list (one inventory, one
component, N doors). Anchor per one-physics
(menu clamps at viewport edges; gallery is a takeover so §8.8
rungs apply).

Exact projection: one board offers Dive; one ordinary this-world node
offers Place; a placed single node additionally offers Fly; notes use
Outliner's verbatim `open note` / `add a note…`; Tag and Trash apply to
the target selection. Multi-selection offers Place / Tag / Trash only.
Everything offers Pull for one image and no foreign Fly. Inapplicable
verbs are absent. A node with one placement flies directly; several
placements open the ⌖ chooser. Right-click outside the selection retargets
to that cell; inside preserves the selection.

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

- [x] Round-1 review: cite the ruled inventory + existing menu
      component; enumerate the gallery-meaningful subset here.
- [x] Right-click a gallery cell → the node context menu opens,
      anchored and clamped; long-press parity per touch dialect.
- [x] Every offered verb works from the gallery (fly-to-placement
      closes the takeover and flies; trash routes §9).
- [x] Excluded verbs are absent, not disabled-forever rows.
- [x] e2e: door census + one verb round-trip per category.

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

- The round-1 component claim was false; generalizing the Outliner
  renderer avoided coupling Gallery to CanvasHost's imperative,
  placement-specific menu.
- Gallery and Outline now share one 550ms / 8px touch-hold recognizer.
  Meaningful movement cancels the hold and yields to native drag; a
  fired hold consumes the synthetic click once.
- Validation: `pnpm -r build`; pre-review desktop 80 files / 589 tests;
  affected hidden-window Gallery + Outline shards 24/24. After the two
  review corrections, focused units passed 28/28 and the Gallery context
  shard passed 3/3. The final shared-worktree desktop run was 589 passed /
  1 failed (590 total): the sole failure is the shrink-ladder guard against
  AI-IMP-310's parallel `pin-geometry.ts` edit, outside this ticket.
