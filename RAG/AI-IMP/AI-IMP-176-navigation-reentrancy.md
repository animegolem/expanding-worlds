---
node_id: AI-IMP-176
tags:
  - IMP-LIST
  - Implementation
  - navigation
  - reentrancy
  - bug
kanban_status: planned
depends_on: []
parent_epic:
confidence_score: 0.85
date_created: 2026-07-08
---


# AI-IMP-176-navigation-reentrancy

## Summary of Issue #1

Severity **P1** (M-01, lead-verified) + **P2** (M-08, mechanism
lead-confirmed, repro unrun) from the AI-IMP-173 stability audit
(FAMILY 3, navigation re-entrancy). Navigation has no serialization
and no `event.repeat` filtering, so overlapping calls race across the
`getCanvasScene`/`targetAlive` IPC awaits and produce two durable/
session-corrupting failures:

1. **Wrong board's camera durably persisted (M-01, P1).** `openCanvas(A)`
   sets the shared `canvasId=A` synchronously then awaits
   `getCanvasScene(A)`; a second `navigateTo(B)` before it resolves
   sets `canvasId=B` and awaits B's scene. Whichever continuation
   resumes LAST runs `controller.camera.set(scene.camera)` with no
   `canvasId===currentCanvasId` guard — items render for B but the
   camera lands on A's viewport, and ~500ms later the debounced
   `SetCanvasCamera` persist writes those coordinates against the LIVE
   `canvasId` in the DB, silently overwriting B's saved camera with
   A's. Reopening B shows the wrong viewport permanently. Same gap in
   `openEntry`/`jumpToBookmark`, which set the viewport after awaiting
   `openCanvas`. Cites: `apps/desktop/src/renderer/canvas/host.ts:1788-1814`
   (openCanvas), `:831-844` (persistCameraNow), `:913-922`;
   `apps/desktop/src/renderer/chrome/navigation.ts:56-63` (openEntry
   camera.set), `:67-124` (navigateTo/back/forward/goToIndex).
   Trigger: double-click two crumbs / a frame-dive charm twice /
   Back-then-Forward within ~500ms.

2. **Home entry spliced away (M-08, P2).** `back`/`forward`/`goToIndex`
   splice against the LIVE module `cursor` re-read at splice time; a
   held Mod+[ (OS key-repeat, `event.repeat` never checked) fires two
   `back()` calls that interleave across the `targetAlive` IPC, and the
   dead-candidate branch splices `entries[0]` (Root/Home) — an entry it
   never validated and which is alive. `home()` then no-ops for the rest
   of the session. Cites: `navigation.ts:78-92` (back), `:94-107`
   (forward), `:109-124` (goToIndex), `:127-132` (home trusts
   entries[0]), `:159-194` (three listeners, no in-flight guard);
   `apps/desktop/src/renderer/keys/registry.ts:105-121` (`matches`
   never checks `event.repeat`).

Done means: navigation is serialized so no two navigations' post-await
writes interleave; every post-await camera write is guarded by a live
staleness check; and held-key repeat cannot spam back/forward. Root is
shared with M-01 — one serialization fix covers both.

### Out of Scope

- The other async-open races (M-17..M-20/M-25) — AI-IMP-184.
- The stale-background/read-model refresh gap (M-02) — AI-IMP-177,
  though it rides the same "openCanvas fires no project-changed
  event" observation; do NOT fix background here.
- Same-board bookmark history (M-27) — needs a design ruling; not here.
- Crumb label refresh on rename (M-36) — separate polish.

### Design/Approach

Three coordinated changes, all copying an existing in-repo pattern:

1. **Serialize navigation** behind one in-flight promise. The house
   choice is drop-while-flying (a second nav request while one is in
   flight either supersedes or is dropped — pick supersede: latest
   intent wins, matching how the user's last click should win). Guard
   `navigateTo`/`back`/`forward`/`goToIndex`/`openEntry` so their
   post-await bodies run only if still the current navigation. The
   command gateway's `#tail` chain is the serialization precedent in
   the app.

2. **Staleness guard on every post-await camera write.** The house
   pattern is `refresh()`'s `forCanvas` check at `host.ts:1584-1594`
   — capture the target `canvasId` before the await, and before
   `controller.camera.set(...)` (in `openCanvas`, `openEntry`, and
   `jumpToBookmark`) bail if the live `canvasId` no longer equals it.
   The debounced persist already writes against the live `canvasId`;
   with the write guarded, it can only ever persist the board that is
   actually on screen. `setBackgroundFromFile` (`host.ts:365-432`)
   already does exactly this `handle.canvasId===canvasId` check —
   mirror it.

3. **Filter `event.repeat`** for back/forward in the key registry
   (`registry.ts` `matches`), so OS key-repeat can't fire a second
   in-flight `back()`. Pin the splice candidate's index at check time
   rather than re-reading the live `cursor` at splice time, so even a
   surviving race can't delete an unvalidated entry.

### Files to Touch

`apps/desktop/src/renderer/chrome/navigation.ts`: in-flight guard
around navigateTo/back/forward/goToIndex/openEntry; pin splice index;
staleness guard on openEntry camera.set.
`apps/desktop/src/renderer/canvas/host.ts`: forCanvas-style guard on
openCanvas's `controller.camera.set` (mirror `:1584-1594`/`:365-432`).
`apps/desktop/src/renderer/chrome/bookmarks.ts`: guard jumpToBookmark's
post-await viewport write.
`apps/desktop/src/renderer/keys/registry.ts`: `event.repeat` filter in
`matches` (or at the back/forward binding).
`apps/desktop/tests/e2e/navigation.spec.ts` (or nearest): new race e2e.
LOC: ~70–110.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [ ] One in-flight navigation promise; a superseding nav abandons the
      prior navigation's post-await writes.
- [ ] `openCanvas`'s `controller.camera.set` guarded by a live
      `canvasId` check (mirror `host.ts:1584-1594` / `:365-432`).
- [ ] `openEntry` and `jumpToBookmark` viewport writes guarded the
      same way.
- [ ] `event.repeat` filtered for back/forward; splice candidate index
      pinned at validation time, not re-read live.
- [ ] E2e: crumb double-click within ~500ms lands the correct board's
      camera and persists it (reopen B → B's viewport, not A's). Use
      `whenSceneApplied()`/`waitForItems`, never a synchronous
      camera read after navigateTo (AI-IMP-113).
- [ ] E2e: held/repeated back spam leaves the Home button working and
      entries[0] intact.
- [ ] Gates: `pnpm -r build && pnpm -r test && pnpm lint` + hidden
      e2e (`EW_TEST_HIDDEN_WINDOWS=1`).
- [ ] Append an `RAG/HUMAN-TESTING.md` entry: rapidly double-click
      crumbs and hold Mod+[ / Mod+]; confirm the camera never lands on
      the wrong board and Home always returns.

### Acceptance Criteria

**Scenario: racing two navigations does not corrupt a saved camera.**
**GIVEN** boards A and B with distinct saved viewports
**WHEN** the user triggers navigation to A and then to B within ~500ms
**THEN** board B renders with B's viewport
**AND** after the debounce fires and B is reopened later, B still shows
B's viewport (A's coordinates were never persisted onto B).

**Scenario: key-repeat back never deletes Home.**
**GIVEN** a history with a trashed middle entry and Home at index 0
**WHEN** the user holds Mod+[ so the OS repeats the key
**THEN** at most one back navigation runs per physical press
**AND** entries[0] (Home) is never spliced
**AND** the Home button still navigates for the rest of the session.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->
