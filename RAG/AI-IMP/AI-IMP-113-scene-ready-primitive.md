---
node_id: AI-IMP-113
tags:
  - IMP-LIST
  - Implementation
  - canvas
  - navigation
kanban_status: in-progress
depends_on:
parent_epic: [[AI-EPIC-022-fleet-friction]]
confidence_score: 0.75
date_created: 2026-07-06
date_completed:
---

# AI-IMP-113-scene-ready-primitive

## Summary of Issue #1

Navigation and commits apply the scene asynchronously and
`onSceneApplied` (IMP-054) is the only signal, so every consumer
hand-rolls the same "try now / else one-shot onSceneApplied / else
timeout" idiom (Workspace `center()`, `jumpToPlacement`'s
waitForItem, TagPanel fly-to, search centering,
onCenterPlacements). Each copy is a place a future edit reads
`items()` synchronously after `navigateTo` and regresses as a
"flake" (meta-analysis 2026-07-06; IMP-018/023/048/065/073
evidence). Done = one promise-shaped primitive on the host, the
hand-rolled sites migrated, and the rule promoted to CLAUDE.md.

### Out of Scope

- Changing scene-apply scheduling/refresh reentrancy itself.
- Camera-easing waits (§6.9 flights) — different mechanism, only
  in scope where a hand-rolled site already mixes the two.

### Design/Approach

On the canvas host (`apps/desktop/src/renderer/canvas/host.ts`):
`whenSceneApplied(): Promise<void>` resolving on the NEXT apply
(one-shot wrap of onSceneApplied), and
`waitForItems(ids: string[], opts?: {timeoutMs?}): Promise<boolean>`
implementing try-now/subscribe/timeout once (default timeout
matching the strictest existing site, resolve false on timeout —
callers already degrade gracefully). Consider making `navigateTo`
return the scene-ready promise if its callers can adopt it
mechanically; otherwise leave navigateTo alone and compose at call
sites. Migrate the five known sites; grep for other
onSceneApplied one-shot wrappers. Propose the CLAUDE.md line in
the report (lead scribes): never read items()/camera synchronously
after navigateTo or a commit — await the primitive.

### Files to Touch

`apps/desktop/src/renderer/canvas/host.ts`: the primitive.
`apps/desktop/src/renderer/Workspace.svelte`,
`tags/TagPanel.svelte`, search/centering call sites: migration.
Unit/e2e: existing navigation specs must stay green; add a unit
for waitForItems timeout behavior if the host has a unit home.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and
**think**. Have you validated all aspects are **implemented** and
**tested**?
</CRITICAL_RULE>

- [x] `whenSceneApplied` + `waitForItems` on the host, typed,
      documented, unsubscribing cleanly (no listener leaks —
      one-shot always detaches, timeout path included).
- [x] The five known hand-rolled sites migrated; a grep sweep
      confirms no remaining one-shot onSceneApplied wrappers
      outside the primitive.
- [x] Navigation-heavy e2e (notes links fly-to, tag panel fly-to,
      search jump, bookmarks) green WITHOUT retries — run those
      specs with --retries=0.
- [x] Full gates.

### Acceptance Criteria

**GIVEN** a cross-canvas fly-to issued immediately after
navigateTo
**WHEN** the destination scene has not yet applied
**THEN** the read waits on the primitive and centers correctly,
with zero flake across a --retries=0 run of the affected specs.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->

- **The "five sites" collapse to two hand-rolled wrappers.** TagPanel
  fly-to and search centering do NOT hand-roll onSceneApplied — they
  dispatch `requestCenterPlacements` which routes through the single
  Workspace `onCenterPlacements` seam (also used by UsesList and the
  cross-canvas note rows of AI-IMP-065). So the only two sites that
  actually implemented try-now/subscribe/timeout were Workspace
  `onCenterPlacements` (covering TagPanel + search + note rows) and
  `panels.ts` `waitForItem` (jumpToPlacement). Migrating those two
  covers all five listed consumers.
- **navigateTo left unchanged.** It resolves after `openCanvas`
  mounts, but the first scene projection still applies asynchronously
  afterward, and navigateTo has no knowledge of *which* items a caller
  wants — the wait is inherently per-call. Callers already
  `await navigateTo(...)` then `await host.waitForItems(ids)`; folding
  the wait into navigateTo would be a scheduling change with no
  mechanical adoption path, so it composes at the call sites instead.
- **No host unit test added.** The host has no unit home — it
  constructs a full Pixi `Application` (WebGL) in its factory, so
  `waitForItems` cannot be exercised in vitest without extracting it
  into a standalone module, which would fragment the primitive away
  from the closure (`controller.items()`, `sceneAppliedListeners`) it
  reads. Coverage lives in the navigation-heavy e2e suites, which pass
  --retries=0 (26/26). The ticket made the unit conditional ("if the
  host has a unit home") — it does not.
- **Behavior preserved on the timeout path.** `jumpToPlacement`
  ignores the boolean and re-queries `controller.items()` after the
  await, matching the old `waitForItem` which returned the item if it
  had materialized by timeout. `onCenterPlacements` likewise flies to
  whatever placements are present after the wait resolves (true or
  false), preserving the old "fly to whatever's there" degrade.
- **Grep sweep result:** the remaining `onSceneApplied` callers are
  all *persistent* refresh subscriptions, not one-shot waits —
  NotePanels, NotePanel, charms-ui, pin-tool, TagPanel (activeCanvasId
  $effect), TitleStrip, Dock. None hand-roll try-now/timeout.
