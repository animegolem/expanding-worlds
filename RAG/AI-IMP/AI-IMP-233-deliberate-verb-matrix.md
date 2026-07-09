---
node_id: AI-IMP-233
tags:
  - IMP-LIST
  - Implementation
  - undo
  - P2
kanban_status: planned
depends_on: [AI-IMP-230]
parent_epic:
confidence_score: 0.65
date_created: 2026-07-09
---


# AI-IMP-233-deliberate-verb-matrix

## Summary of Issue #1

Sol audit CA-008 (P2, lead-verified against the ruling): the
owner's ratified rule — EVERY deliberate verb joins Mod+Z except
node-trash — is still unimplemented for: AttachNoteToNode,
CreateNoteAndAttach, MakeNoteIndependent, RelinkBrokenLinks,
Group/UngroupDecorations, CreateCanvas, and the keyboard
multi-selection flip/reorder/lock loops (which also emit one
command PER ITEM — N undos for one gesture). Deeper defect:
relink's `create` branch inserts a note + binds links but its
inverse is always BreakNoteLinks — capturing it as-is would
un-link yet leave the created note and its unique-title
reservation as durable residue. Done means a command→undo policy
MATRIX (every durable command: captured / group-only / exempt +
why) lives in the undo module and is enforced by a test that
fails when a new command ships unclassified; the missing verbs
join capture; keyboard batch gestures wrap in explicit groups
(one gesture = one undo); relink-create gets a compound inverse
that also removes the note it created when safe.

### Out of Scope

- Node-trash (the ruling's exception, stays exempt).
- Redo invalidation (230 — build on it; depends_on).
- Gallery verbs (221's table feeds this matrix; merge there).

### Design/Approach

Matrix first: enumerate every registered command type (the
registry is the source of truth), classify per the ruling,
encode as a literal table the coordinator consults; a unit test
diff's the registry against the table so unclassified = red.
Wire the missing captures (inverses exist per 182's audit except
relink). Relink-create inverse: compound of BreakNoteLinks +
TrashNote/DeleteNote for the note it created — ONLY when the note
is still untouched (no body edits since create; else leave the
note, break links, document). Keyboard loops: wrap in
runAsUndoGroup (231's token form). E2e: each newly-captured verb
round-trips under Mod+Z; batch flip of 3 = one undo.

### Files to Touch

`renderer/undo/undo-store.ts` (matrix + captures), keyboard loop
sites in gestures-ui, relink inverse in
`persistence/src/handlers/notes.ts` + spec, e2e.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [ ] Matrix covers every registered command; registry-diff test
      enforces it forever.
- [ ] Missing verbs captured; batch gestures = one undo each.
- [ ] Relink-create compound inverse (safe-case note removal);
      unsafe case documented + tested.
- [ ] Gates: build, per-package units, lint, e2e in 4+ foreground
      shards.
- [ ] HUMAN-TESTING entry appended at merge by the lead (the
      owner ratifies the matrix — his ruling, his sign-off).

### Acceptance Criteria

**GIVEN** any deliberate verb in the app
**WHEN** the user presses Mod+Z
**THEN** it reverses (node-trash excepted) — and no future
command can ship without declaring its undo class.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->
