---
node_id: AI-IMP-006
tags:
  - IMP-LIST
  - Implementation
  - electron
kanban_status: planned
depends_on: AI-EPIC-002, AI-IMP-005
parent_epic: [[AI-EPIC-002-workspace-scaffolding]]
confidence_score: 0.8
date_created: 2026-07-03
date_completed:
---

# AI-IMP-006-electron-process-shell

## Electron three-process shell per RFC 13.2

`apps/desktop` needs the process architecture the whole app hangs on:
main process (window lifecycle, menus, narrow IPC routing), sandboxed
renderer behind a typed preload bridge, and a project utility process
stub. Done means: the app launches showing a placeholder page, and a
`project.ping()` call from renderer code round-trips renderer →
preload → main → utility process → back, verified by an automated
test.

### Out of Scope

Svelte UI (IMP-007 replaces the placeholder), SQLite or any real
project service logic (EPIC-003), packaging/signing, auto-update.

### Design/Approach

electron-vite for the main/preload/renderer build. Renderer runs with
`sandbox: true`, `contextIsolation: true`, no node integration;
preload exposes one typed `window.ew` API via contextBridge (initially
`project.ping(): Promise<{pong: true, from: 'utility'}>`). Main forks
the utility stub via `utilityProcess.fork` and routes
`ipcMain.handle('project:ping')` over a MessageChannel to it. The
`@ew/protocol` package holds the shared request/response types so the
seam is typed end to end. Validation via a Playwright `_electron`
launch test asserting the round-trip payload.

### Files to Touch

`apps/desktop/package.json`, `electron.vite.config.ts`, tsconfigs: new.
`apps/desktop/src/main/index.ts`: window lifecycle, menu, IPC routing, utility fork.
`apps/desktop/src/preload/index.ts`: contextBridge API.
`apps/desktop/src/renderer/index.html` + `src/renderer/main.ts`: placeholder page calling ping.
`apps/desktop/src/utility/index.ts`: utility process stub.
`packages/protocol/src/index.ts`: ping request/response types.
`apps/desktop/e2e/shell.spec.ts`: Playwright electron round-trip test.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [ ] electron-vite dev and build produce a launchable app window.
- [ ] Renderer is sandboxed with context isolation; verify no `require` in renderer scope.
- [ ] Utility process forks at startup and answers ping over MessageChannel.
- [ ] Typed `window.ew.project.ping()` resolves `{pong: true, from: 'utility'}`.
- [ ] Playwright `_electron` e2e asserts the round-trip and window title.
- [ ] `pnpm -r build`, `pnpm -r test`, `pnpm lint` stay green across the workspace.

### Acceptance Criteria

**Scenario:** Process seam round-trip.
**GIVEN** the built desktop app launched via Playwright `_electron`.
**WHEN** the test invokes `window.ew.project.ping()` in the renderer.
**THEN** it resolves `{pong: true, from: 'utility'}`, proving renderer → preload → main → utility routing.
**AND** `typeof require === 'undefined'` in the renderer page context.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->
