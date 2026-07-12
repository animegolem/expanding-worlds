---
node_id: AI-IMP-220
tags:
  - IMP-LIST
  - Implementation
  - persistence
  - trash
kanban_status: planned
depends_on: []
parent_epic: [[AI-EPIC-007-lifecycle-trash-undo]]
confidence_score: 0.75
date_created: 2026-07-09
---


# AI-IMP-220-trash-retention-job

## Summary of Issue #1

Terra audit (2026-07-09, P2, lead-verified — accepted decision
never backfilled): Settings exposes 30/60/90-day trash retention
(TRASH_RETENTION_KEY is stored and read), but NO expiration job
exists anywhere — nothing ever purges. The setting promises
behavior that does not occur, the worst kind of settings lie.
Done means an expiration pass runs at a deliberate moment (app
open and/or quit episode — not ambient timers), purging trashed
aggregates older than the configured retention through the
EXISTING §9.6/§9.7 purge handlers (never a new deletion path),
with the pass logged (count + ids) and covered by tests.

### Out of Scope

- Blob sweeping (AI-IMP-219 — expiration makes assets GC-eligible;
  GC reclaims them; coordinate, likely same wave).
- Retention UI (exists).
- "Never" retention if the setting offers it — expiration simply
  skips.

### Design/Approach

Read the trash rows' trashed_at; on the chosen trigger, select
aggregates past retention and drive them through the existing
purge command path one aggregate at a time (FK-safe order is the
handlers' job, not the sweep's). Respect invariants (§5): never
the root node. Deliberate trigger: project-open is the natural
moment (matches "opened the box, old stuff is gone" mental model)
— confirm against §9.6's text; if the RFC names a moment, obey
it; if silent, project-open + a line in the ticket. E2e: seed a
trashed node with a backdated trashed_at, reopen, gone; a fresh
one survives.

### Files to Touch

`packages/persistence/src/handlers/lifecycle.ts` (or a sibling
sweep module), utility/main open-episode wiring, unit + e2e.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [ ] Expiration drives the existing purge handlers only; trigger
      moment matches the RFC (or the silence is recorded).
- [ ] Backdated-trash e2e purges; fresh trash survives; "never"
      (if present) skips.
- [ ] Pass logged with counts.
- [ ] Gates: build, per-package units, lint, e2e in 4+ foreground
      shards.
- [ ] HUMAN-TESTING entry appended at merge by the lead.

### Acceptance Criteria

**GIVEN** retention set to 30 days and a note trashed 40 days ago
**WHEN** the project next opens
**THEN** the note is purged exactly as an explicit §9.7 purge
would have — and the setting finally tells the truth.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->
