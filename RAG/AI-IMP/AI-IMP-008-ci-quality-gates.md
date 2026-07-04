---
node_id: AI-IMP-008
tags:
  - IMP-LIST
  - Implementation
  - ci
kanban_status: completed
depends_on: AI-EPIC-002, AI-IMP-005
parent_epic: [[AI-EPIC-002-workspace-scaffolding]]
confidence_score: 0.85
date_created: 2026-07-03
date_completed: 2026-07-03
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

- [x] `pnpm check` runs the full gate chain and exits zero locally.
- [x] Workflow YAML present, pinned actions, node from .nvmrc, frozen lockfile.
- [x] Workflow validated (actionlint or documented structural review).
- [x] Follow-up note about Electron e2e in CI recorded in the workflow comments.

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

- **Electron postinstall silently broken on macOS.** `pnpm install`
  ran electron's `install.js` (allowed via `allowBuilds` in
  pnpm-workspace.yaml) but no `dist/Electron.app` was extracted and no
  error surfaced. Worked around locally by `ditto`-extracting the
  cached `electron-v39.8.10-darwin-arm64.zip` into `dist/` and writing
  `path.txt` by hand. Without this the desktop Playwright e2e (part of
  `pnpm check`) cannot launch. Recorded as a comment in the workflow;
  Linux runners are expected to be unaffected, and CI does not
  exercise the binary anyway since the e2e is excluded there.
- **Spike gate is a pure typecheck, not `npm run build`.**
  `check:spike` is `npm --prefix spike exec --no -- tsc --noEmit -p
  spike/tsconfig.json`: it runs spike's own pinned tsc (`--no` blocks
  any npx network fetch), whereas `npm --prefix spike run build` would
  also run `vite build`, which needs esbuild's platform binary (its
  postinstall was blocked by the local npm allow-scripts policy) and
  produces artifacts nobody consumes — spike/ is throwaway benchmark
  code, so "still typechecks" is the whole gate. In CI, spike deps are
  installed with `npm ci --ignore-scripts` for the same reason.
- **`check:ci` variant added.** CI runs `pnpm check:ci`, identical to
  `check` except workspace tests use `--filter '!@ew/desktop'` to skip
  the desktop e2e (Electron needs a display on a bare runner). The
  desktop *build* (tsc + electron-vite) still runs in CI. Follow-up
  options (xvfb-run, or a macos-latest job) are in the workflow
  comments. Verified locally that the filter excludes exactly
  `@ew/desktop` (6 package test runs, zero desktop test runs).
- **Gate has teeth.** Negative test: an injected type error in
  `spike/src` made `pnpm check:spike` exit non-zero (TS2322, exit 2);
  probe file removed afterwards. Positive runs: `pnpm check` green in
  ~17.4s wall (including the Electron e2e), `pnpm check:ci` green in
  ~6.9s wall. Workflow validated with actionlint 1.7.x — clean.
- **Not done here (worktree boundary):** `RAG/INDEX.md` regeneration
  (`./RAG/scripts/generate-index.sh`) and the AI-LOG entry were left
  to the lead, since this agent was fenced to package.json,
  `.github/**`, and this ticket file. The workflow is
  committed-ready-to-activate; the repo has no remote yet, so it has
  never actually executed on a runner.
