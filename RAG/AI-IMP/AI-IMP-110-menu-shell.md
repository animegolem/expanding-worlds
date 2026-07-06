---
node_id: AI-IMP-110
tags:
  - IMP-LIST
  - Implementation
  - chrome
  - menus
kanban_status: planned
depends_on:
parent_epic: [[AI-EPIC-016-context-click-menus]]
confidence_score: 0.85
date_created: 2026-07-06
date_completed:
---

# AI-IMP-110-menu-shell

## Summary of Issue #1

The ☰ menu inventory was ratified at rev 0.45 §8.2 (Undo · Redo ·
divider · Trash… · End Session · divider · Settings · Help/About)
but MenuPopover.svelte carries only Settings… plus deferred
End-session/Export rows. Done = the popover renders the ratified
geography: every row present in order with its printed shortcut or
deferred tooltip, Help/About actually works, and the menu is the
stable self-teaching surface the RFC promises — even while Undo,
Redo, and Trash… stay disabled until their epics land.

### Out of Scope

- The undo/redo STACK (EPIC-007 — no renderer stack exists yet;
  rows ship disabled with an "arrives with the undo epic"
  tooltip, exactly the existing deferred-row grammar).
- The trash browser itself (AI-IMP-102, design-gated; the row
  ships disabled pointing at it).
- End Session behavior (stays deferred as today).
- Export row: rev 0.45 lists no Export in the core inventory —
  keep the existing deferred Export row BELOW Help/About rather
  than deleting it (the §16 sheet still anchors here).

### Design/Approach

Pure MenuPopover.svelte rework following its own idiom: live rows
call onclose() then act; deferred rows render aria-disabled with
the naming tooltip. Undo/Redo rows print their shortcuts (Mod+Z /
Shift+Mod+Z) in the §8.2 tooltip-chip style even while disabled —
the self-teaching duty is the row's job today. Help/About opens a
small anchored dialog (§8.8-compliant: root overlay host, clamped)
showing app name, version (from the packaged app metadata — the
main process exposes it or app.getVersion via a preload seam if
one exists; do not hardcode), and the repo URL as plain text. Keep
testids: menu-undo, menu-redo, menu-trash, menu-end-session,
menu-settings, menu-help. Update the existing shell e2e that
asserts the menu's contents.

### Files to Touch

`apps/desktop/src/renderer/chrome/MenuPopover.svelte`: the rework.
`apps/desktop/src/renderer/chrome/` (small new About component or
inline block).
`apps/desktop/src/preload/index.ts` + `src/main/index.ts`: ONLY if
no version seam exists (a one-liner IPC for app.getVersion).
`apps/desktop/e2e/shell.spec.ts`: inventory assertions.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and
**think**. Have you validated all aspects are **implemented** and
**tested**?
</CRITICAL_RULE>

- [ ] Rows in ratified order with dividers; Settings stays live;
      Undo/Redo/Trash…/End Session deferred with naming tooltips;
      Undo/Redo print shortcuts.
- [ ] Help/About opens a clamped anchored dialog with real app
      version (no hardcoded string); Esc/click-off closes.
- [ ] e2e: menu lists the full inventory in order; Help/About
      shows the version; disabled rows are aria-disabled and do
      nothing on click.
- [ ] Full gates.

### Acceptance Criteria

**GIVEN** the ☰ charm is clicked
**WHEN** the popover opens
**THEN** the rows read Undo · Redo · Trash… · End Session ·
Settings · Help/About (· Export) in that geography, disabled rows
name what enables them
**AND** Help/About shows the running version
**AND** Settings still opens the takeover.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->
