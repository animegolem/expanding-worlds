---
node_id: AI-IMP-277
tags:
  - IMP-LIST
  - Implementation
  - outline
  - field-report
  - keyboard
kanban_status: completed
depends_on: []
parent_epic: [[AI-EPIC-028-the-outliner-control-panel]]
confidence_score: 0.9
date_created: 2026-07-11
date_completed: 2026-07-11
---


# AI-IMP-277-outline-deliberate-cursor

## Summary of Issue #1

alph's first outliner field report (2026-07-11, v0.24.0): the
no-click preview-follow is DISORIENTING rather than helpful —
crossing the tree with the mouse churns the preview the whole way.
Source-verified: `OutlineView.svelte:519`
`onpointerenter={() => (selectedKey = row.key)}` rides the cursor
on hover, and NO cursor-movement key exists at all (the keyboard
door maps only verbs + tab/escape; selection moves solely by
hover, click, or tab-focus). The grammar's "never a click cost"
shipped as hover-follow — the wrong reading; its ancestors (yazi,
org, NLS) follow a DELIBERATE cursor. Owner-ratified delta
(2026-07-11, grammar doc rev owner-pending — THIS TICKET IS
NORMATIVE until it lands): hover never moves selection; click and
keyboard do; three simultaneous keyboard dialects (arrows, HJKL,
WASD — no setting); org-standard Left/Right (Right unfolds; Left
folds, or jumps to parent when already folded/leaf); `/` reserved
in the grammar for future search focus, so type-ahead is
deliberately off the table.

Done means: hovering rows changes only the visual highlight;
↑↓/jk/ws move the selection (scrolled into view); →/l/d unfolds,
←/h/a folds-or-parents; every dialect dead when an input owns
focus or an outline dialog is open.

### Out of Scope

- The grammar/kit doc revision (owner-authored, lands separately).
- Touch dialect changes (tap already selects deliberately).
- Any new verb; `/`-search itself (reserved, not built).
- Type-ahead filtering (ruled out by the letter bindings).

### Design/Approach

(1) `inventory.ts`: extend `OutlineNavigationIntent` with
`cursor-up | cursor-down | cursor-left | cursor-right`; the
keyboard door maps the twelve keys (modifier-free only) to
intents via the existing `navigate` callback. Navigation stays
distinct from verbs, so three-door parity is untouched by
construction. (2) `OutlineView.svelte`: delete the
`onpointerenter` selection line (the `:hover` CSS highlight
stays); row-level click selects (covers meta/blank areas beyond
`row-main`); `moveCursor(±1)` clamps within `rows` and
`scrollIntoView({block:'nearest'})` after tick; `cursorRight` =
unfold when foldable+folded else no-op; `cursorLeft` = fold when
unfolded else scan `rows` upward for the first shallower depth
(parent jump; no-ops in flattened worklists at uniform depth).
(3) DIALOG GATE: the capture-phase window keydown handler
early-returns (except Escape) while `trashImpact`, `menuPoint`,
or `tagging` is open — this also fences a live defect where bare
Enter with the trash confirm open still reached the verb map and
could dive the row underneath the dialog.

### Files to Touch

- `apps/desktop/src/renderer/outline/inventory.ts` (intents +
  twelve-key map).
- `apps/desktop/src/renderer/outline/inventory.test.ts` (dialect
  coverage, modifier/input rejection, parity unchanged).
- `apps/desktop/src/renderer/views/OutlineView.svelte` (hover
  line removed, cursor movement, dialog gate).
- `apps/desktop/e2e/outline.spec.ts` (hover-does-not-move pin,
  keyboard navigation, fold semantics).
- `RAG/HUMAN-TESTING.md` (alph re-run of the cleanup loop),
  `CHANGELOG.md` [Unreleased], `RAG/DESIGN-QUEUE.md` ruling
  record.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [x] Hover-follow removed; hover changes visuals only; click
      (anywhere on the row, via pointerdown) selects.
- [x] Twelve cursor keys live as navigation intents (arrows +
      HJKL + WASD, modifier-free, input-gated); selection scrolls
      into view.
- [x] Org Left/Right: unfold / fold-or-parent; inert on
      non-foldable flattened rows except parent jump.
- [x] Dialog gate: cursor keys and verbs dead while trash
      confirm, row menu, or tag popover is open (Escape still
      closes); the Enter-under-dialog defect fenced by test.
- [x] Unit + e2e added; full `CI=true pnpm check` green
      (pipefail: build, units, lint, spike, e2e 256/256; outline +
      loose-note-trash specs re-run alone 7/7).
- [x] HUMAN-TESTING entry, CHANGELOG [Unreleased], DESIGN-QUEUE
      ruling recorded.

### Acceptance Criteria

**GIVEN** the outline takeover with the pointer sweeping across
many rows
**WHEN** no click occurs
**THEN** the selection and preview do not change (row highlight
only)

**GIVEN** any of ↑↓, j/k, w/s
**WHEN** pressed with the tree focused and no dialog open
**THEN** the selection moves one row, the preview follows, and
the row scrolls into view

**GIVEN** a folded board row / an unfolded board row / a child row
**WHEN** →(l/d) / ←(h/a) is pressed
**THEN** it unfolds / folds / jumps to the parent row

**GIVEN** the trash confirm, row menu, or tag popover is open
**WHEN** any cursor or verb key is pressed
**THEN** nothing reaches the outline map (Escape still closes the
surface)

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->

Lead-built (decision ticket). Row-level select went on POINTERDOWN
rather than a row onclick — same deliberate-gesture semantics,
no Svelte a11y warning on the treeitem div. Three existing e2e
call sites selected rows via `.hover()` (the very behavior being
removed) and were reworked to `outline-row-activate` clicks; the
loose-note-trash hover survives (it reveals row actions via CSS
only). The Enter-under-dialog leak was confirmed real before the
gate: the capture-phase window listener reached the verb map with
the trash confirm open (no autofocus in the dialog). Grammar doc
rev is owner-pending; this ticket carries the ruling until then.
