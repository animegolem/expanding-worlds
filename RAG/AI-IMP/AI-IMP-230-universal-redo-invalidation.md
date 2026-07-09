---
node_id: AI-IMP-230
tags:
  - IMP-LIST
  - Implementation
  - undo
  - P2
kanban_status: planned
depends_on: []
parent_epic:
confidence_score: 0.75
date_created: 2026-07-09
---


# AI-IMP-230-universal-redo-invalidation

## Summary of Issue #1

Sol audit CA-005 (P2, probe-verified): §10.2 requires ANY new
durable command after an undo to clear redo. The coordinator
forwards only CAPTURED_COMMANDS to the stack, and
`UndoStack.record` early-returns on a null inverse WITHOUT
clearing redo — so note autosave, canvas creation, attach,
relink, and every other uncaptured commit leaves stale redo
standing (probe: redoDepth stayed 1 after UpdateNote). Redo can
then replay onto a changed world. Broader than AI-IMP-221's
gallery-specific bypass. Done means every committed durable
command reaches the coordinator; any non-undo/non-redo commit
clears redo unconditionally; whether it ALSO creates an undo
entry stays the capture-set question (AI-IMP-233's matrix).

### Out of Scope

- Which verbs get captured (233).
- The gallery gateway bypass (221 — but its fix must route
  through the same invalidation seam; coordinate).
- Group semantics (231).

### Design/Approach

One seam: the gateway (or wherever commits fan out) notifies the
coordinator of EVERY commit with its type + undo/redo provenance
flag. Coordinator: provenance undo/redo → stack bookkeeping as
today; otherwise clear redo ALWAYS, then push an entry only if
captured with a real inverse. Fix the null-inverse early return.
Tests: Sol's probe as regression (capture → undo → uncaptured
commit → redoDepth 0); redo survives its own undo/redo cycle.

### Files to Touch

`renderer/undo/undo-store.ts`, `undo-stack.ts` + specs; the
commit fan-out seam if commits bypass it today.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [ ] Every durable commit reaches the coordinator; non-undo/redo
      commits always clear redo (null inverse included).
- [ ] Probe regression + cycle tests green.
- [ ] Gates: build, per-package units, lint, e2e in 4+ foreground
      shards.
- [ ] HUMAN-TESTING entry appended at merge by the lead.

### Acceptance Criteria

**GIVEN** an undo followed by ANY new durable command
**THEN** redo is empty — Mod+Shift+Z can never replay onto a
world that moved on.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->
