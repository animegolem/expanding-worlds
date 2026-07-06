---
node_id: AI-IMP-059
tags:
  - IMP-LIST
  - Implementation
  - shell
  - chrome
kanban_status: planned
depends_on: []
parent_epic: [[AI-EPIC-006-shell-and-local-scope]]
confidence_score: 0.75
date_created: 2026-07-05
date_completed:
---

# AI-IMP-059-shell-chrome-frame

## Summary of Issue #1

The running app still wears the EPIC-005 provisional layout: a fake
tab bar in Workspace.svelte, two docked toolbars (BoardToolbar,
DecorationToolbar), no charm rail, no dock, no title strip, no
engagement cadence, and ad-hoc tooltips. RFC §8.2 (rev 0.17) exists
only on paper. This ticket builds the floating chrome layer: the
vertical mode charm rail upper-right, the bottom-center dock (tool
modes, zoom cluster, selection-conditional z-order), the
hover-revealed title strip, one shared fade clock for all chrome,
and the tooltip rule (name + shortcut chip on every control,
~500ms, one style app-wide). Covers EPIC-006 FR-1, FR-2, FR-3.
Done when: every tool function is reachable through the new chrome,
a board at rest with the cursor outside the window shows zero
chrome, and the shell/board-tooling/decorations e2e suites pass
against the new selectors.

### Out of Scope

Navigation path/Home/bookmarks (060/061), node hint charms and the
charm bar (063), note panels (064), toasts and the perch (066 — the
StatusStrip stays docked for now), the pin dock tool (067 inserts ◉
into the dock), and all global takeover views (EPIC-013). The rail's
⌕ ⊛ ⊞ ▤ charms render disabled with an "arrives with global views"
tooltip.

### Design/Approach

One ChromeLayer component mounted over the canvas in App.svelte
(fixed-position children, pointer-events only on controls — the
canvas never reflows). Workspace's tab bar is deleted; the interim
Create Pin… and Sources buttons move to the hover title strip until
067/065 retire them. Dock hosts the tool-mode buttons currently in
DecorationToolbar (select · text · shape press-hold flyout · draw ·
line · arrow · connector) plus the zoom cluster; the
selection-conditional segment carries z-order forward/backward and
absorbs BoardToolbar's align/distribute (they are selection verbs;
judgment call, flagged). Canvas-background controls move under the
title strip's Board menu interim. Engagement cadence is one
`engagement.ts` store: cursor-out or ~4s idle fades the whole layer
on one clock (any element fading independently is a bug); hover
lights that control alone to 100%. Fade delay joins the feel
constants (AI-IMP-056 file). Tooltips are a single Svelte action
rendering one chip style with name + printed shortcut. Keep DOM
structure testid-stable: `charm-rail`, `dock`, `title-strip`,
per-control testids.

### Files to Touch

`apps/desktop/src/renderer/App.svelte`: mount ChromeLayer; keep
NotePane/StatusStrip grid until 064/066.
`apps/desktop/src/renderer/Workspace.svelte`: delete tab bar; slot
canvas full-bleed.
`apps/desktop/src/renderer/chrome/ChromeLayer.svelte`,
`CharmRail.svelte`, `Dock.svelte`, `TitleStrip.svelte`,
`engagement.ts`, `tooltip.ts`: new.
`apps/desktop/src/renderer/BoardToolbar.svelte`,
`DecorationToolbar.svelte`: absorbed into Dock/TitleStrip; files
retire.
`apps/desktop/src/renderer/canvas/feel-constants` (wherever
AI-IMP-056 put them): fade delay, tooltip delay.
`apps/desktop/e2e/shell.spec.ts`, `board-tooling.spec.ts`,
`decorations.spec.ts`, `helpers.ts`: selector migration + cadence
coverage.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and
**think**. Have you validated all aspects are **implemented** and
**tested**?
</CRITICAL_RULE>

- [ ] ChromeLayer mounted in App.svelte; canvas underneath never
      reflows (assert canvas element size unchanged when chrome
      toggles).
- [ ] CharmRail: ⧉ ⌕ ⊛ ⊞ ▤ ☰ icon buttons, generous hit targets;
      global-view charms disabled with deferred tooltip; ☰ opens a
      minimal anchored menu panel (placeholder entries).
- [ ] Dock: tool modes migrated from DecorationToolbar with shape
      press-hold flyout; divider; zoom out · % · zoom in · fit;
      selection-conditional segment (z-order, align, distribute)
      appears only while a selection exists.
- [ ] Title strip: hover-revealed top edge; carries interim Create
      Pin…/Sources buttons and Board menu (background controls);
      hidden otherwise.
- [ ] engagement.ts: one shared clock; cursor-leave and idle fade
      the entire layer together; hover restores one control to
      full opacity; constants in the feel file.
- [ ] tooltip.ts action applied to every chrome control: name +
      shortcut chip, one style, ~500ms delay.
- [ ] BoardToolbar/DecorationToolbar deleted; no orphaned imports;
      `pnpm -r build` green.
- [ ] e2e: shell.spec asserts rail/dock/title-strip presence and
      the at-rest-zero-chrome state (cursor out → chrome layer
      opacity 0); board-tooling and decorations specs migrated to
      dock selectors; full desktop e2e green hidden-window.

### Acceptance Criteria

**GIVEN** a running board with the cursor outside the window
**WHEN** ~the idle delay elapses
**THEN** rail, dock, and title strip are all faded on one clock and
the board reads as wallpaper.

**GIVEN** a selection of two placements
**WHEN** the user looks at the dock
**THEN** z-order/align/distribute controls are present, and absent
again when the selection clears.

**GIVEN** any chrome control under hover
**WHEN** ~500ms passes
**THEN** one chip-style tooltip names it and prints its shortcut.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->
