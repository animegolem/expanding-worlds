---
node_id: AI-IMP-054
tags:
  - IMP-LIST
  - Implementation
  - hardening
  - renderer
kanban_status: planned
depends_on:
parent_epic: [[AI-EPIC-012-pre-alpha-hardening]]
confidence_score: 0.8
date_created: 2026-07-05
date_completed:
---

# AI-IMP-054-deterministic-scene-ui-sync

## Summary of Issue #1

Gemini review, endorsed: renderer UI refresh rests on timeout
heuristics — DecorationToolbar re-queries 120 ms after
project-changed events and after its own actions, NotePane
coalesces on a 100 ms timer. The 120 ms snapshot staleness has
produced two real bugs (the size→bold revert race, swallowed clicks
under load). Done when the host exposes a deterministic
scene-applied signal, both components refresh event-driven, and no
`setTimeout(refresh, N)` remains in renderer UI code.

### Out of Scope

Reworking SceneSync internals or the cull scheduler. The ephemeral
gesture pipeline (already deterministic). NotePane's editor-content
sync (already event-driven via syncExternal).

### Design/Approach

Two distinct needs got conflated under one timer. (a) DB-read
refreshes (toolbar's getCanvasContents snapshot, NotePane's
resolution cache): project-changed events are emitted AFTER commit,
so a query issued on the event already sees fresh rows — the timers
were pure superstition; refresh directly in the event handler. (b)
Scene-object-read refreshes (anything reading controller.items()):
these need the host's re-query + SceneSync.apply to have run, so the
host gains `onSceneApplied(cb)` on its handle, notified at the end
of every scene apply; the toolbar's selection-derived state
subscribes there. Toolbar's post-action `run()` refresh keys off its
own await + the project-changed event instead of a timer. The
BoardToolbar (if it shares the pattern) converts identically.

### Files to Touch

`apps/desktop/src/renderer/canvas/host.ts`: onSceneApplied hook.
`apps/desktop/src/renderer/DecorationToolbar.svelte`: event-driven
refresh, timer removed.
`apps/desktop/src/renderer/BoardToolbar.svelte`: same if patterned.
`apps/desktop/src/renderer/NotePane.svelte`: drop the 100 ms timer.
`apps/desktop/e2e/decorations.spec.ts`: drop any waits that only
existed to outlive the timer, if present.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and
**think**. Have you validated all aspects are **implemented** and
**tested**?
</CRITICAL_RULE>

- [ ] handle.onSceneApplied fires after every applied scene
      (initial load included); unsubscribe supported.
- [ ] DecorationToolbar refreshes on project-changed +
      scene-applied; `setTimeout(refresh, 120)` gone; rapid
      size→bold sequences stay correct (existing e2e covers).
- [ ] BoardToolbar audited; converted if it uses the timer pattern.
- [ ] NotePane resolution refresh runs directly on project-changed;
      100 ms timer gone.
- [ ] grep proves no `setTimeout(refresh` remains under
      src/renderer; full gates green locally and on CI.

### Acceptance Criteria

**GIVEN** a selected text decoration
**WHEN** size and bold edits are applied in immediate succession
**THEN** both edits survive (no snapshot revert), with no
time-based waits involved in the refresh path.

**GIVEN** a command committed by any surface
**WHEN** the project-changed event arrives
**THEN** toolbar and note-pane state reflect it after one
deterministic refresh, not a timer.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->
