---
node_id: AI-IMP-163
tags:
  - IMP-LIST
  - Implementation
  - persistence
  - lifecycle
kanban_status: completed
depends_on:
parent_epic:
confidence_score: 0.75
date_created: 2026-07-07
date_completed: 2026-07-07
---


# AI-IMP-163-owner-trashed-read-models

## Summary of Issue #1

Codex review round 2, P2, VERIFIED: §9.6 trashing a node flips the
NODE ROW ALONE (one preserved aggregate) — its owned canvas row
stays `active`. `getCanvasScene` carries the load-bearing owner
join (queries-structure.ts ~229), but every other read model
filters only `canvas.lifecycle_state = 'active'`, so owner-trashed
boards' content leaks into: getCanvasContents (~160), library
placement counts (~349), tag locations (~431), node locations
(~528), gallery unplaced logic (queries-gallery.ts ~90), note uses
(queries-notes.ts ~232), note metadata (note-metadata-db.ts ~97),
and search hits (queries-search.ts ~119). Users see placements,
search targets, tag locations, and counts pointing into boards the
scene renderer refuses to open. Done means one shared
active-canvas predicate applied at every site, each with a
regression test seeded through TrashNode (never direct UPDATE).

### Out of Scope

- Changing §9.6 aggregate semantics (the node-row-alone model is
  ratified; this is read-model consistency, not lifecycle change).
- getCanvasScene (already correct — it is the reference behavior).

### Design/Approach

Define ONE SQL fragment/helper in queries-structure (or a shared
module) expressing "canvas usable": `c.lifecycle_state = 'active'
AND owner.lifecycle_state = 'active'` via the canvas→node join, and
thread it through each listed site. Prefer the JOIN form over
correlated subqueries where the query already joins node. Each site
gains a vitest: create node+canvas+content via commands, TrashNode
the owner, assert the projection no longer surfaces the content,
RestoreRecord brings it back. Watch the two "locations" queries —
their semantics (§7.4 uses list) should list an owner-trashed
location as ABSENT, matching what activation could actually reach.

### Files to Touch

`packages/persistence/src/queries-structure.ts`,
`queries-gallery.ts`, `queries-notes.ts`, `note-metadata-db.ts`,
`queries-search.ts` (+ their test files).

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [x] Shared predicate defined once; all eight sites use it.
- [x] Per-site regression vitest (TrashNode → hidden; restore →
      visible).
- [x] getCanvasScene behavior unchanged (its test still green).
- [x] Gates: `pnpm -r build`, `pnpm -r test`, `pnpm lint`, desktop
      e2e hidden.
- [x] HUMAN-TESTING entry appended at merge by the lead.

### Acceptance Criteria

**GIVEN** a node with an owned board holding placements and tags
**WHEN** the node is trashed
**THEN** search, tag locations, note uses, gallery, outline counts,
and canvas contents all stop surfacing that board's content, and
restore brings every projection back.

### Issues Encountered

Lead addendum at merge: the agent's two judgment calls both ruled
correct — outline counts joined the sweep (same pattern/class), and
its flagged ADJACENT leak (search canvasText hits) was closed in the
merge window with a mirrored regression test rather than deferred:
one line, exactly the class the finding named. Gates: 181/181.

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->

**Shared predicate.** `usableCanvasOwnerJoin(canvasAlias, ownerAlias)`
in `queries-structure.ts` (exported), emitting the owner-node JOIN
that re-checks `owner.lifecycle_state = 'active'`; callers keep their
own `<canvas>.lifecycle_state = 'active'` filter. It mirrors
`getCanvasScene`'s load-bearing owner join. JOIN vs subquery per site:

- **getCanvasContents** — JOIN on the canvas guard (was a bare
  `SELECT lifecycle_state`; now `SELECT c.id … JOIN node owner …`;
  `!canvas` ⇒ `[]`, same three-way collapse as before).
- **listNodeLibrary count** — JOIN inside the correlated count
  subquery (owner alias `co`).
- **getTagView** — locations query CONVERTED its existing
  `LEFT JOIN node cn` to the helper's inner join (owner-trashed rows
  now drop); count subquery got the JOIN (alias `co`).
- **getNodeLocations** — CONVERTED its `LEFT JOIN node cn` to the
  helper's inner join.
- **gallery `ACTIVE_PLACEMENT_EXISTS`** — JOIN added (alias `pco`);
  drives the unplaced facet.
- **getNoteUses** — CONVERTED its `LEFT JOIN node owner` to the
  helper's inner join (§7.4 owner-trashed location now ABSENT).
- **note-metadata** — CONVERTED `computeNoteMetadata`'s
  `LEFT JOIN node owner`; ALSO threaded the predicate through
  `boardDepths`' parent-board edge (alias `pco`) so containment
  depths stay honest, not just the displayed placement rows.
- **search `usingCanvases`** — CONVERTED its `LEFT JOIN node cn` to
  the helper's inner join.

**No existing expectation had to be overturned.** All 517 prior
persistence tests, 368 canvas-engine, 263 desktop-unit, and 180
desktop e2e stayed green unchanged — the leak had no test asserting
the (wrong) old behavior, so this is pure addition (9 new regression
tests, one per site + one for outline counts; persistence 517 → 526).

**Scope note — outline counts.** The acceptance criteria names
"outline counts" but the summary's eight-site enumeration does not
list `getOutlineTree`. Its two placement-count subqueries share the
identical count pattern, so I threaded the same predicate through them
(aliases `pco`) and added a regression test. `getOutlineTree`'s
structural canvas rows already filter owner-trashed boards via their
existing `JOIN node n … n.lifecycle_state = 'active'`, so only the
cross-board counts leaked.

**Adjacent leak left OUT of scope (flagged for the lead).**
`searchProject`'s `canvasText` hits (`queries-search.ts` ~140) join
only `canvas c … c.lifecycle_state = 'active'`, so a text decoration
on an owner-trashed board still surfaces as a search hit that
navigates to a scene the renderer refuses — the SAME §9.6 class as the
`usingCanvases` bug this ticket fixed. The VERIFIED Codex finding
enumerated only `usingCanvases` (~119), so I did NOT expand into it;
one line (`${usableCanvasOwnerJoin('c','cto')}` after the canvas join)
would close it in a follow-up if the lead wants it. `quickOpen`
(~185) already checks the owning node, so it does not leak.

**Test harness deltas.** `queries-gallery`, `note-metadata-db`, and
`queries-search` test `beforeEach` now also register
`registerLifecycleHandlers`; `queries-notes` additionally registers
node/canvas/placement/lifecycle handlers (it previously registered
note handlers only). This is additive — no existing test changed
behavior. All seeding for the new tests routes through real commands
(`CreateNode`/`CreateCanvas`/`CreatePlacement`/`TrashNode`/
`RestoreRecord`); no direct lifecycle UPDATE.
