---
node_id: AI-IMP-113
tags:
  - IMP-LIST
  - Implementation
  - canvas
  - navigation
kanban_status: planned
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

- [ ] `whenSceneApplied` + `waitForItems` on the host, typed,
      documented, unsubscribing cleanly (no listener leaks —
      one-shot always detaches, timeout path included).
- [ ] The five known hand-rolled sites migrated; a grep sweep
      confirms no remaining one-shot onSceneApplied wrappers
      outside the primitive.
- [ ] Navigation-heavy e2e (notes links fly-to, tag panel fly-to,
      search jump, bookmarks) green WITHOUT retries — run those
      specs with --retries=0.
- [ ] Full gates.

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
