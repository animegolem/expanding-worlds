---
node_id: AI-IMP-093
tags:
  - IMP-LIST
  - Implementation
  - export
kanban_status: planned
depends_on:
parent_epic: [[AI-EPIC-015-library-and-cross-project-sourcing]]
confidence_score: 0.85
date_created: 2026-07-06
date_completed:
---

# AI-IMP-093-export-size-preflight

## Summary of Issue #1

§16/§14.4 (FR-5): once library-scale projects exist, exports get
big — the export flow gains a size preflight, asked ONCE per
project. Before the first export of a project, sum the managed
store (blobs + derivatives + db) and present it with a
proceed/cancel; the proceed answer persists (project setting) so
subsequent exports run without the interruption. Done = preflight
on first export with honest sizing, remembered consent, units +
e2e.

### Out of Scope

- Export content changes, partial/filtered export, compression.
- Re-asking on growth (a future threshold rule can revisit; §16
  says asked once, and once means once).

### Design/Approach

A `getProjectSize` query (walk assets/ + derivatives/ + db file —
the service owns the dir) and an `exportPreflightAccepted` project
setting. The export UI checks the setting: unset → show size +
proceed/cancel; proceed stores true and continues; cancel stores
nothing. Sizes format humanely (MB/GB).

### Files to Touch

`packages/persistence/src/` size query (+test); export UI surface
in the renderer; e2e in the existing export spec.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and
**think**. Have you validated all aspects are **implemented** and
**tested**?
</CRITICAL_RULE>

- [ ] getProjectSize query with unit (fixture with known bytes).
- [ ] First-export preflight dialog: size shown, proceed persists
      consent, cancel aborts cleanly.
- [ ] Subsequent exports skip the ask (setting present).
- [ ] e2e: first export shows preflight, second does not.
- [ ] Full gates.

### Acceptance Criteria

**GIVEN** a project never exported
**WHEN** the artist exports
**THEN** a one-time size preflight appears; proceeding exports and
never asks again; cancelling exports nothing and asks next time.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->
