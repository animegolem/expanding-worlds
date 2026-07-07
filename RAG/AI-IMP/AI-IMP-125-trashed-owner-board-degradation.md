---
node_id: AI-IMP-125
tags:
  - IMP-LIST
  - Implementation
  - trash
  - navigation
  - bookmarks
kanban_status: planned
depends_on:
parent_epic:
confidence_score: 0.75
date_created: 2026-07-06
date_completed:
---


# AI-IMP-125-trashed-owner-board-degradation

## Summary of Issue #1

Confirmed Codex finding (2026-07-06 review, round 2), verified
against §9.6 and §8.1. `TrashNode` correctly flips only the node row
(§9.6: the owned canvas stays as a preserved-aggregate row), but the
read models treat "canvas row active" as "board reachable":
`getCanvasScene` checks only `c.lifecycle_state = 'active'`
(`queries-structure.ts`), so navigation's `targetAlive` opens a board
whose OWNER NODE is in Trash; `listBookmarks` computes `targetState`
from the canvas row alone, so such a bookmark presents active and
opens instead of presenting the §8.1 In Trash state; and the
BookmarkMenu restore path always restores `{kind: 'canvas'}`, which
cannot revive a trashed owner node. §9.6 excludes a trashed node's
placements from ordinary rendering — its owned board must degrade
the same way. Done means: a board whose owner node is trashed is not
ordinarily openable; bookmarks/history to it degrade per §8.1
(In Trash + Restore); and that Restore restores the NODE (the
aggregate root), which revalidates the bookmark.

### Out of Scope

- Purge semantics (already correct: purging the node purges the
  aggregate; missing canvas row = broken bookmark).
- Trash-browser presentation (the node row already lists there with
  impact context; no change).
- History-stack UI beyond the existing skip/collapse behavior.

### Design/Approach

Extend the lifecycle predicate at the read-model layer, not the
handlers: `getCanvasScene` (and `getCanvasByNode` if it feeds
navigation) joins the owning node and requires it active when
`node_id` is non-null (the root canvas has no owner and is
protected anyway). `listBookmarks` computes `targetState` as
trashed when EITHER the canvas row or its owning node row is
trashed, purged when the canvas row is gone. The BookmarkMenu
restore action inspects which record is trashed and issues
RestoreRecord for the node when the owner is the trashed one
(falling back to canvas restore for directly-trashed boards).
Navigation `targetAlive` needs no change if `getCanvasScene`
refuses — verify the refusal path degrades to the existing toast,
not a throw. Persistence units cover the new predicate both ways;
an e2e drives: trash a node with an owned board from another
board's bookmark → In Trash state → Restore → opens.

### Files to Touch

`packages/persistence/src/queries-structure.ts`: owner-node
lifecycle join in `getCanvasScene` + `listBookmarks` targetState.
`packages/persistence/src/queries-structure.test.ts` (or test home):
units.
`apps/desktop/src/renderer/chrome/BookmarkMenu.svelte`: restore the
trashed owner node when applicable.
`apps/desktop/src/renderer/chrome/navigation.ts`: verify/adjust the
dead-target degradation path.
`apps/desktop/e2e/` (bookmarks or trash spec): the loop above.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [ ] `getCanvasScene` refuses boards whose owner node is trashed;
      root canvas unaffected; unit both ways.
- [ ] `listBookmarks` targetState reflects owner-node trash; unit.
- [ ] BookmarkMenu In Trash state restores the correct record kind
      (node vs canvas); revalidated bookmark opens.
- [ ] Navigation to a trashed-owner board degrades explicitly
      (§8.1 skip/toast), never opens, never throws.
- [ ] E2E: bookmark → trash owner node → In Trash presentation →
      Restore → opens.
- [ ] Gates: `pnpm -r build`, `pnpm -r test`, `pnpm lint`, desktop
      e2e hidden.

### Acceptance Criteria

**GIVEN** a bookmark to a board whose owner node is moved to Trash
**WHEN** the bookmark menu opens
**THEN** the row presents the In Trash state with Restore instead of
opening (§8.1)
**AND WHEN** Restore is chosen
**THEN** the NODE aggregate restores (§9.6) and the bookmark opens
the board again.
**GIVEN** Back/Forward history entries targeting that board while the
owner is trashed
**THEN** navigation skips or degrades explicitly, never silently
opening the board.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->
