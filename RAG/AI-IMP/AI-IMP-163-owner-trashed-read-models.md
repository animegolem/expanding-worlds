---
node_id: AI-IMP-163
tags:
  - IMP-LIST
  - Implementation
  - persistence
  - lifecycle
kanban_status: planned
depends_on:
parent_epic:
confidence_score: 0.75
date_created: 2026-07-07
date_completed:
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

- [ ] Shared predicate defined once; all eight sites use it.
- [ ] Per-site regression vitest (TrashNode → hidden; restore →
      visible).
- [ ] getCanvasScene behavior unchanged (its test still green).
- [ ] Gates: `pnpm -r build`, `pnpm -r test`, `pnpm lint`, desktop
      e2e hidden.
- [ ] HUMAN-TESTING entry appended at merge by the lead.

### Acceptance Criteria

**GIVEN** a node with an owned board holding placements and tags
**WHEN** the node is trashed
**THEN** search, tag locations, note uses, gallery, outline counts,
and canvas contents all stop surfacing that board's content, and
restore brings every projection back.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->
