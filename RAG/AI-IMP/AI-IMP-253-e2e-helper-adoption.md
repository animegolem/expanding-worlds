---
node_id: AI-IMP-253
tags:
  - IMP-LIST
  - Implementation
  - testing
  - consolidation
kanban_status: planned
depends_on: []
parent_epic: [[AI-EPIC-027-hardening-and-consolidation]]
confidence_score: 0.75
date_created: 2026-07-10
date_completed:
---


# AI-IMP-253-e2e-helper-adoption

## Summary of Issue #1

Audit HC-001: the E2E helper seam exists precisely to stop
hand-rolled drift (`apps/desktop/e2e/helpers.ts:13-17`), and its
launcher provides the load-bearing isolation — a unique project
AND a unique `EW_APP_CONFIG_DIR` (`helpers.ts:19-46`). Yet 12 spec
files still call `electron.launch` directly (ALL omitting
`EW_APP_CONFIG_DIR`, so they can read/write the shared default app
config), 16 call `window.ew.project.execute` raw, and 5 define
their own revision reader. The bypass is intermittent even within
one file (`shell.spec.ts:6` imports `launchApp`; `:24-30` and
`:117-124` launch raw). AI-IMP-057 created the helper and left
migration opportunistic; app-tier settings since made isolation
mandatory. Done means: ordinary UI specs route through the shared
launcher/exec/revision helpers; raw launch survives only in specs
whose SUBJECT is the process/protocol seam (explicit exemption
list); a guard scan fails on new unexempted `electron.launch`.

### Out of Scope

- Changing what any spec asserts — migration is mechanical.
- The persistence test temp-cleanup helper (AI-IMP-254, separate
  helper family per the audit).
- Specialized fault-injection launches that genuinely need raw
  control — exempt, don't force.

### Design/Approach

First extend the shared launcher with the options the raw sites
actually need (verified in the pre-implementation review: extra
env, readiness overrides, window flags) so migration never loses a
capability. Then migrate file-by-file; each migrated spec must
pass in its shard before moving on. Guard: a vitest scan over
`e2e/*.spec.ts` for `electron.launch` outside the helper +
exemption list. Respect `EW_TEST_HIDDEN_WINDOWS` — never run the
suite visible.

PRE-IMPLEMENTATION REVIEW (standing process): enumerate the 12/16/5
sites against CURRENT main first (the audit baseline is 8a86f21);
record the real list and any launcher-option gaps here.

### Files to Touch

- `apps/desktop/e2e/helpers.ts`: launcher options for specialized
  cases.
- The ~12 raw-launch spec files (enumerate in review; audit names
  `shell.spec.ts`, `resize-snap.spec.ts`, `gestures.spec.ts`,
  `board-tooling.spec.ts`).
- The raw-execute / local-revision-reader specs (~16/5).
- New guard scan test (desktop vitest).

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [ ] Pre-implementation review: current bypass census recorded in
      this ticket; launcher-option gaps identified.
- [ ] Launcher extended; existing helper consumers unaffected.
- [ ] All ordinary UI specs migrated to launchApp/exec/revision;
      every migrated spec launches with an isolated
      `EW_APP_CONFIG_DIR`.
- [ ] Exemption list: each remaining raw launch justified in a
      comment (protocol/process-seam subject).
- [ ] Guard scan fails on an unexempted `electron.launch`.
- [ ] Full e2e suite green in sharded runs (regex shards, hidden
      windows), `pnpm -r build` first.

### Acceptance Criteria

**Scenario:** spec isolation from the user's real app config.
**GIVEN** any ordinary UI spec in the suite
**WHEN** it launches the app
**THEN** it runs against a test-unique `EW_APP_CONFIG_DIR` and
project directory
**AND** adding a new spec with a bare `electron.launch` fails the
guard scan until exempted.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->
