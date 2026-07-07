---
node_id: AI-IMP-155
tags:
  - IMP-LIST
  - Implementation
  - menus
  - polish
kanban_status: planned
depends_on:
parent_epic:
confidence_score: 0.85
date_created: 2026-07-07
date_completed:
---


# AI-IMP-155-menu-review-polish

## Summary of Issue #1

Three low-severity defects from the Codex review of PR #9, each
adversarially verified against the code (none breaks a ratified
invariant): (1) the Help/About "keyboard shortcuts" link opens the
Settings takeover without closing the ☰ menu popover, which stays
painted above the takeover (`z.ts`: popover 500 > takeover 300);
(2) Gather-into-frame ignores a `CaptureInFrame` conflict/validation
failure after the frame create committed, leaving an empty frame
with no error surfaced (recoverable — the undo group collapses to
the lone create); (3) `openFrameMenu` awaits `frameSortOnDrop` and
then renders unconditionally, so a stale resolution can replace a
newer menu opened during the await. Done means: all three paths
behave, with the cheapest honest test each.

### Out of Scope

- Decoration undo capture and Lock-all breadth (AI-IMP-154).
- Delete-frame undo routing (DESIGN-QUEUE).
- Flyout clamp-to-viewport for submenus (cosmetic; note it if
  touched).

### Design/Approach

(1) Thread the rail-close through the shortcuts path: pass
MenuPopover's `onclose` into HelpAboutDialog and invoke it before
`openTakeover('settings')` — mirror the Settings row's ordering.
(2) Check the `CaptureInFrame` result inside the gather handler; on
non-committed status surface `onError` (the group already leaves
one undoable create — do not auto-delete the frame, an undo does).
(3) Monotonic open-token in ContextMenu: capture before the await,
bail if a newer open/close happened (compare against the current
token after resolution).

### Files to Touch

`apps/desktop/src/renderer/chrome/MenuPopover.svelte`: pass rail
close through.
`apps/desktop/src/renderer/chrome/HelpAboutDialog.svelte`: call it
in `openKeyboardShortcuts`.
`apps/desktop/src/renderer/menus/ContextMenu.ts`: gather result
check; frame-menu open token.
`apps/desktop/e2e/`: Help/About shortcut path asserts the ☰ menu is
gone after the takeover opens; gather-failure and stale-menu races
get vitest-level coverage if e2e cannot drive them honestly (no
sleep-based race tests).

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [ ] Shortcuts link closes the ☰ popover before the Settings
      takeover opens; e2e asserts the popover is unmounted.
- [ ] Gather surfaces `CaptureInFrame` failure via `onError`;
      behavior on success unchanged (existing e2e green).
- [ ] Frame-menu open token: stale async resolution never replaces
      a newer menu (unit-test the token logic).
- [ ] Gates: `pnpm -r build`, `pnpm -r test`, `pnpm lint`, desktop
      e2e hidden.

### Acceptance Criteria

**GIVEN** the ☰ menu is open and Help/About is showing
**WHEN** the user clicks the keyboard-shortcuts link
**THEN** the Settings takeover opens
**AND** the ☰ popover is no longer in the DOM.

**GIVEN** a gather whose `CaptureInFrame` fails
**WHEN** the handler resolves
**THEN** the error hook fires and one Mod+Z removes the empty frame.

**GIVEN** a frame menu open awaiting its settings read
**WHEN** the user opens a different context menu before it resolves
**THEN** the newer menu stays.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->
