---
node_id: AI-IMP-234
tags:
  - IMP-LIST
  - Implementation
  - import
  - security
  - P2
kanban_status: planned
depends_on: []
parent_epic:
confidence_score: 0.8
date_created: 2026-07-09
---


# AI-IMP-234-import-resource-limits

## Summary of Issue #1

Sol audit CA-011 (P2, lead-verified): `.ewproj` import
(project-import.ts, manifest.ts) has no uncompressed resource
defenses — unbounded entry count, unbounded manifest buffer,
no per-entry/aggregate uncompressed caps, unbounded compression
ratio, and manifest `bytes` only type-checked (not finite/
non-negative/integer, never reconciled with ZIP metadata or
streamed counts). A damaged or malicious archive can exhaust
memory or fill the disk before hash verification runs. Done means
import enforces named budgets BEFORE extraction (entry count,
manifest size, per-entry and aggregate uncompressed bytes,
compression ratio), requires unique paths and finite integer
sizes, binds the manifest inventory to allowed entries, counts
streamed bytes, and refuses (typed, user-phrasable) on the first
violation — leaving nothing on disk, per the existing
failed-import guarantee.

### Out of Scope

- Export side (229).
- Archive format changes (defenses only).

### Design/Approach

Named constants module beside the importer (generous but real:
e.g. entries ≤ 100k, manifest ≤ 16MB, entry ≤ 8GB, aggregate ≤
64GB, ratio ≤ 200:1 — builder sanity-checks against a realistic
big-project profile and records the rationale). Validate the
central directory + manifest against budgets before any
extraction; stream-count every entry and abort past its declared
+ budgeted size; reconcile declared vs actual at close. Tests:
synthetic zip-bomb (high ratio), over-count archive, lying
manifest (declared ≠ actual), duplicate paths — every case
refuses cleanly with nothing on disk.

### Files to Touch

`packages/persistence/src/export/project-import.ts`,
`manifest.ts`, a limits module + specs.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [ ] Budgets enforced pre-extraction; streamed counts enforced
      during; declared-vs-actual reconciled.
- [ ] Malicious-archive test family (bomb, count, lie, dupes) all
      refuse with clean disk.
- [ ] Gates: build, per-package units, lint, e2e in 4+ foreground
      shards.
- [ ] HUMAN-TESTING entry appended at merge by the lead.

### Acceptance Criteria

**GIVEN** a damaged or hostile .ewproj
**WHEN** the user imports it
**THEN** the import refuses with a clear message before memory or
disk suffer — and a legitimate large project still imports.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->
