---
node_id: AI-IMP-242
tags:
  - IMP-LIST
  - Implementation
  - ci
  - platform
kanban_status: completed
depends_on: []
parent_epic:
confidence_score: 0.75
date_created: 2026-07-09
date_completed: 2026-07-10
---


# AI-IMP-242-windows-ci-leg

## Summary of Issue #1

Owner-endorsed (2026-07-09): the first tester lives on WINDOWS
daily, and the entire test estate runs macOS-local + Linux-CI —
zero Windows coverage. Sol's residual-gaps list names exactly the
risks: file sharing/locking semantics, open-handle deletion, path
normalization. The new lock protocol (226) leans on O_EXCL +
mkdir + unlink-while-open patterns whose Windows behavior differs
meaningfully. Done means CI gains a Windows leg running the unit
estate (all packages + desktop vitest) INCLUDING the 16-process
lock probe, plus at minimum a smoke e2e (launch + shell spec) if
the runner tolerates Electron — with the suite green or the
failures ticketed honestly (a red Windows leg that reveals real
platform bugs is a SUCCESS for this ticket; paper over nothing).

### Out of Scope

- Full e2e matrix on Windows (runner cost/flake profile unknown —
  smoke first, expand later on evidence).
- Perf suite (local hardware gate, unchanged).
- Fixing any platform bugs found (tickets, not scope creep).

### Design/Approach

LEAD-BUILT (CI config is interface-defining; validation requires
pushed runs). Extend .github/workflows ci job matrix or add a
windows-latest job: pnpm setup, `pnpm -r build`,
`pnpm --filter='./packages/*' test`, desktop `npx vitest run`;
then `npx playwright test e2e/shell.spec.ts` guarded so a
launch-incapable runner skips loudly rather than failing
silently. Watch the first runs on a branch before landing on
main. Path/locking failures get triaged: real product bug →
ticket; test assumption (posix path literals) → fix in place.

### Files to Touch

`.github/workflows/*.yml`; possibly small posix-assumption fixes
in test helpers.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [x] Windows job: build + all units + lock probe.
- [x] Smoke e2e or a loud documented skip.
- [x] First runs watched on a branch; failures triaged into
      tickets vs in-place test fixes (list them here).
- [x] Green (or honestly ticketed) on main.

### Acceptance Criteria

**GIVEN** a push to main
**THEN** Windows runs the units and the lock probe — the
platform the actual tester uses finally has a tripwire.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->
