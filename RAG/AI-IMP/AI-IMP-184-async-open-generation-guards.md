---
node_id: AI-IMP-184
tags:
  - IMP-LIST
  - Implementation
  - async
  - staleness
  - popover
  - bug
kanban_status: planned
depends_on: []
parent_epic:
confidence_score: 0.8
date_created: 2026-07-08
---


# AI-IMP-184-async-open-generation-guards

## Summary of Issue #1

Family (one ticket) — AI-IMP-173 audit FAMILY 2 (async-open generation
guard). Members: **M-17, M-18, M-19, M-20, M-25** (all P2/P3) + the
Codex seed frame-menu race. Root: a surface captures/checks its target
state BEFORE an await, then acts on it AFTER a LATER await with no
re-check, so a newer open (or a navigation) that resolves in between is
clobbered or the wrong surface is opened/closed. The house pattern for
every one of these already exists in the same files — the fix is to
apply it uniformly, covering the PRE-render window.

Concrete failures:
- **openBoardNote opens a different board's note** if the user
  navigates away during its two awaits (`ContextMenu.ts:600-611` — two
  sequential awaits, no live-`canvasId` recapture; `panels.ts:276-281`
  `openCornerPanel` tethers unconditionally). [M-17]
- **openTagsFor** doesn't stick a close/switch if a rebuild from the
  previous open is still in flight — its guard exists BETWEEN the two
  awaits but never AFTER `rebuildChips`, so a resolved stale rebuild
  reopens the popover the user closed / clobbers the new one's DOM and
  steals focus (`charms-ui.ts:589-614`). [M-18]
- **onImagePicked** unconditionally `closeAppearance()`s after a slow
  import, force-closing a DIFFERENT node's appearance popover the user
  opened meanwhile (`charms-ui.ts:301-323`, unconditional close at
  `:322`, `:214-217`). [M-19]
- **revealNote** (multi-location "Fly here" chooser) has no staleness
  guard; an older `getNoteUses` resolving after a newer one hijacks the
  chooser mid-interaction (`panels.ts:633-665`). [M-20]
- **openFrameMenu** can paint AFTER a click-away because its generation
  token (`openGen`) bumps only in `close()`, which never runs when no
  menu exists yet (`ContextMenu.ts:829,852,104,423`). [M-25 / Codex seed]

Done means: every await-then-render open path invalidates a stale
render/close across the PRE-render window; a navigation or a newer open
during any await can never open, clobber, or close the wrong surface.

### Out of Scope

- The Escape / global-key routing family (M-09..M-13/M-24/M-28..M-30) —
  AI-IMP-183.
- Navigation serialization + camera race (M-01/M-08) — AI-IMP-176.
- Stale read-model refresh triggers (M-02 + chip) — AI-IMP-177.
- The gesture-pipeline hardening family (M-14/M-15/M-16/M-31/M-32).

### Design/Approach

Apply the two established in-repo guard patterns uniformly:

- **Live-`canvasId` recheck** — `charms-ui.ts:657-670` `refreshCorner`
  does `if (host.canvasId !== canvasId) return`; `assignFromField`
  (`charms-ui.ts:408-418`) re-checks before its await. Copy this to
  openBoardNote (M-17: capture the target canvasId before the awaits,
  bail after them if it changed) and to openTagsFor (M-18: re-check the
  guard `chipsFor===placement.id` after EVERY await, including after
  `rebuildChips`, not only between the two awaits).
- **openGeneration token** — `openNotePanel` (`panels.ts:236-261`) uses
  an `openGeneration` counter (AI-IMP-085). Copy it to revealNote (M-20:
  bump a generation on entry, ignore a resolution whose generation is
  stale). For openFrameMenu (M-25): bump the generation token BEFORE the
  await (or check for an intervening pointerdown between token and
  render), not only in `close()` — so a click-away during the pre-render
  window invalidates the paint.
- **Scoped close** — onImagePicked (M-19): guard the trailing
  `closeAppearance()` with `if (appearanceFor === placement.id)` so it
  only closes the popover it opened, never a different node's live one.

Each surface keeps binding its ORIGINAL ids for the commit (those are
already correct); the fix is purely the staleness re-check before the
render/close side effect.

### Files to Touch

`apps/desktop/src/renderer/menus/ContextMenu.ts`: openBoardNote live-
canvasId recheck (`:600-611`); openFrameMenu bump generation before the
await / detect intervening pointerdown (`:829,852,104,423`).
`apps/desktop/src/renderer/canvas/charms-ui.ts`: openTagsFor re-check
after every await (`:589-614`); onImagePicked scoped `closeAppearance`
guard (`:301-323`).
`apps/desktop/src/renderer/note/panels.ts`: revealNote `openGeneration`
token (`:633-665`), mirroring openNotePanel (`:236-261`).
`apps/desktop/tests/e2e/*` + unit for the guard fns where e2e is
expensive.
LOC: ~90–140.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [ ] openBoardNote captures the target canvasId before its awaits and
      bails if it changed (mirror `refreshCorner` `charms-ui.ts:657`).
- [ ] openTagsFor re-checks `chipsFor===placement.id` after EVERY await,
      including after `rebuildChips`.
- [ ] onImagePicked's trailing close is guarded
      `if (appearanceFor === placement.id)` — closes only its own popover.
- [ ] revealNote uses an `openGeneration` token (mirror openNotePanel /
      AI-IMP-085); a stale resolution is ignored.
- [ ] openFrameMenu bumps its generation BEFORE the await (or detects an
      intervening pointerdown) so a click-away invalidates the pre-render
      paint.
- [ ] Unit tests for the guard functions; e2e where cheap: navigate away
      during openBoardNote's awaits → no foreign-board note tethers;
      open+close a tag popover mid-rebuild → stays closed; import into A
      while B's appearance popover is open → B's stays open.
- [ ] Gates: `pnpm -r build && pnpm -r test && pnpm lint` + hidden
      e2e (`EW_TEST_HIDDEN_WINDOWS=1`).
- [ ] Append an `RAG/HUMAN-TESTING.md` entry: trigger each open path then
      immediately navigate/open a second surface; confirm no popover
      opens, clobbers, or closes on the wrong target.

### Acceptance Criteria

**Scenario: "Note for this board" respects a mid-await navigation.**
**GIVEN** the user picks "Note for this board" on board A
**WHEN** they navigate to board B before its awaits resolve
**THEN** no note panel tethers to A while B is on screen.

**Scenario: a stale rebuild cannot resurrect a closed tag popover.**
**GIVEN** the user opens then closes a placement's tag popover while its
rebuild is in flight
**WHEN** the rebuild resolves
**THEN** the popover stays closed (and does not steal focus).

**Scenario: a slow import cannot close another node's popover.**
**GIVEN** node A's appearance import is running
**WHEN** the user opens node B's appearance popover and A's import then
finishes
**THEN** A's appearance commits AND B's popover stays open.

**Scenario: a click-away invalidates a pending frame menu.**
**GIVEN** openFrameMenu is awaiting its data
**WHEN** the user clicks away before it paints
**THEN** the menu does not appear.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->
