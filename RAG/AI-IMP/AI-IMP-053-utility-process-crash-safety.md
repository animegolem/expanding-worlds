---
node_id: AI-IMP-053
tags:
  - IMP-LIST
  - Implementation
  - hardening
  - main-process
kanban_status: planned
depends_on:
parent_epic: [[AI-EPIC-012-pre-alpha-hardening]]
confidence_score: 0.8
date_created: 2026-07-05
date_completed:
---

# AI-IMP-053-utility-process-crash-safety

## Summary of Issue #1

Codex review P1, confirmed: `startUtility()` registers no
exit/error handlers and `callUtility()` parks resolvers in a map, so
a dead or never-started utility process leaves every Project API
call hanging forever — the renderer sees a mute black canvas with no
error (plausibly related to the owner's unexplained black-canvas
launches). Done when killing the utility mid-session rejects all
pending calls with a structured error, surfaces a visible message in
the renderer, and one automatic restart attempt re-initializes the
project — proven by an e2e that kills the process. Rides along:
remove the stale `request-derivatives` NOT_IMPLEMENTED endpoint
(protocol + preload + utility) and untrack
`apps/desktop/test-results/.last-run.json`.

### Out of Scope

Crash-loop backoff beyond one restart attempt. The §11.4
PROJECT_LOCKED visible-status proposal (still parked, separate).
Utility-side crash telemetry.

### Design/Approach

main keeps a `generation` counter. `utility.on('exit')`: reject
every pending resolver with `{ok:false, code:'UTILITY_DIED', ...}`
(the ProjectResponse error shape), set projectReady=false, broadcast
a `project:event`-channel service event `{kind:'service-status',
status:'restarting'}`, then one restart: fork + init-project; on
success broadcast `status:'ok'` (renderer re-queries), on failure
`status:'failed'` with the message. `callUtility` also fails fast
when the process handle is null. Renderer: StatusStrip (already the
app-status surface) listens and shows the status; CanvasHost
re-queries the scene on recovery via the existing project-changed
path (service event reuses that channel with a distinct shape, so
existing listeners ignore it). e2e needs a way to kill the process:
a `test:kill-utility` ipcMain handler gated on
`EW_TEST_HOOKS === '1'` (set only by the spec), asserting queries
reject rather than hang and the app recovers.

### Files to Touch

`apps/desktop/src/main/index.ts`: exit handling, restart, test hook.
`apps/desktop/src/preload/index.ts`: drop requestDerivatives; expose
test hook invoke (gated).
`packages/protocol/src/index.ts`: drop RequestDerivatives types.
`apps/desktop/src/utility/index.ts`: drop the NOT_IMPLEMENTED case.
`apps/desktop/src/renderer/StatusStrip.svelte`: service status line.
`apps/desktop/e2e/recovery.spec.ts`: new spec.
Repo: `git rm --cached apps/desktop/test-results/.last-run.json`.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and
**think**. Have you validated all aspects are **implemented** and
**tested**?
</CRITICAL_RULE>

- [ ] Utility exit rejects all pending calls with UTILITY_DIED;
      callUtility fails fast when no process is live.
- [ ] One restart attempt re-forks and re-inits; service status
      events broadcast over the existing event channel; StatusStrip
      renders restarting/ok/failed.
- [ ] Stale request-derivatives endpoint removed end to end
      (protocol, preload, utility); no callers existed.
- [ ] .last-run.json untracked.
- [ ] recovery.spec e2e: kill via gated test hook → in-flight and
      subsequent queries reject (not hang) → status surfaces →
      recovered session serves queries again.
- [ ] Gates green locally and on CI.

### Acceptance Criteria

**GIVEN** an open project and a query in flight
**WHEN** the utility process dies
**THEN** the query rejects with a structured UTILITY_DIED error
within a bounded time (no hang)
**AND** the status strip shows the outage
**AND** after the automatic restart, project queries succeed again.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->
