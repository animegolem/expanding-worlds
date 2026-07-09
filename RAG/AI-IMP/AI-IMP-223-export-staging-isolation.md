---
node_id: AI-IMP-223
tags:
  - IMP-LIST
  - Implementation
  - persistence
  - export
kanban_status: planned
depends_on: []
parent_epic:
confidence_score: 0.85
date_created: 2026-07-09
---


# AI-IMP-223-export-staging-isolation

## Summary of Issue #1

Terra audit (2026-07-09, P3, lead-verified): every export
recreates the SHARED `.tmp-export` staging dir
(project-export.ts ~139, `rmSync` then `mkdirSync`), so re-entrant
exports delete each other's staging mid-write — a truncated
archive from the loser. Low likelihood (UI mostly serializes) but
the 179 export-race family taught us "mostly" isn't a guard. Done
means exports cannot clobber each other: per-request staging dirs
(`.tmp-export-<uuid>`) cleaned in the finally, plus startup sweep
of orphaned staging dirs from crashed exports.

### Out of Scope

- Export content/manifest semantics (179's freeze-the-copy,
  correct).
- UI-level serialization (belt, not the fix).

### Design/Approach

Suffix the staging dir with the export's id; the existing
try/finally already owns cleanup — point it at the per-request
dir. Startup (or export-start) sweeps `.tmp-export*` older than
an hour. Unit: two concurrent exportProject calls both produce
valid archives (the existing hash-verify makes this cheap to
assert).

### Files to Touch

`packages/persistence/src/export/project-export.ts`, its spec.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [ ] Per-request staging; finally-cleanup; orphan sweep.
- [ ] Concurrent-export unit test: both archives valid.
- [ ] Gates: build, per-package units, lint, e2e in 4+ foreground
      shards.
- [ ] HUMAN-TESTING entry appended at merge by the lead.

### Acceptance Criteria

**GIVEN** two exports triggered concurrently
**THEN** both complete with valid, hash-verified archives — no
shared staging to clobber.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->
