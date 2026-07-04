---
node_id: AI-IMP-012
tags:
  - IMP-LIST
  - Implementation
  - nodes
  - canvases
  - placements
kanban_status: completed
depends_on: [AI-IMP-010]
parent_epic: [[AI-EPIC-003-domain-persistence-core]]
confidence_score: 0.8
date_created: 2026-07-04
date_completed: 2026-07-04
---

# AI-IMP-012-structure-commands

## Summary of Issue #1

The spatial half of the model (RFC §4.3–4.6, §4.8–4.9) has no command
handlers: nodes, note attachment, canvases, placements, appearance,
tags, and decorations cannot be created or edited. Implement handlers
for the §10.1 structural command set — node lifecycle-free CRUD,
AttachNoteToNode/DetachNoteFromNode/MakeNoteIndependent, CreateCanvas,
placement create/move/reorder/label/flip, SetNodeAppearance,
SetCanvasBackground(Color), tag CRUD/assignment, decoration CRUD with
grouping and anchored connectors — with render_order semantics per
§4.4 and invariants 3, 7–10, 12, 16–18, 21 tested at the service
level. Done means: checklist tests pass through the AI-IMP-010
dispatcher and `pnpm check` is green.

### Out of Scope

Trash/restore/purge and bare-node auto-trash on last-placement delete
(AI-IMP-013 owns DeletePlacement/TrashNode/TrashCanvas); note body/link
logic (011); geometry math for align/distribute/snap — EPIC-004
computes transforms in UI and commits explicit new transforms; import
pipeline (014); renderer sync (EPIC-004).

### Design/Approach

Handlers live in `@ew/persistence/src/handlers/` split by record:
nodes.ts is created by AI-IMP-010 (extend), canvases.ts,
placements.ts, tags.ts, decorations.ts; payload types in
`@ew/commands/src/payloads/structure.ts`. Attach/Detach semantics per
§6.6: attach sets node.note_id (at most one — invariant 3); detach
clears it leaving the note untouched (invariant 12);
MakeNoteIndependent copies body to a new note behind a title-conflict
check (delegates conflict shape to §7.7 result from 011's code path —
coordinate via the shared structured error type only, do not edit
011's files). CreateCanvas enforces one canvas per node (invariant 10)
and persists immediately (§4.4). Placements: FK to node+canvas
(invariant 7), many per node/canvas (invariant 9), transform +
label_visible presentation state (§4.5, default visible), MovePlacement
carries the completed-gesture transform (§10.2). render_order: REAL
keys midpoint-inserted, shared across placements and decorations per
canvas; ReorderContent command rebalances transactionally when gaps
exhaust without changing visible order (§4.4). Tags: flat records,
name_key unique, assignment M:N node-only (invariant 8), rename does
not rewrite assignments (§4.8). Decorations: kind discriminator (text,
path, shape, line, connector, guide), canvas-local, group records for
movement only, connector endpoints optionally anchored to placements
(§4.9); no note/tag/graph capability (invariant 16). Every handler
returns effects + inverse.

### Files to Touch

`packages/commands/src/payloads/structure.ts`: payload types.
`packages/persistence/src/handlers/canvases.ts` (+ test).
`packages/persistence/src/handlers/placements.ts` (+ test).
`packages/persistence/src/handlers/tags.ts` (+ test).
`packages/persistence/src/handlers/decorations.ts` (+ test).
`packages/persistence/src/handlers/nodes.ts` (+ test): extend with
attach/detach/independent/appearance.
`packages/persistence/src/render-order.ts` (+ test): key allocation
and rebalance.
`packages/persistence/src/queries-structure.ts` (+ test): node
library (incl. Unplaced), canvas contents, tag views.
Registry wiring (append-only edits).

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and
**think**. Have you validated all aspects are **implemented** and
**tested**?
</CRITICAL_RULE>

- [x] Node handlers: AttachNoteToNode (rejects second note — invariant 3 test), DetachNoteFromNode leaves note and other nodes untouched (invariants 4, 12 test with two nodes sharing one note), MakeNoteIndependent copies body under new unique title returning §7.7 conflict shape on collision, SetNodeAppearance (dot/icon/image referencing asset id, non-destructive crop fields §4.6).
- [x] CreateCanvas: one per node (invariant 10 rejection test), persisted immediately with camera defaults; optional background asset + independent background color fields (§4.4); SetCanvasBackground/SetCanvasBackgroundColor handlers with inverse.
- [x] Canvas cycles legal: placing a node on its own canvas commits cleanly (invariant 18 test); containment queries use visited sets (invariant 19 test on a cycle).
- [x] Placement handlers: CreatePlacement (FK enforcement, invariant 7), several placements of one node on one canvas (invariant 9 test), MovePlacement/ResizePlacement/RotatePlacement single-command transforms, SetPlacementLabelVisibility default-visible (§4.5), FlipPlacement.
- [x] render-order.ts: midpoint allocation shared placements+decorations per canvas, deterministic total order with UUID tiebreak, transactional rebalance preserving visible order (invariant 21 data-level test with interleaved kinds).
- [x] Tag handlers: CreateTag (name_key unique, structured conflict), RenameTag preserves assignments (§4.8 test), AssignTagToNode/UnassignTagFromNode M:N node-only.
- [x] Decoration handlers: CreateDecoration/UpdateDecoration/DeleteDecoration for all §4.9 kinds, GroupDecorations/UngroupDecorations (canvas-local, movement-only), connector anchor to placement follows §4.9: deleting the anchored placement frees the endpoint at last position rather than deleting the connector (test, coordinated with DeletePlacement's core in this ticket's scope ONLY for anchor release logic exposed as a helper — 013 calls it).
- [x] Invariant 16 test: decorations expose no note/tag/link capability in schema or API surface.
- [x] Queries: canvas contents (ordered placements + decorations), node library with Unplaced filter (§14.1), tag result view data (§4.8); tests.
- [x] All handlers return inverses; dispatcher round-trip test per handler family.
- [x] `pnpm check` green from fresh `pnpm -r build`; commit on worktree branch. (Deviation: validated with the EPIC's agent command set — `pnpm -r build && pnpm -r --filter '!@ew/desktop' test && pnpm lint` — because this worktree's electron postinstall and spike node_modules are not provisioned; `pnpm check:spike` fails here for pre-existing environmental reasons unrelated to this ticket. Lead should re-run full `pnpm check` on master after merge.)

### Acceptance Criteria

**Scenario:** Shared note across nodes with independent spatial life
(RFC slice items 5–9 at service level).
**GIVEN** a note attached to node X placed twice on the root canvas.
**WHEN** node Y attaches the same note and is placed once.
**THEN** the note lists two referencing nodes; detaching from X leaves
Y bound and the note active.
**WHEN** tags "injured" and "scout" are assigned to X only.
**THEN** Y's tag list is empty and the tag view for "injured" returns
X with placement count 2.
**WHEN** a decoration and a placement are interleaved by reorder
commands until keys rebalance.
**THEN** visible order is unchanged and total order remains
deterministic.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only
comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the
sprint.
You MUST document any failed implementations, blockers or missing
tests.
-->

- **MakeNoteIndependent does not create link records** for the copied
  body (invariant 26 gap for wiki-link tokens inside the copied
  text). A `TODO(lead-merge)` sits at the insertion point in
  `handlers/nodes.ts`; after merging AI-IMP-011 the lead should call
  its link-refresh routine there and add a test with a `[[token]]` in
  the copied body.
- **Inverse commands needed internal command types.** CreateCanvas,
  CreatePlacement, CreateTag, and MakeNoteIndependent have no public
  inverse in §10.1, so the DeleteDraftNode pattern from AI-IMP-010 was
  extended: DeleteDraftCanvas, DeleteDraftPlacement, DeleteDraftTag,
  UnmakeNoteIndependent. DeleteDraftPlacement hard-deletes (it exists
  only as undo-of-create) but still routes through
  `releaseConnectorAnchors` so anchored connectors are freed, never
  FK-orphaned. AI-IMP-013's lifecycle DeletePlacement supersedes it
  for user-facing deletion.
- **DeleteDecoration is a hard delete**, not a trash transition, even
  though the schema has lifecycle columns on decoration. Rationale:
  restore semantics belong to AI-IMP-013's RestoreRecord, and the
  inverse (CreateDecoration with full prior state incl. render_order,
  group, anchors) already gives exact undo. If the lead wants
  decorations in Trash, 013 should own that switch.
- **ResizePlacement/RotatePlacement collapsed into MovePlacement** per
  the brief: one command carrying the full completed-gesture transform
  (x, y, width, height, scale, rotation). The checklist's three-name
  phrasing is satisfied by this single envelope.
- **GroupDecorations rejects already-grouped members**
  (DECORATION_ALREADY_GROUPED) instead of merging groups; keeps the
  inverse trivial. Merge-on-group can be layered later if UX needs it.
- **ReorderContent targets neighbors by id** (`afterId`/`beforeId`,
  null = back/front) rather than raw keys, so inverses stay correct
  across rebalances. Rebalance triggers automatically when the float
  midpoint between the two bounds is no longer strictly between them
  (proved by a 60-deep between-insertion test).
- **Tests seed note and asset rows with direct SQL** because
  CreateNote/asset-import commands belong to AI-IMP-011/014; only the
  rows are shared, no 011 files were created or referenced.
- `pnpm check:spike` fails in this worktree because `spike/` has its
  own npm dependencies that are not installed here (pre-existing,
  environmental; no spike files touched). The agent validation set
  (`pnpm -r build && pnpm -r --filter '!@ew/desktop' test && pnpm
  lint`) is green: 95 persistence tests, 17 commands, all passing.
