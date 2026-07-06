---
node_id: AI-IMP-086
tags:
  - IMP-LIST
  - Implementation
  - commands
  - persistence
kanban_status: completed
depends_on:
parent_epic: [[AI-EPIC-010-hands-on-hardening]]
confidence_score: 0.7
date_created: 2026-07-06
date_completed: 2026-07-06
---

# AI-IMP-086-compound-commands

## Summary of Issue #1

Two shipped flows split one user act across two commands, so a
mid-flight failure strands half the act and undo takes two steps:
(1) "create note and attach" (attach picker, node menu, canvas
corner) runs CreateNote then AttachNoteToNode — an attach failure
leaves a loose note reserving its title (Codex review finding,
2026-07-06); (2) place-on-board (AI-IMP-084) runs SetNodeAppearance
then CreatePlacement — undo is two steps. CreatePin (§6.2) is the
in-house precedent for one-transaction user acts, and DeleteContent
(AI-IMP-028) for batch commands. Done = a compound/batch command
shape exists, both flows ride it, undo is one step each, failures
leave no partial state.

### Out of Scope

- New UI. Both surfaces keep their controls; only the command
  wiring changes.
- Generalizing to arbitrary client-composed transactions (§10.2
  keeps commands as the atomic vocabulary — this adds two named
  compounds or one batch envelope, whichever review of DeleteContent
  suggests is cheaper).

### Design/Approach

**Decision: two purpose-built compounds (CreateNoteAndAttach,
PlaceAsCard), CreatePin's shape — not a batch envelope.** Studying
both precedents settled it: DeleteContent is not actually a generic
envelope — it is itself a purpose-built command over homogeneous
items (N placements + N decorations on one canvas, uniform per-item
semantics), which is why its validation and inverse compose cleanly.
The two flows here are heterogeneous cross-entity acts whose value
lies in *entangled* validation (attach-side checks must gate the
note insert; the card flip is conditional on current appearance) and
in precise domain errors (NODE_HAS_NOTE, the §7.7
NOTE_TITLE_CONFLICT shape the pickers' conflict dialogs already
consume) — a generic sub-command list would push that ordering and
error mapping to the client, exactly the arbitrary client-composed
transaction §10.2's out-of-scope note forbids. Purpose-built
compounds also inherit CreatePin's proven inverse idiom: a named
internal inverse (DetachAndTrashNote, UnplaceCard — like
DeleteDraftPin) that captures prior state at execute time, refuses
with UNDO_STALE when the world moved on, trashes a created note
purge-safely (CreateNote↔TrashNote precedent), and returns
`inverse: null` because redo re-issues the compound. Cost: two more
registry entries; benefit: every failure mode is a checks-first
rejection that commits nothing, and the title-reservation leak
disappears by construction.

Registration note: the handlers live inside `registerNodeHandlers`
(CreateNoteAndAttach — it already imports the title and link
helpers) and `registerPinHandlers` (PlaceAsCard — it already imports
`nextRenderOrder` and `releaseConnectorAnchors`), so no
`service.ts`/`index.ts` change was needed — deliberately, since the
open epic-015 PR touches both.

### Files to Touch

`packages/commands/src/payloads/*`, `packages/persistence/src/
handlers/*` (+tests), the three attach call sites, NotePanel
place-on-board, e2e for one-step undo.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and
**think**. Have you validated all aspects are **implemented** and
**tested**?
</CRITICAL_RULE>

- [x] Command shape decided (named compounds vs batch envelope)
      with a one-paragraph rationale in this ticket.
- [x] Create-and-attach flows are one command, one undo, no loose
      note on failure; units + e2e.
- [x] Place-on-board is one command, one undo; units + e2e.
- [x] Full gates.

### Acceptance Criteria

**GIVEN** a node whose attach will fail (trashed concurrently)
**WHEN** the user creates-and-attaches a note
**THEN** the command rejects and NO note record exists.
**GIVEN** a placed card via place-on-board
**WHEN** the user hits undo once
**THEN** both the placement and the appearance flip revert.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->

- **"One Cmd+Z" is proven at the data level, not via a keyboard
  shortcut.** The interactive structural undo stack is EPIC-007's
  (still backlog); no Cmd+Z handler exists on the canvas today. The
  e2e follows the shipped gestures.spec.ts precedent: drive the real
  UI act, assert exactly ONE revision bump (one durable command =
  one future undo step), then execute the compound's single inverse
  command and assert both effects revert together. When EPIC-007
  lands, these compounds are already stack-ready (one committed
  result, one inverse).
- "Restores the node's previous note_id if any": CreateNoteAndAttach
  refuses nodes that already reference a note (invariant 3, same as
  AttachNoteToNode), so the prior note_id is NULL by construction
  and the inverse restores exactly that. Undo *trashes* the created
  note rather than hard-deleting it — deliberate, matching
  CreateNote↔TrashNote and DeleteDraftPin (purge-safe: the note may
  have gained body text or inbound links by undo time; the title
  reservation holds in Trash).
- `kanban_status`/`date_completed` left for the lead on review, and
  `generate-index.sh` was NOT run: RAG/INDEX.md is in the open
  epic-015 PR's diff and this worktree must not touch epic-015
  files.
- AttachNotePicker's conflict dialog paths (Use Existing / Restore)
  still ride plain AttachNoteToNode — correct, those branches attach
  an *existing* note, no creation involved.
