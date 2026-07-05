---
node_id: AI-IMP-050
tags:
  - IMP-LIST
  - Implementation
  - infrastructure
  - ci
kanban_status: completed
depends_on:
parent_epic: [[AI-EPIC-011-release-engineering]]
confidence_score: 0.75
date_created: 2026-07-05
date_completed: 2026-07-05
---

# AI-IMP-050-remote-push-and-ci

## Summary of Issue #1

origin (github.com/animegolem/expanding-worlds, public) is ~23
commits behind local main and nothing validates pushes. Stand up a
GitHub Actions workflow running the full gate suite on every push to
main and on PRs, then push local history and iterate until green.
Done when the pushed main shows a green check running build, unit
suites, lint, and the desktop e2e suite (minus perf) on Ubuntu.

### Out of Scope

Packaging and releases (AI-IMP-051/052). macOS/Windows CI runners
(cost; Ubuntu catches logic regressions — platform-specific builds
happen on tags). Branch protection rules.

### Design/Approach

Single workflow `.github/workflows/ci.yml`: checkout, pnpm via
corepack, `pnpm install --frozen-lockfile`, `pnpm -r build`,
`pnpm -r --filter '!@ew/desktop' test`, `pnpm lint`, then desktop
e2e under `xvfb-run` (Electron needs a display; hidden-window mode
still requires an X server for Chromium init on Linux). Playwright's
`testIgnore` excludes `perf.spec.ts` when `CI` is set — the perf
suite THROWS on software GL by design (EPIC-001 lesson) and CI
runners are GPU-less; it stays a local gate. Apt-install Electron's
runtime libs (libnss3, libgtk-3, libgbm, libasound2t64). Cache the
pnpm store keyed on the lockfile. e2e uses isolated EW_PROJECT_DIR
temp dirs already, so runner parallelism is a non-issue
(workers: 1 regardless).

### Files to Touch

`.github/workflows/ci.yml`: new workflow.
`apps/desktop/playwright.config.ts`: CI perf exclusion.
Remote: push main; iterate on the workflow until green.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and
**think**. Have you validated all aspects are **implemented** and
**tested**?
</CRITICAL_RULE>

- [x] playwright.config testIgnore excludes perf.spec.ts under CI;
      local full run still includes it (31 vs 34 via --list).
- [x] ci.yml: install → build → unit → lint → e2e (xvfb) with pnpm
      store cache; triggers on push to main and PRs.
- [x] main pushed; workflow iterated to green on the actual runner
      (verified via gh run watch).
- [x] Local gates unaffected (full local suite still green, 34/34).

### Acceptance Criteria

**GIVEN** a push to main on GitHub
**WHEN** the CI workflow runs
**THEN** build, unit suites, lint, and the e2e suite (minus perf)
all pass on the Ubuntu runner
**AND** the perf suite still runs (and passes) in local full-suite
runs.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->
Took eight remote iterations (inherent to CI work — the one-commit
convention bends here by necessity; each iteration is its own small
commit). Three real problem classes fell out. (1) Electron's
postinstall on the runner silently saved a truncated zip which
@electron/get then cache-hit forever, and install.js "extracted" a
single file and exited 0 — CI now purges the cache, uses install.js
only to fetch, and extracts with unzip itself, asserting the
executable exists. (2) The xvfb runner is ~10x slower than local
hardware: CI gets 120 s test timeout, 15 s expect windows, two
retries. (3) The runner exposed LATENT test bugs the fast local
machine masked: exact revision-delta assertions lose a race with
the debounced SetCanvasCamera persist on any slow machine (settling
first was tried and was WRONG — the race is unwinnable), so a new
`listCommandLog(sinceRevision)` read model (§10.2 log) lets tests
assert what they mean: counts of non-camera commands. All exact
deltas in board-tooling and slice converted. Bonus catch: the
notes-spec redo shortcut was mac-only (CM binds Ctrl+y off-mac, not
Ctrl+Shift+z). CI wall-clock ~14 min, dominated by the e2e suite;
within the epic's NFR but worth watching as the suite grows.
