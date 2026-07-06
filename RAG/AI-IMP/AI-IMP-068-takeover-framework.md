---
node_id: AI-IMP-068
tags:
  - IMP-LIST
  - Implementation
  - shell
  - takeover
kanban_status: planned
depends_on: []
parent_epic: [[AI-EPIC-013-global-views]]
confidence_score: 0.8
date_created: 2026-07-05
date_completed:
---

# AI-IMP-068-takeover-framework

## Summary of Issue #1

Project-global views (RFC §8.2's second physics) have no host: the
rail charms are all inert and nothing in the shell can take over the
window. This ticket builds the takeover framework once — a
`chrome/takeover.ts` store holding at most one active takeover, a
TakeoverLayer mounted above the chrome in CanvasHost, entry from a
rail charm, return via Esc or the same charm, the canvas camera
untouched by the round trip — plus the input scoping that makes a
takeover a real mode: board keyboard shortcuts (tool keys, delete,
undo) must not reach the canvas while one is open, and the
engagement fade is suspended (a takeover never fades). The ▤ charm
goes live against an empty outline scaffold (069 fills it) and ☰
opens a small anchored menu whose Settings entry targets the
settings takeover (074 fills it). Covers EPIC-013 FR-1. Done when: ▤
opens and closes the takeover by charm and by Esc with the camera
byte-identical, a tool shortcut pressed inside a takeover changes
nothing on the board, and the shell e2e suite passes.

### Out of Scope

Outline content (069), settings content (074), the ⌕ panel (073 —
search is panel physics per §8.3, not a takeover), graph ⊛ and
gallery ⊞ (their own epics; charms stay deferred), theming (075).

### Design/Approach

`chrome/takeover.ts` mirrors the panels-store pattern: a module
store with `openTakeover(kind)`, `closeTakeover()`,
`activeTakeover()`, `onTakeoverChanged(cb)`; kinds are a string
union that grows per view ('outline' | 'settings' now). Rail charms
with a live kind render enabled and show pressed/active state while
theirs is open; clicking the active charm closes it (return via the
originating control). TakeoverLayer.svelte mounts in
CanvasHost.svelte as a sibling ABOVE ChromeLayer (higher z-index),
renders the active view full-window, and owns a window keydown
capture listener while open: Escape closes, all other shortcuts are
kept from the board's handlers — guard at the shell's shortcut
seams (dock tool keys, delete/select-all, nav keys) with a
`takeoverActive()` check rather than fighting listener order.
Engagement: while a takeover is open the chrome layer holds visible
(wake + suspend the idle clock; resume on close). The camera is
untouched by construction — the takeover is DOM over the canvas —
and the e2e asserts it. ☰ menu is a small anchored popover (same
grammar as the Board menu) with a Settings entry; End session and
export join it in later epics.

### Files to Touch

`apps/desktop/src/renderer/chrome/takeover.ts`: new — the store.
`apps/desktop/src/renderer/chrome/TakeoverLayer.svelte`: new — the
full-window host + Esc handling.
`apps/desktop/src/renderer/chrome/CharmRail.svelte`: ▤ ☰ go live
with active state; ⧉ ⊛ ⊞ stay deferred; ⌕ stays deferred until 073.
`apps/desktop/src/renderer/chrome/MenuPopover.svelte`: new — ☰
anchored menu (Settings entry).
`apps/desktop/src/renderer/chrome/engagement.ts`: suspend/resume
seam for takeovers.
`apps/desktop/src/renderer/CanvasHost.svelte`: mount TakeoverLayer.
`apps/desktop/src/renderer/chrome/navigation.ts`, `Dock.svelte` (or
wherever tool/nav shortcuts dispatch): takeoverActive() guards.
`apps/desktop/e2e/shell.spec.ts`: takeover open/close/camera/
shortcut-scoping coverage.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and
**think**. Have you validated all aspects are **implemented** and
**tested**?
</CRITICAL_RULE>

- [ ] takeover.ts store: one active takeover, open/close/subscribe;
      opening a second kind replaces the first.
- [ ] TakeoverLayer above ChromeLayer; Escape closes; scrim/sheet
      chrome with a testid per kind (`takeover-outline`,
      `takeover-settings`).
- [ ] CharmRail: ▤ live with aria-pressed while open, click toggles;
      ☰ live opening MenuPopover with a Settings entry that opens
      the settings takeover scaffold.
- [ ] Board shortcut seams guarded: tool keys, Delete/select-all,
      Mod+[/] and Mod+1–9 do nothing while a takeover is open.
- [ ] Engagement suspended while a takeover is open; chrome never
      fades under it; resumes on close.
- [ ] e2e: open ▤ by charm, close by Esc; reopen, close by charm;
      camera (x, y, zoom) identical before/after; pressing V/Delete
      inside the takeover leaves tool mode and board content
      unchanged.
- [ ] `pnpm -r build`, lint, and the full desktop e2e suite green.

### Acceptance Criteria

**Scenario:** A user enters and leaves the outline takeover.
**GIVEN** a board with one selected placement and camera at a
non-default position.
**WHEN** the user clicks the ▤ charm.
**THEN** the outline takeover covers the window, the ▤ charm shows
active, and the chrome does not fade while it is open.
**WHEN** the user presses V and then Delete.
**THEN** the board's tool mode and the placement are unchanged.
**WHEN** the user presses Escape.
**THEN** the takeover closes and the camera is exactly as it was.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->
