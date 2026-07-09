---
node_id: AI-IMP-231
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


# AI-IMP-231-undo-group-identity

## Summary of Issue #1

Sol audit CA-006 (P2, probe-verified): `runAsUndoGroup` uses ONE
module-global `pendingGroup` accumulator — any group starting
while another is open silently JOINS it. Multi-file import holds
its group open across file I/O and scene waits while the renderer
stays interactive, so an unrelated note/tag/board action lands
inside the import's group and one Mod+Z reverses both (probe:
interleaved groups collapsed to one entry). Done means group
identity is explicit and operation-scoped: a group token per
runAsUndoGroup call; commits join a group only when issued under
that token's scope (async-context or explicit threading); nested
same-token calls join, temporal overlap NEVER merges.

### Out of Scope

- Fail-stop of the flows holding groups open (232 — but its
  bounded waits shrink this window; same wave).
- GROUP_ONLY breadth semantics (182, shipped).

### Design/Approach

Replace the global with token-scoped accumulation. Simplest
honest mechanism given the codebase's explicit style:
runAsUndoGroup creates a token and passes it through the callback
(callers thread it to their execute calls), OR an AsyncLocalStorage
scope if the renderer bundle supports it cleanly — builder probes
both, picks, and documents (STOP if neither can cover the import
path without distortion). Port Sol's probe: overlapping groups →
two distinct undo entries, each reversing only its own commits.

### Files to Touch

`renderer/undo/undo-store.ts` + spec; the runAsUndoGroup call
sites that must thread the token (import-surfaces, gestures,
menus).

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [ ] Group membership is token-scoped; overlap never merges;
      nesting joins only same-token.
- [ ] Probe regression: interleaved groups → separate entries.
- [ ] Gates: build, per-package units, lint, e2e in 4+ foreground
      shards.
- [ ] HUMAN-TESTING entry appended at merge by the lead.

### Acceptance Criteria

**GIVEN** a multi-file import in flight and a tag edit made
meanwhile
**WHEN** the user presses Mod+Z
**THEN** only the tag edit reverses — the import remains its own
single undo action.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->
