---
node_id: AI-IMP-254
tags:
  - IMP-LIST
  - Implementation
  - testing
  - consolidation
kanban_status: planned
depends_on: []
parent_epic: [[AI-EPIC-027-hardening-and-consolidation]]
confidence_score: 0.85
date_created: 2026-07-10
date_completed:
---


# AI-IMP-254-persistence-test-temp-cleanup

## Summary of Issue #1

Both 2026-07-10 audits flag the same duplication (EPIC-027 FR-24):
45 persistence test files carry 58 identical
`rmSync(dir, { recursive: true, force: true, maxRetries: 10,
retryDelay: 100 })` cleanup calls — the Windows-hardening retry
options copy-pasted per file. The next Windows semantics change
means editing 58 sites (again). Done means: one `rmTempDir(dir)`
helper (plus a `mkTempDir(prefix)` twin if the census shows the
mkdtemp side is equally uniform) in a shared test-support module,
all sites migrated, and a guard scan preventing new raw
retry-option `rmSync` calls in persistence tests.

### Out of Scope

- Changing retry semantics — the helper freezes today's options.
- Test-fixture redesign; this is mechanical extraction only.
- e2e-side temp handling (different package, different harness).

### Design/Approach

`packages/persistence/src/test-support/temp.ts` (or the existing
test-util location if one exists — verify in review) exporting
`rmTempDir`. Vitest resolves through source in-package, so no
build-order concern. Mechanical sed-like migration, then the
package's full unit suite. Guard: a scan test failing on
`rmSync(.*maxRetries` in `packages/persistence/**/*.test.ts`
outside the helper file.

PRE-IMPLEMENTATION REVIEW (standing process): re-run the census on
current main (58/45 was at baseline 8a86f21); confirm no test
depends on cleanup-failure behavior.

### Files to Touch

- `packages/persistence/src/test-support/temp.ts` (new).
- ~45 `packages/persistence/src/**/*.test.ts` files: swap the
  call.
- Guard scan test.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [ ] Pre-implementation review: current census recorded; helper
      location confirmed against existing test-support layout.
- [ ] `rmTempDir` helper; all census sites migrated; zero raw
      retry-option `rmSync` calls remain in persistence tests.
- [ ] Guard scan fails on a reintroduced raw call.
- [ ] `pnpm --filter='./packages/*' test` green (macOS); Windows
      leg exercises the helper on its next run.

### Acceptance Criteria

**Scenario:** the next Windows cleanup-semantics change.
**GIVEN** the persistence unit suite after migration
**WHEN** cleanup retry behavior must change
**THEN** exactly one file (`temp.ts`) is edited
**AND** the guard scan blocks new hand-rolled cleanup calls.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->
