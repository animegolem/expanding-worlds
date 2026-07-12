---
node_id: AI-IMP-177
tags:
  - IMP-LIST
  - Implementation
  - navigation
  - read-model
  - staleness
  - bug
kanban_status: completed
depends_on: []
parent_epic:
confidence_score: 0.85
date_created: 2026-07-08
date_completed: 2026-07-08
---


# AI-IMP-177-stale-read-models-on-navigation

## Summary of Issue #1

Severity **P1** (M-02, lead-verified) + **P3** (Codex stale-chip,
high-confidence) from the AI-IMP-173 audit. A family of renderer
read-models refresh only on `project.onChanged` (a real command
commit) and NEVER on `openCanvas`/scene-apply or on the settings
broadcast, so they go stale across navigation or a sibling toggle and
then act on the previous board's / previous state's data:

1. **Board-tooling background writes the PREVIOUS board's asset onto
   the current board (M-02, P1, durable).** `attachBoardTooling`
   mounts once and lives across navigations; its cached `background`
   var is refreshed only by `project.onChanged`, but `openCanvas`
   fires no project-changed event. Navigate A→B by ordinary means,
   touch nothing, right-click B: the context menu reads stale board-A
   background, enables "Reset/Edit backdrop", and
   `SetCanvasBackground({canvasId:B, assetId:<board-A asset>})`
   durably writes A's asset onto B. Cites:
   `apps/desktop/src/renderer/canvas/board-tooling.ts:141` (background
   state), `:161-171` (refreshBackground), `:444-459`
   (commitBackgroundEdit), `:474-487` (resetBackgroundTransform),
   `:552` (wired only to `project.onChanged`);
   `apps/desktop/src/renderer/chrome/navigation.ts:58` (openCanvas
   fires no project-changed event);
   `apps/desktop/src/renderer/menus/ContextMenu.ts:794-801`, `:580-582`.

2. **Frame sort chip stale after a Dock/context-menu toggle (Codex
   P3).** The chip reads `frameSortOnDrop` only when the selected frame
   ID changes; toggling the setting from the Dock or context menu while
   the frame stays selected leaves the chip showing the old state. It
   never subscribes to the settings broadcast, though the main process
   already broadcasts setting writes. Cites:
   `apps/desktop/src/renderer/canvas/charms-ui.ts:695` (chip reads
   `frameSortOnDrop` only on newly-selected frame ID), `:977` (no
   settings.onProjectChanged subscription); `apps/desktop/src/main/index.ts:931`
   (broadcasts setting writes). Confirmed by the 138 agent's own report.

Done means: the cached background re-reads (or clears) on canvas-open/
scene-applied so backdrop verbs can never act on a stale board's asset;
and the frame sort chip re-reads its state on the settings broadcast so
it always reflects the current setting. Same root as M-01's serialize
work (openCanvas fires no project-changed event) but a distinct fix —
this is refresh triggers, not serialization.

### Out of Scope

- Navigation serialization / camera race (M-01/M-08) — AI-IMP-176.
- Path-bar crumb label rename-refresh (M-36) — separate polish.
- Any other read-model not in this family; if the sweep finds more,
  note them for the master list, don't expand scope here.
- The frame sort chip's underlying sort behavior — only its displayed
  state is in scope.

### Design/Approach

Two targeted refresh-trigger additions, each copying an established
in-repo subscription:

1. **Background:** subscribe `refreshBackground` (or clear-then-refetch)
   to the scene-applied / openCanvas signal in addition to
   `project.onChanged`. The correct sibling is `setBackgroundFromFile`
   (`board-tooling.ts:365-432`), which already guards on
   `handle.canvasId===canvasId` — the background cache should be
   re-fetched for the live canvas whenever the scene applies. Belt-and-
   braces: the backdrop verbs in ContextMenu should read the background
   for the CURRENT `canvasId` at menu-open time (do not trust a cache
   that predates the navigation).

2. **Frame sort chip:** subscribe the chip refresh to the settings
   broadcast (`main/index.ts:931` already broadcasts). The house
   pattern is `BookmarkMenu.svelte`'s `project.onChanged` live-refresh
   subscription; add the analogous `settings.onProjectChanged` (or the
   renderer's settings-broadcast hook) so the chip re-reads
   `frameSortOnDrop` on every setting write, not only on frame
   reselection.

### Files to Touch

`apps/desktop/src/renderer/canvas/board-tooling.ts`: refresh/clear the
cached background on scene-applied/openCanvas (mirror the `:365-432`
canvasId discipline).
`apps/desktop/src/renderer/menus/ContextMenu.ts`: backdrop verbs read
current-canvas background at open time (defensive).
`apps/desktop/src/renderer/canvas/charms-ui.ts`: subscribe the sort
chip to the settings broadcast; re-read `frameSortOnDrop` on it.
`apps/desktop/tests/e2e/*`: navigation-backdrop e2e + chip-toggle e2e.
LOC: ~50–80.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [x] Cached background re-fetches or clears on scene-applied/openCanvas
      (mirror `board-tooling.ts:365-432` canvasId discipline).
- [x] Backdrop verbs in ContextMenu read the CURRENT canvas's
      background at menu-open; Reset/Edit backdrop can never carry a
      prior board's assetId.
- [x] Frame sort chip subscribes to the settings broadcast and
      re-reads `frameSortOnDrop` on write (house pattern:
      `BookmarkMenu.svelte` `project.onChanged`).
- [x] E2e: board A has a backdrop, board B has none; navigate A→B,
      right-click B → menu shows NO backdrop-reset/edit verbs (or
      they act on B's empty background, never A's asset).
- [x] E2e: toggle sort-on-drop from the Dock while a frame is
      selected → the visible chip updates without reselecting.
- [x] Gates: `pnpm -r build && pnpm -r test && pnpm lint` + hidden
      e2e (`EW_TEST_HIDDEN_WINDOWS=1`).
- [ ] Append an `RAG/HUMAN-TESTING.md` entry: navigate off a board with
      a backdrop onto an empty one and try Reset backdrop; toggle the
      frame sort setting with a frame selected and watch the chip.

### Acceptance Criteria

**Scenario: backdrop verbs never carry a stale board's asset.**
**GIVEN** board A has a background asset and board B has none
**WHEN** the user navigates A→B (touching nothing) and right-clicks B
**THEN** the context menu does not offer to reset/edit a backdrop using
A's asset
**AND** no `SetCanvasBackground` can write A's assetId onto B.

**Scenario: the frame sort chip tracks the live setting.**
**GIVEN** a frame is selected and its sort chip is visible
**WHEN** the sort-on-drop setting is toggled from the Dock or context
menu without reselecting the frame
**THEN** the chip updates to the new state immediately.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->

**Background refresh seam.** Subscribed `refreshBackground` to
`handle.onSceneApplied` alongside the existing `project.onChanged`
subscription. `onSceneApplied` fires on EVERY host `refresh()` — both a
command refresh and an openCanvas board swap — and `handle.canvasId` is
a live getter, so the cache re-fetches for whatever board the user now
stands on. This is the least-surprising seam: it reuses the AI-IMP-113
scene-ready primitive the whole renderer already leans on, rather than
threading a new openCanvas callback. `refreshBackground` also gained the
host's `forCanvas` guard (capture the id before the async query, drop the
result if a swap landed underneath) so a slow query can't overwrite the
live cache with a stale board's background.

**Belt-and-braces without touching ContextMenu.** The brief forbids editing
`ContextMenu.ts` (a parallel agent's fence) beyond reading it. Rather
than a defensive read inside the menu, the guard lives one layer down:
`board-tooling` now tracks `backgroundCanvasId` (the board the cache was
fetched for) and a `liveBackground()` helper returns the cache ONLY when
it matches `handle.canvasId`. The `background()` getter and every
mutating backdrop verb (`enterBackgroundEdit`, `resetBackgroundTransform`,
`commitBackgroundEdit`) read through it, so a cache that predates a
navigation reads as empty and no verb can carry a prior board's assetId —
the same guarantee the ticket's defensive-read step asked for, achieved
without crossing the ContextMenu fence. ContextMenu's existing
`tooling.background()` call at menu-open now transparently gets the
guarded value.

**Frame sort chip.** Added a `window.ew.settings.onProjectChanged`
subscription in `charms-ui` (pushed onto `disposers`) that re-reads the
chip when the changed key matches the currently-selected frame's
`frame_sort_on_drop:<id>` key (`value !== false` ⇒ ON, mirroring
`board-tooling.frameSortOnDrop`). Change kept surgical — no bar refactor —
to avoid conflicting with the parallel charms/menus async-open work. The
main process already broadcasts every `set-setting` to ALL windows
(including the originator, `main/index.ts`), so a Dock/context-menu
toggle in the same window reaches the chip.

**Validation.** `pnpm -r build` ✓, `pnpm -r test` ✓ (210 e2e passed
under `EW_TEST_HIDDEN_WINDOWS=1`, including the two new
`stale-read-models.spec.ts` cases), `pnpm lint` ✓ (clean). The
`stale-read-models` e2e drives the true bug paths: navigate a
backdrop-bearing board onto an empty one via `__ewNav.navigateTo`
(openCanvas — fires no onChanged) and assert the board menu's backdrop
verbs go disabled with the Set label reverting to "Set backdrop
image…"; and toggle sort-on-drop from the Dock while the frame stays
selected and assert the charm chip flips live in both directions.

**Note for the lead.** The `RAG/HUMAN-TESTING.md` append (checklist
item 7) was intentionally left undone per the brief's do-not-touch
list; the lead owns that entry.
