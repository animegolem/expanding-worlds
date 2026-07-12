---
node_id: AI-IMP-292
tags:
  - IMP-LIST
  - Implementation
  - menus
  - chrome
  - design-adoption
kanban_status: planned
depends_on: [AI-IMP-286, AI-IMP-288]
parent_epic: [[AI-EPIC-029-the-kit-adoption-push]]
confidence_score: 0.8
date_created: 2026-07-12
date_completed:
---

# AI-IMP-292-board-and-ground-menus

## Summary of Issue #1

The board menu is pre-kit chrome: hand-rolled rows, a native color
input, a squared dropdown predating MenuPopover, and it holds the
title strip up after unhover. The rulings (letter 5/6/23 + the
rail-table crumb decision): the board menu becomes a MenuPopover
opened from ❖ in a chrome container on the board's crumb — board
verbs live on the board's identity — with THREE doors: crumb ❖ ·
right-click ground · long-press ground. The ground doors open ONE
menu: a HERE section (paste · text · pin · shape · frame — creation
lands at the click point, plain-key shortcuts in mono) above a
"board…" row opening the ❖ menu. A swatch row replaces the OS color
input ("BG from file…" becomes "bg from image…"). The smoky strip
hover gradient retires; containers carry the signature spot and ❖
(supersedes decision-01). Also fixes the ☰ Export row lie (top-10
#10): Settings ships export live, so the row activates or leaves.
Done means: one menu grammar, three doors, no native color input,
strip reveal goes pure, export row honest.

### Out of Scope

- Moving ☰ itself to the strip (AI-IMP-293 recomposes the rail and
  strip corners together).
- Background edit-mode (the model citizen) — unchanged.
- The identity corner ◎ (AI-IMP-295).

### Design/Approach

PathBar's current-board crumb gains the ❖ container (surface/
border/radius 7 per ruling 6); click opens MenuPopover with the
§6.7 verb set, swatch row (288's SwatchRow + ColorPicker), and
"bg from image…". Ground: right-click on empty board routes
through ContextMenu.ts to the combined menu; long-press is its
touch twin (GR-5). HERE verbs call the existing creation entry
points with the click's world point; shortcuts render in mono.
No arrange verbs in the ground menu (ruled — arrangement requires
a selection). Strip: with the board menu gone from the strip
band, remove the hold-open special case so reveal/tuck is pure
cursor-Y (SURFACE-REVIEW's caught bug).

### Files to Touch

`apps/desktop/src/renderer/chrome/PathBar.svelte`: crumb ❖.
`apps/desktop/src/renderer/chrome/TitleStrip.svelte`: gradient
  retirement, pure reveal, old board-menu removal.
`apps/desktop/src/renderer/chrome/MenuPopover.svelte`: host the
  board menu + verify the export row's state logic (menus/ owner
  in round-1 — the ☰ menu may live in menus/).
`apps/desktop/src/renderer/menus/ContextMenu.ts`: ground menu
  (HERE + board… row).
`apps/desktop/src/renderer/canvas/import-surfaces.ts` /
  `board-tooling.ts`: creation-at-point calls.
e2e: board-menu three-doors spec + ground-creation spec.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [ ] Round-1: verify the current board menu's anatomy + strip
      hold-open path, the §6.7 verb inventory, where ☰/export row
      lives, and the kit pages (4a/4b/4d + ground menu); record
      corrections here.
- [ ] ❖ in a chrome container on the board's crumb; MenuPopover
      with §6.7 verbs; swatch row replaces the native color input;
      "bg from image…" copy.
- [ ] Ground right-click + long-press open the combined menu; HERE
      verbs create at the click point (paste honors clipboard
      availability with an inert+why row, never hidden).
- [ ] No arrange verbs in the ground menu.
- [ ] Strip gradient retired; reveal/tuck pure; nothing holds the
      strip after unhover (regression test).
- [ ] ☰ Export row honest: routes to the live Settings export (or
      the row is removed if the menu ruling says so — record).
- [ ] Old board-menu component deleted; no native color inputs
      remain in the strip/menu path (guard allowlist shrinks).
- [ ] Unit + e2e green; full local gate green with counts read.

### Acceptance Criteria

**Scenario:** three doors, one menu.
**GIVEN** a board with content
**WHEN** the user clicks the crumb's ❖, right-clicks empty ground,
and long-presses empty ground (touch mode)
**THEN** all three open the same board-menu surface (ground doors
via the HERE menu's board… row)
**AND** painting a background swatch commits without any OS color
dialog
**AND** choosing "text" from the HERE menu starts text entry at
the click point.

### Issues Encountered

