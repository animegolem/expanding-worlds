---
node_id: AI-IMP-126
tags:
  - IMP-LIST
  - Implementation
  - frames
  - persistence
  - domain
kanban_status: completed
depends_on:
parent_epic: [[AI-EPIC-017-frames]]
confidence_score: 0.75
date_created: 2026-07-06
date_completed: 2026-07-06
---


# AI-IMP-126-frame-model-and-membership

## Summary of Issue #1

EPIC-017 activated at rev 0.54; nothing is built. This is the
interface-defining ticket: the frame domain model everything else
in the epic builds on. Per §4.9 (rev 0.38 + 0.54): a frame is NOT a
new record kind — it is an ordinary node whose board presence is a
DRAWN REGION; membership is RECORDED (never inferred from
geometry), single-parent (innermost frame owns), edited only by
item drags across the boundary; frames are THE grouping (no group
record ever ships); moving the frame moves its members; the
membership list is what outline/data views will group by. Done
means: 'frame' is a valid appearance kind, membership persists in a
new table under migration 0007 with single-parent enforced
structurally, capture/release commands exist with inverses, cycle
capture is rejected, a frame-tree query serves renderer and future
outline surfaces, and trash/restore of frames and members behaves
per §9.6 aggregates.

### Out of Scope

- All rendering and interaction (AI-IMP-127).
- Arrange/normalize (AI-IMP-128), drop-behavior modal and
  sort-on-drop (AI-IMP-129).
- Outline/data-view SURFACES (no such surface ships yet — the
  query here is their future feed).
- Save-composite-from-frame (rides the EPIC-008 export machinery;
  cut later).

### Design/Approach

Interface decisions (made at cut time — build to these):

- **Appearance**: `AppearanceKind` gains `'frame'`, validated in
  command handlers per the no-CHECK-constraint convention. The
  drawn region's size rides the existing placement geometry exactly
  as card appearances do (no new geometry storage).
- **Migration 0007 — `frame_member`**: columns
  `member_placement_id TEXT PRIMARY KEY`,
  `frame_placement_id TEXT NOT NULL`, `project_id TEXT NOT NULL`,
  FKs to placement rows. The PRIMARY KEY on the member IS the
  single-parent invariant. Same-canvas membership and
  frame-appearance-kind of the capturing placement are validated in
  handlers, not schema.
- **Commands** (both return inverses, both batch-capable):
  `CaptureInFrame { framePlacementId, memberPlacementIds[] }` —
  re-capturing an already-captured member re-parents it (the
  inverse restores the prior parent, so undo is exact);
  `ReleaseFromFrame { memberPlacementIds[] }`. Handler validation:
  same canvas, capturing placement has frame appearance, and NO
  CYCLES — a frame cannot be captured by itself or any of its
  descendants (walk the membership chain).
- **Frame moves carry members at the COMMAND-COMPOSITION layer**:
  no new move command — the renderer (127) issues the existing
  placement-move as one batch (frame + transitive members), one
  undo entry. This ticket ships the transitive-members query that
  makes that batch cheap.
- **Queries**: `getFrameTree(canvasId)` → nested
  frame→members tree (placement ids + node ids + depth), the
  single read model for renderer adornments, outline futures, and
  the move batch. Scene payloads gain per-placement
  `frameParent: placementId | null` if the engine needs it flat —
  keep additive.
- **Lifecycle**: trashing a frame NODE preserves membership rows
  (§9.6 aggregate — restore brings the grouping back); members are
  independent nodes and stay active and rendered (the region
  disappears; they keep their positions). Purging a placement (or
  the frame node) deletes its membership rows. Trashing a MEMBER's
  node excludes it from rendering as today; membership row
  survives for restore.

### Files to Touch

`packages/domain/src/records.ts`: `'frame'` in AppearanceKind.
`packages/persistence/src/migrations/0007-frame-membership.ts`
(+ test): the table.
`packages/persistence/src/handlers/` (structure or new frames
module + test): capture/release commands, validation, inverses;
purge hooks for membership rows.
`packages/persistence/src/queries-structure.ts` (or new
queries-frames.ts + test): getFrameTree, transitive members.
`packages/commands/src/payloads/` (+ registry): payload types +
command constants.
`packages/protocol/src/index.ts`: additive query/scene surface.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [x] `'frame'` appearance kind accepted end-to-end (handler
      validation, no CHECK constraint); unit proves an existing
      switch doesn't silently drop it.
- [x] Migration 0007 applies clean on a v6 db; single-parent PK
      proven by test (second capture re-parents, never duplicates).
- [x] CaptureInFrame/ReleaseFromFrame: inverses exact (undo
      restores prior parent), same-canvas + frame-kind + cycle
      validation each covered by a failing-case unit.
- [x] getFrameTree: nesting renders as a tree (frame in frame),
      transitive member listing for the move batch; unit with a
      3-level nest.
- [x] Lifecycle: frame trash preserves membership + members stay
      active; restore rejoins; purge cleans membership rows; units.
- [x] Gates: `pnpm -r build`, `pnpm -r test`, `pnpm lint`, desktop
      e2e hidden (suite must stay green — no renderer work here).

### Acceptance Criteria

**GIVEN** a node with frame appearance placed on a board and three
item placements captured into it
**WHEN** getFrameTree runs
**THEN** the three members list under the frame placement.
**WHEN** one member is captured into an inner frame that is itself
a member of the outer
**THEN** the tree reads outer → [items, inner → [item]] and the
re-parented member has exactly one parent.
**WHEN** capturing the outer frame into the inner is attempted
**THEN** the command fails with a cycle error.
**WHEN** the frame node is trashed and restored
**THEN** membership is intact afterward and members never left the
board.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->

**Node CHECK dropped, not widened (design decision inside 0007).**
Migration 0007 does TWO things under one number: it creates
`frame_member` AND rebuilds `node` to REMOVE the
`appearance_kind` CHECK entirely (not widen it to include
'frame'). The existing CHECK would have rejected `appearance_kind
= 'frame'` at the SQLite level, so *something* had to change; the
EPIC-022 growing-domain convention plus the checklist's "no CHECK
constraint" wording both point to dropping it. This is the last
node rebuild for an appearance kind — future kinds need no
migration. The rebuild dance mirrors 0006 exactly (disableForeignKeys,
root triggers + ix_node_note recreated).

**0006 test updated (necessary, just outside the strict file
list).** Because 0007 removes the appearance CHECK, two assertions
in `0006-card-appearance.test.ts` — which run `createProject`
(migrates to HEAD) — became false: "still rejects unknown kinds"
(sticker now inserts) and `expect(ran).toEqual([6])` (a schema-5 db
now applies [6, 7]). Updated both to reflect the CHECK's removal.
This is a direct, unavoidable consequence of the schema change, not
scope creep.

**FK cascade over manual purge hooks.** Both `frame_member` FKs are
`ON DELETE CASCADE`. This makes every hard-delete path
(DeletePlacement, DeleteContent, canvas/node purge) drop membership
rows automatically with zero edits to `lifecycle.ts` — the ticket's
"purge cleans membership rows" falls out structurally. Trade-off: a
DeletePlacement of a *member* (an undoable hard delete) drops its
membership row, and its inverse RestorePlacement does NOT restore it
(the row cascaded away). Not covered by acceptance (which scopes
precise undo to Capture/Release inverses and frame-NODE trash/
restore), and DeletePlacement is a different user action than
Capture, so this is an acceptable, documented gap. 127/a later
ticket can teach RestorePlacement to re-capture if the feel calls
for it.

**Scene payload `frameParent` deferred to 127.** The ticket made it
optional ("if that is the cleanest engine feed"). `canvas-engine`
(where the scene item type lives) is outside my file fence, and 127
owns the render feed decision, so I shipped `getFrameTree` +
`getFrameTransitiveMembers` as the read models and left
`getCanvasScene` untouched. Protocol needed no edit — queries/
commands flow through the generic run-query / execute-command verbs.

**Pre-existing e2e flake (NOT a regression).** `apps/desktop`
`trash.spec.ts` › "trash browser: list, restore + fly-to, empty
trash" flakes on a duplicate `data-testid`: after Empty Trash,
`TrashView.svelte` fires a toast with `surface: 'trash-empty'`
(→ `data-testid="trash-empty"`, line 298) that collides with the
empty-state `<p data-testid="trash-empty">` (line 312), so
`getByTestId('trash-empty')` intermittently resolves to 2 elements
(strict-mode violation) depending on toast-dismiss timing. My diff
touches ZERO `apps/desktop` files (`git diff --stat` is packages-
only); the spec passed on a full-suite run and on an isolated run
with my changes reverted to base, and failed on other isolated runs
— pure timing. Fix belongs in `TrashView.svelte` (give the toast a
distinct surface id), which is fenced off from this ticket. Flagged
for the lead. The known source-panel flake was NOT hit.