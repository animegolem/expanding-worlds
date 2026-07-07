---
node_id: AI-IMP-136
tags:
  - IMP-LIST
  - Implementation
  - design-pass
  - menus
  - canvas
kanban_status: planned
depends_on:
parent_epic: [[AI-EPIC-016-context-click-menus]]
confidence_score: 0.7
date_created: 2026-07-07
date_completed:
---


# AI-IMP-136-context-menu-core

## Summary of Issue #1

EPIC-016 activates on rev 0.55's ratified grammar (§8.4). This
ticket is the interface-defining core: ONE context-menu surface
(build shape, positioning, keyboard model, the grammar rules
enforced structurally) plus the two biggest inventories — ITEM and
BOARD BACKGROUND. Done means: right-click on an item or empty
board opens the ratified menu at the cursor (clamped per §8.8),
every row is verbs-only with mono shortcuts printed, destructive
rows sit last behind a divider, submenus exist only for families,
and every verb dispatches an existing undoable command.

### Out of Scope

- Decoration / multi-select / frame menus + Help/About copy
  (AI-IMP-137, builds on this surface).
- NEW verbs lacking commands (Replace image…/Swap for…/Replace
  backdrop… exist per §6.5 shipped work — verify; place-on-
  another-board exists via place-existing; anything genuinely
  missing gets a disabled coming-soon row per the tooltip
  grammar, recorded in Issues).
- Rebinding/shortcut changes (print what the registry declares).

### Design/Approach

A `ContextMenu` component in the menus family (MenuPopover is the
visual kin — same tokens/radius/row anatomy) mounted at the
popover z-rung, driven by a declarative per-kind INVENTORY module:
`menuFor(kind, subject) → groups[] of {verb, commandOrAction,
shortcutId?, disabledReason?, danger?}` — the grammar (groups,
destructive-last, submenu families) lives in the inventory types
so 137's menus inherit it for free. Right-click resolution rides
the existing hit-test: item hit → item menu; none → board menu.
Keyboard: arrows/enter/esc per platform convention. Shortcuts
print via the keymap registry's formatBinding — new ids DECLARED
for verbs that have none (dispatch stays with the menu action);
the undistilled keyboard map from the Menus Document lands here
for the verbs this ticket ships (flips ⇧H/⇧V, z-order [ ], lock
⇧⌘L, delete ⌫, open-as-board ⏎, zoom-fit ⇧1, select-all ⌘A).
Item inventory per §8.4: crop flips appearance note tags
hide-label lock — Replace image… Swap for… — place-on-another-
board open-as-board set-as-backdrop z-order — Delete. Board:
paste select-all fit — backdrop family incl. Replace backdrop… —
color row (swatches + OS picker) — note-for-this-board. "Backdrop"
copy per rev 0.55. Never `<datalist>`; §9 confirms unchanged.

### Files to Touch

`apps/desktop/src/renderer/menus/` (new): ContextMenu.svelte,
inventories.ts (+ vitest: grammar invariants — destructive last,
one danger row, verbs have handlers or reasons).
`apps/desktop/src/renderer/canvas/host.ts` or gestures seam:
right-click routing (item vs board).
`apps/desktop/src/renderer/keys/bindings.ts`: new declarations.
`apps/desktop/e2e/context-menus.spec.ts` (new): open both menus,
grammar assertions (order, divider, danger-last), one verb per
family round-trips with single undo.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [ ] Menu surface: §8.8 clamp, keyboard model, MenuPopover-kin
      styling on tokens, popover rung.
- [ ] Inventory module encodes the grammar structurally; vitest
      invariants.
- [ ] Item + board inventories complete per §8.4 (disabled
      coming-soon rows only where a command truly lacks — listed
      in Issues).
- [ ] Registry declarations for the new chords; Settings Keyboard
      lists them; menu rows print them mono.
- [ ] E2E: order/danger assertions + verb round-trips (flip via
      menu = one undo; backdrop color row applies).
- [ ] Gates: `pnpm -r build`, `pnpm -r test`, `pnpm lint`, desktop
      e2e hidden.
- [ ] HUMAN-TESTING entry appended at merge by the lead (verb
      order feel; "backdrop" wording in situ).

### Acceptance Criteria

**GIVEN** a right-click on an image item
**THEN** the ratified item menu opens at the cursor with grouped
verbs, mono shortcuts, and Delete alone behind the last divider
**AND** every enabled verb performs its §-cited command with one
undo entry.
**GIVEN** a right-click on empty board
**THEN** the board menu offers paste/select-all/fit, the backdrop
family, the color row, and note-for-this-board.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->
