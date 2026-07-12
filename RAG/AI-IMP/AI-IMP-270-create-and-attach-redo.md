---
node_id: AI-IMP-270
tags:
  - IMP-LIST
  - Implementation
  - persistence
  - undo
kanban_status: planned
depends_on: []
parent_epic:
confidence_score: 0.6
date_created: 2026-07-10
date_completed:
---


# AI-IMP-270-create-and-attach-redo

## Summary of Issue #1

Convicted during AI-IMP-267's pre-implementation review (Codex,
2026-07-10, citations in .codex round docs): **undo of
CreateNoteAndAttach cannot be redone.** The command's inverse is
DetachAndTrashNote, whose own inverse is explicitly `null`
(handlers/nodes.ts:255-301 — the code comment admits "not
redoable as one step"), so the undo stack falls back to REPLAYING
the original CreateNoteAndAttach — which collides with the
trashed, title-reserving row it just created (`requireTitleFree`
+ same-id INSERT → NOTE_TITLE_CONFLICT or id collision). This is
inherited AI-IMP-086-era rot affecting EVERY CreateNoteAndAttach
surface (the creation palette, corner-charm create, and now
caption promotion), not a 267 defect — 267 ships honest redo
REFUSAL; this ticket makes redo work. Done means: undo-then-redo
of a create-and-attach (alone or inside a group) faithfully
restores-and-attaches the SAME note (same id, same title, edits
preserved) and the round trip has regressions.

### Out of Scope

- 267's promotion UX (ships before this with honest refusal).
- Generalizing to other exempt/compound commands beyond the
  CreateNoteAndAttach family — census first, but scope stays this
  inverse chain.

### Design/Approach

Pre-implementation review first (this summary is the hypothesis
chain, verified once already but re-verify against the tree at
build time). Likely shape: give DetachAndTrashNote a REAL inverse
— a `RestoreAndAttachNote` (restore the trashed row + re-attach
to the node, both existing verbs' semantics composed atomically
in ONE handler) — so the stack never falls back to replay.
Resurrection-aware create was considered and REFUSED at the 267
review (risks overwriting pre-undo edits; mutates create
semantics). Domain growth validated in handlers, never schema
CHECK. Matrix entries updated with tested inverses both ways;
regression: undo→redo→undo round trip on every
CreateNoteAndAttach surface, edits-preserved case included.

Pre-implementation verification (2026-07-11): the diagnosis still
matched source. CreateNoteAndAttach returned DetachAndTrashNote, and
DetachAndTrashNote returned a null inverse with the stated non-redoable
comment. One scope correction: `RestoreAndAttachNote` is an internal
redo command and remains exempt from fresh undo capture; its inverse is
consumed by the stack action already in flight.

### Files to Touch

- `packages/persistence/src/handlers/nodes.ts` (the inverse
  chain) + handler tests.
- `packages/commands` payload for the new inverse command.
- `apps/desktop/src/renderer/undo/undo-store.ts` matrix entries +
  policy test.
- e2e: redo round-trip on palette create-and-attach + caption
  promotion.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [x] Review re-verifies the inverse chain against current source;
      corrections recorded here.
- [x] RestoreAndAttachNote (or the review's superseding shape):
      atomic restore + attach, handler-validated, tested inverse
      pointing back at DetachAndTrashNote.
- [x] DetachAndTrashNote returns the real inverse; the
      "not redoable" comment retires.
- [x] Undo→redo→undo round trips on every CreateNoteAndAttach
      surface incl. caption promotion; note edits made before
      undo survive redo.
- [x] Matrix + policy tests updated; full gates green (pipefail).
- [x] CHANGELOG entry.

### Acceptance Criteria

**GIVEN** a note created via any CreateNoteAndAttach surface,
then undone
**WHEN** the user redoes
**THEN** the SAME note (id, title, body — including edits made
before the undo) returns attached to its node
**AND** a further undo detaches-and-trashes it again
**AND** no title conflict or id collision fires anywhere in the
round trip.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->
