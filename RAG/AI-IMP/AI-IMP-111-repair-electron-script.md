---
node_id: AI-IMP-111
tags:
  - IMP-LIST
  - Implementation
  - tooling
  - e2e
kanban_status: planned
depends_on:
parent_epic: [[AI-EPIC-022-fleet-friction]]
confidence_score: 0.85
date_created: 2026-07-06
date_completed:
---

# AI-IMP-111-repair-electron-script

## Summary of Issue #1

Electron's install.js postinstall exits 0 without extracting the
app bundle under pnpm on macOS, so every fresh worktree/clone gets
a husk `dist/` (just LICENSES.chromium.html) and e2e fails with
misleading ENOENT/"missing binary" symptoms. The repair is a
five-landmine manual dance rediscovered across ~15 sessions
(meta-analysis 2026-07-06, evidence IMP-006/008/019/020/021/022/
061/069/070/071/072/075/080/081). Done = one idempotent script
encoding all five landmines, wired as a pre-e2e guard, one
CLAUDE.md line replacing the prose recipe.

### Out of Scope

- Fixing electron's installer upstream; pinning/version changes.
- Windows/Linux repair paths (macOS is the lead platform; the
  script should fail with a clear message elsewhere, not guess).

### Design/Approach

`scripts/repair-electron.sh`: (1) locate the electron package dir
the desktop app resolves (node_modules/electron via `node -p
"require.resolve('electron/package.json')"` from apps/desktop);
(2) if `dist/Electron.app/Contents/MacOS/Electron` exists AND
`path.txt` is correct → exit 0 silently (idempotent); (3) else
`rm -rf` the husk `dist` FIRST (kills the dist/dist nesting
landmine), extract from the cached zip in the pnpm store (or run
install.js and verify it actually worked — do not trust exit 0;
fall back to `ditto`/`unzip` on the zip); (4) write `path.txt`
with `printf '%s'` — NEVER echo (trailing newline = ENOENT that
looks like a missing binary); (5) verify the binary is executable
and print one OK line. Wire: `apps/desktop` package.json
`pree2e`-style guard — the repo runs e2e via `npx playwright
test`, so instead add it to playwright.config globalSetup OR a
`test:e2e` script that repairs then runs playwright; pick
whichever the repo can adopt without changing how CI invokes
tests, and document the choice. Update CLAUDE.md: replace the
worktree-agent electron-repair prose with "run
scripts/repair-electron.sh".

### Files to Touch

`scripts/repair-electron.sh`: new.
`apps/desktop/package.json` or `playwright.config.ts`: the guard.
`CLAUDE.md`: one line (lead reviews wording).

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and
**think**. Have you validated all aspects are **implemented** and
**tested**?
</CRITICAL_RULE>

- [ ] Script exists, shellcheck-clean, idempotent (second run is a
      no-op), and repairs a deliberately-husked dist (test by
      moving dist aside in YOUR worktree and repairing it back).
- [ ] Guard wired so a fresh-worktree `playwright test` self-heals
      without manual steps; normal repaired runs pay <1s.
- [ ] CLAUDE.md updated; the five landmines documented as comments
      IN the script (they are the institutional memory).
- [ ] Full gates (build, unit, lint, one e2e spec to prove the
      guard path).

### Acceptance Criteria

**GIVEN** a fresh git worktree after `pnpm install`
**WHEN** the agent runs the e2e suite
**THEN** electron is repaired automatically, the suite launches,
and running the script again reports healthy and changes nothing.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->
