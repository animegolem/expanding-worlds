---
node_id: AI-IMP-008
tags:
  - IMP-LIST
  - Implementation
  - ci
kanban_status: in-progress
depends_on: AI-EPIC-002, AI-IMP-005
parent_epic: [[AI-EPIC-002-workspace-scaffolding]]
confidence_score: 0.85
date_created: 2026-07-03
date_completed:
---

# AI-IMP-008-ci-quality-gates

## CI workflow and root quality gates

Quality gates exist as ad hoc commands. Provide one root `pnpm check`
script chaining install-verify, build, test, and lint across the
workspace (plus the spike's typecheck), and a GitHub Actions workflow
running it on push/PR — committed ready-to-activate since the repo has
no remote yet. Done means: `pnpm check` passes locally from a clean
state and `actionlint`-clean workflow YAML exists.

### Out of Scope

Publishing, packaging, release automation, coverage thresholds,
Playwright e2e in CI (needs display/electron setup — note as follow-up
in the workflow file comments, do not implement).

### Design/Approach

Root `check` script: `pnpm -r build && pnpm -r test && pnpm lint` plus
`tsc --noEmit` in spike/ (npm-managed, outside the workspace).
Workflow `.github/workflows/ci.yml`: checkout, pnpm/action-setup, node
from .nvmrc with pnpm cache, `pnpm install --frozen-lockfile`, `pnpm
check`. Validate YAML with actionlint if available (brew or
container); otherwise structural review documented in the ticket.

### Files to Touch

Root `package.json`: `check` script.
`.github/workflows/ci.yml`: new.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [ ] `pnpm check` runs the full gate chain and exits zero locally.
- [ ] Workflow YAML present, pinned actions, node from .nvmrc, frozen lockfile.
- [ ] Workflow validated (actionlint or documented structural review).
- [ ] Follow-up note about Electron e2e in CI recorded in the workflow comments.

### Acceptance Criteria

**Scenario:** One-command quality gate.
**GIVEN** a clean working tree with dependencies installed.
**WHEN** `pnpm check` runs at the repo root.
**THEN** workspace build, tests, lint, and the spike typecheck all run and exit zero.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->
