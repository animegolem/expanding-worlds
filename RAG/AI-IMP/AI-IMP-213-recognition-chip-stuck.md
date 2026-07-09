---
node_id: AI-IMP-213
tags:
  - IMP-LIST
  - Implementation
  - import
  - chrome
  - bug
kanban_status: planned
depends_on: []
parent_epic:
confidence_score: 0.7
date_created: 2026-07-09
---


# AI-IMP-213-recognition-chip-stuck

## Summary of Issue #1

Alph field report (2026-07-09, on v0.16.0 — "already a dozen times
more stable"): the "Already in your library" recognition chip
(RecognitionChip.svelte) "sometimes gets stuck in the middle of
the screen" — a dedupe chip that should present briefly and
dismiss instead persists indefinitely, marooned over the board.
Stuck-state family (the audit's fifth defect class). Done means
the wedge is reproduced (hunt the interleaving: drop resolved
while a second drop starts? window blur mid-fade? chip's dismiss
timer cancelled by a re-render?), root-caused, fixed at the cause,
AND the chip carries the house safety-timeout idiom so no future
interleaving can leave it standing forever.

### Out of Scope

- Chip visual design / the tag-add copy it may carry (DESIGN-QUEUE
  tag cluster).
- Import pipeline semantics.

### Design/Approach

Read RecognitionChip's lifecycle: what arms it, what dismisses it
(timer? outro? parent unmount?). Reproduce with interleaved drops
of duplicate assets and blur/focus during the chip's life. Audit
every terminal state for a missing reset path (the 199 lesson:
states with no way back). Fix at cause + PathBar-idiom safety
timeout as the backstop. E2e: duplicate-drop shows the chip and it
ALWAYS clears (poll to gone), including under a burst of drops.

### Files to Touch

`chrome/RecognitionChip.svelte` + whatever arms it in the import
surface, ingest/import e2e extension.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [ ] Wedge reproduced and root cause documented (not
      timer-papered — the safety timeout is a backstop, not the
      fix).
- [ ] Chip always clears; burst e2e green.
- [ ] Gates: build, per-package units, lint, e2e in 4+ foreground
      shards.
- [ ] HUMAN-TESTING entry appended at merge by the lead (alph
      first pass — his find).

### Acceptance Criteria

**GIVEN** any sequence of duplicate drops, focus changes, and
navigation
**THEN** the recognition chip never persists beyond its
presentation window — the board is never left wearing a stuck
pill.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->
