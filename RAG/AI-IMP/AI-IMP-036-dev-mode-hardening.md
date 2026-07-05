---
node_id: AI-IMP-036
tags:
  - IMP-LIST
  - Implementation
  - tooling
  - dx
kanban_status: in-progress
depends_on: []
parent_epic: [[AI-EPIC-010-hands-on-hardening]]
confidence_score: 0.85
date_created: 2026-07-05
date_completed:
---

# AI-IMP-036-dev-mode-hardening

## Summary of Issue #1

`pnpm dev` has burned the owner three times: vite pre-bundles the
`@ew/*` workspace packages from their dist ONCE at server start, so
engine changes rebuilt mid-session never reach a running dev app
(stale features masquerading as bugs), and killed sessions leave a
zombie holding port 5173 so the next dev run silently shifts ports
while a wedged window lingers. Done means: workspace packages are
excluded from dependency pre-bundling (rebuilt dist reaches the
session on plain reload), a predev preflight clears stale listeners
on the dev port, and CLAUDE.md records the rule.

### Out of Scope

Watch-mode rebuilds of packages/* (dist still builds manually);
production build pipeline; HMR for engine internals.

### Design/Approach

electron.vite.config renderer config gains
`optimizeDeps: { exclude: ['@ew/canvas-engine', '@ew/commands',
'@ew/protocol'] }` (renderer-reachable workspace deps) so vite serves
them as live ESM from dist instead of a startup-frozen prebundle.
apps/desktop package.json gains a `predev` script that kills any
listener on 5173 (`lsof -ti :5173 | xargs kill` with a no-match
guard). Validation: boot dev headlessly with a CDP port, probe the
renderer mounts; then rebuild the engine dist with a marker export
and confirm a page reload (no server restart) picks it up.

### Files to Touch

`apps/desktop/electron.vite.config.ts`: renderer optimizeDeps
exclusion.
`apps/desktop/package.json`: predev preflight.
`CLAUDE.md`: dev-mode rule (replaces the restart folklore).

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and
**think**. Have you validated all aspects are **implemented** and
**tested**?
</CRITICAL_RULE>

- [ ] optimizeDeps.exclude for renderer-reachable @ew packages.
- [ ] predev port preflight (no-op when the port is free).
- [ ] Live validation: dev boots and mounts; engine dist rebuilt
      mid-session is picked up by a plain reload.
- [ ] CLAUDE.md note; full gates stay green.

### Acceptance Criteria

**Scenario:** Engine change reaches a running dev session.
**GIVEN** `pnpm dev` is running
**WHEN** packages/canvas-engine is rebuilt
**THEN** reloading the window (Cmd+R) shows the new behavior without
restarting the dev server.
**GIVEN** a wedged previous session holds port 5173
**WHEN** `pnpm dev` runs
**THEN** the stale listener is killed and the new session takes 5173.

### Issues Encountered

<!-- Filled out post-work. -->
