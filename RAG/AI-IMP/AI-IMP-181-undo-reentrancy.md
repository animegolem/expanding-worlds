---
node_id: AI-IMP-181
tags:
  - IMP-LIST
  - Implementation
  - undo
  - reentrancy
  - bug
kanban_status: planned
depends_on: []
parent_epic:
confidence_score: 0.85
date_created: 2026-07-08
---


# AI-IMP-181-undo-reentrancy

## Summary of Issue #1

Severity **P1** (M-06, lead-verified) from the AI-IMP-173 audit
(FAMILY 4) + a **P3** copy fix (M-38, lead-verified). Overlapping
undo()/redo() share one instance `#applying` boolean; a second call
started before the first settles mis-captures the stack's own
re-applied command as a fresh user action, corrupting `#undo`/`#redo`
and wiping redo.

Mechanism: `UndoStack#step` awaits inside member execution while
`#applying` is one shared boolean (`undo-stack.ts:92-94`, `:166-220`).
Hold Cmd+Z (OS key-repeat) or double-click the ☰ Undo row → two `#step`
calls overlap across a real IPC round-trip. The first's completion
flips `#applying=false` before the second's re-application commits, so
`onCommittedAnywhere` (`undo-store.ts:188-217`, gates on
`stack.applying`) mis-classifies it, `record()` pushes a phantom entry
and its `this.#redo=[]` wipes redo. The command gateway serializes the
two `execute()` IPCs but nothing serializes the surrounding `#step`
bookkeeping. Cites also `undo-store.ts:100-106`
(`void stack?.undo()` fire-and-forget), `undo-keys.ts:47-61`
(no debounce/in-flight guard). Distinct from AI-IMP-114's disclosed
narrower "missed capture" tradeoff.

Bundled P3 (M-38): the cross-canvas decline toast is hardcoded
"…to undo it" even when declining a REDO — one string shared by both
directions of `#step`. Cites `undo-stack.ts:173-177`. Harmless in
effect but wrong copy.

Done means: overlapping undo/redo can never mis-record the stack's own
re-applied command; held Cmd+Z leaves `#undo`/`#redo` consistent with
no phantom entries and no redo wipe; and the decline toast names the
correct verb for the direction.

### Out of Scope

- Which verbs are captured into Mod+Z (undo capture BREADTH) —
  AI-IMP-182. This ticket is the re-entrancy plumbing + toast copy.
- The AI-IMP-114 missed-capture tradeoff (a disclosed separate design
  choice) — not reopened here.
- Navigation re-entrancy (M-01/M-08) — AI-IMP-176 (same class,
  different subsystem).

### Design/Approach

Serialize `#step` behind one in-flight promise so a second undo/redo
cannot begin while the first's bookkeeping is unfinished. Two coherent
options — pick the drop-re-entrant-calls form to match the
"latest-intent" navigation fix (AI-IMP-176): while a step is in flight,
a new undo()/redo() is dropped (the key-repeat case) rather than
queued, since a held key expresses no additional intent. Keep the
`#applying` contract but make it unforgeable across the await — either
serialize the whole `#step` (reentrancy queue) or replace the boolean
with a per-call token/counter so `onCommittedAnywhere` can attribute a
commit to the step that is actually applying. Belt-and-braces: filter
`event.repeat` at the undo/redo binding (`undo-keys.ts`) so OS repeat
never generates the overlapping calls in the first place — the sibling
global shortcuts already guard their keys.

Document the `#applying` contract at its definition (what it means, why
it must not be observed mid-await) so a future edit doesn't reintroduce
the boolean race.

Copy fix (M-38): pick the toast verb by `#step` direction — "to undo
it" for an undo decline, "to redo it" for a redo decline
(`undo-stack.ts:173-177`).

### Files to Touch

`apps/desktop/src/renderer/undo/undo-stack.ts`: serialize `#step`
(in-flight promise / per-call token); document `#applying`; direction-
correct decline toast (`:173-177`).
`apps/desktop/src/renderer/undo/undo-keys.ts`: `event.repeat` filter on
the undo/redo binding.
`apps/desktop/src/renderer/undo/undo-stack.test.ts` (or nearest): unit
for overlapping step calls.
`apps/desktop/tests/e2e/undo.spec.ts`: held Cmd+Z e2e.
LOC: ~50–90.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [ ] `#step` serialized: a second undo/redo started before the first
      settles is dropped (or safely queued); the stack's own
      re-applied command is never recorded as a fresh action.
- [ ] `event.repeat` filtered at the undo/redo binding.
- [ ] `#applying` contract documented at its definition.
- [ ] Decline toast picks "undo"/"redo" by `#step` direction
      (`undo-stack.ts:173-177`).
- [ ] Unit: overlapping `#step` calls leave `#undo`/`#redo`
      consistent, no phantom entry, no redo wipe.
- [ ] E2e: held Cmd+Z leaves the stacks consistent; redo still works
      after.
- [ ] Gates: `pnpm -r build && pnpm -r test && pnpm lint` + hidden
      e2e (`EW_TEST_HIDDEN_WINDOWS=1`).
- [ ] Append an `RAG/HUMAN-TESTING.md` entry: hold Cmd+Z through a
      stack of edits, then redo; confirm nothing phantoms and redo is
      intact. Check a cross-canvas redo decline names "redo".

### Acceptance Criteria

**Scenario: overlapping undo does not corrupt the stack.**
**GIVEN** a stack of undoable actions
**WHEN** the user holds Cmd+Z so the OS repeats it and two `#step`
calls would overlap across the IPC round-trip
**THEN** at most one step applies at a time
**AND** no phantom entry is recorded AND redo is not wiped.

**Scenario: decline toast names the right direction.**
**GIVEN** a redo whose target board is elsewhere
**WHEN** the redo is declined with a naming notice
**THEN** the toast says "to redo it," not "to undo it."

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->
