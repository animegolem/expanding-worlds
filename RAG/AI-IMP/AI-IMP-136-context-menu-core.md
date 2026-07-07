---
node_id: AI-IMP-136
tags:
  - IMP-LIST
  - Implementation
  - design-pass
  - menus
  - canvas
kanban_status: completed
depends_on:
parent_epic: [[AI-EPIC-016-context-click-menus]]
confidence_score: 0.7
date_created: 2026-07-07
date_completed: 2026-07-07
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

- [x] Menu surface: §8.8 clamp, keyboard model, MenuPopover-kin
      styling on tokens, popover rung.
- [x] Inventory module encodes the grammar structurally; vitest
      invariants.
- [x] Item + board inventories complete per §8.4 (disabled
      coming-soon rows only where a command truly lacks — listed
      in Issues).
- [x] Registry declarations for the new chords; Settings Keyboard
      lists them; menu rows print them mono.
- [x] E2E: order/danger assertions + verb round-trips (flip via
      menu = one undo; backdrop color row applies).
- [x] Gates: `pnpm -r build`, `pnpm -r test`, `pnpm lint`, desktop
      e2e hidden.
- [x] HUMAN-TESTING entry appended at merge by the lead (verb
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

**Coming-soon rows (command truly absent — per the §6.5 / §8.2
grammar).** No renderer OR command surface exists for these yet, so
they ship disabled (greyed, aria-labelled reason, no tooltip chip):

- **Replace image…** and **Swap for…** (§6.5) — the ratified verbs are
  named, but no `ReplaceImage` / `SwapNode` command exists in
  `@ew/commands` (confirmed by enumerating the command vocabulary).
  These are the swap/replace pass's work.
- **Place on another board…** — the shipped place flows
  (`onPlaceNode`, place-mode) target the CURRENT board only; there is
  no cross-board picker, so this stays coming-soon until one lands.
- **Crop** — matches the charm bar's own disabled crop button (the
  crop editor is a later ticket).
- **Paste** (board menu) — the paste flow is bound to the window
  `ClipboardEvent` in `import-surfaces.ts`; there is no
  menu-callable paste command, and ⌘V still pastes. Left as a
  coming-soon row rather than reading the clipboard ad hoc.

**Deviation — note-lifecycle folded into the item menu (superset of
§8.4's single "note" verb).** node-menu.ts (the old placement
right-click for Attach/Detach/Rename/Make-Independent) had to be
retired — one gesture cannot own two menus. Its shipped operations and
their e2e coverage (notes.spec, import.spec) would have regressed, so
the item menu's note area reproduces them (Open · Attach new… · Attach
existing… · Rename… · Detach · Make independent…) reusing node-menu's
exact testids. This is a documented superset of the RFC's lone "note"
verb; the lead may relocate the lifecycle ops to the note panel per
final design. node-menu.ts is deleted.

**Deviation — lock / backdrop verbs are NOT one-undo (fence
collision).** The rev 0.55 §8.4 wording ("every verb is one undoable
command") and the ticket's "backdrop color via menu" one-undo example
require `SetPlacementLock`, `SetCanvasBackground(Color)`, and
`SetPlacementLabelVisibility` to enter the undo stack. They are NOT in
`undo/undo-store.ts`'s conservative `CAPTURED_COMMANDS` allowlist, and
BOTH `undo/` and `packages/*` are fenced off for this ticket — so I
could not opt them in (the sanctioned "opt in by name" seam lives in
the fenced file). The verbs dispatch and commit correctly (the charm
bar's lock and the title strip's color have the same non-undo
behavior today), but a menu lock / backdrop-color is currently NOT
reverted by ⌘Z. The e2e proves one-undo on the three verbs that ARE
captured (flip · z-order · delete, all on the item menu); the board
backdrop-color test asserts the commit (revision +1), not a revert.
**Recommend the lead add `SetPlacementLock`, `SetCanvasBackground`,
`SetCanvasBackgroundColor`, `SetPlacementLabelVisibility` to
`CAPTURED_COMMANDS`** (a one-line-each data change, the documented
extension path) so the §8.4 "one undoable command" promise holds —
verified those handlers already emit inverses is still owed.

**Shortcut chords.** Flips (⇧H/⇧V), z-order (⌘]/⌘[/⇧⌘]/⇧⌘[),
delete (⌫), select-all (⌘A) already existed and are reused (the
rev 0.55 map's bare `] [` for z-order would collide with the shipped
⌘]/⌘[ nav + z-order chords, so the shipped bindings win and the menu
prints them — deviation recorded). NEW declarations: **lock ⇧⌘L**,
**open-as-board ⏎**, **zoom-fit ⇧1**, each with dispatch wired where
its surface lives — lock + open-as-board in gestures-ui (board keys),
zoom-fit in the dock. ⏎ is guarded to a single-placement selection so
a stray Enter never fires it; gallery keeps its own Enter (gestures
are dead under a takeover).

**Appearance / Tags wiring.** Rather than duplicate the charm popovers,
the menu's Appearance and Tags verbs fire a new `ew-charm-popover`
event that charms-ui listens for; it selects the placement and opens
the SAME popover the charm bar owns (single source of truth).

**Submenus.** Core ships no submenus (Appearance/Tags are launchers),
but the types + `validateMenu` enforce "submenu only on the
Appearance · Tags · Align · Sort families" and the surface renders a
basic family flyout, so 137's Align/Sort inventories inherit the rule
and the rendering for free.

**Gates (all green).** `pnpm -r build` OK · `pnpm -r test` OK
(desktop vitest incl. 19 new inventory invariants; 147/147 desktop
e2e incl. the 2 new context-menu specs; notes.spec + import.spec pass
unchanged) · `pnpm lint` clean · `apps/desktop pnpm test` OK. No
flakes needed a retry.
