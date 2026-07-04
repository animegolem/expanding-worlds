---
node_id: AI-IMP-007
tags:
  - IMP-LIST
  - Implementation
  - svelte
  - renderer
kanban_status: in-progress
depends_on: AI-EPIC-002, AI-IMP-006
parent_epic: [[AI-EPIC-002-workspace-scaffolding]]
confidence_score: 0.8
date_created: 2026-07-03
date_completed:
---

# AI-IMP-007-svelte-shell-ui

## Svelte 5 workspace shell in the renderer

The renderer shows a plain placeholder page. Replace it with a minimal
Svelte 5 application shell matching RFC 8.2's provisional layout: a
persistent note-pane region, a tabbed main-workspace region (one
placeholder tab), and a status strip showing the `project.ping()`
round-trip result. Done means: the Svelte shell renders inside the
sandboxed renderer, the e2e suite verifies the layout regions and live
ping display, and all workspace gates stay green.

### Out of Scope

Any real canvas, note editor, tabs logic, or state management beyond
the ping display. No new IPC surface. No styling system decisions —
plain CSS. Do not touch main/preload/utility code.

### Design/Approach

Add svelte + @sveltejs/vite-plugin-svelte to apps/desktop; renderer
entry mounts `App.svelte` (Svelte 5 runes mode). Components:
`App.svelte` (grid layout), `NotePane.svelte`, `Workspace.svelte`,
`StatusStrip.svelte` (calls `window.ew.project.ping()` on mount and
renders the JSON). Type `window.ew` via the existing preload type
export. Extend the existing Playwright `_electron` e2e with assertions
for the three regions and the ping text.

### Files to Touch

`apps/desktop/package.json`: svelte deps.
`apps/desktop/electron.vite.config.ts`: svelte plugin in renderer config.
`apps/desktop/src/renderer/`: main.ts mount, App.svelte, NotePane.svelte, Workspace.svelte, StatusStrip.svelte.
`apps/desktop/e2e/shell.spec.ts`: extend assertions (keep existing ones passing).

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [ ] Svelte 5 renders in the sandboxed renderer via electron-vite dev and build.
- [ ] Shell layout: note-pane region, tabbed workspace region with one placeholder tab, status strip.
- [ ] StatusStrip displays the live ping round-trip result.
- [ ] e2e asserts all three regions visible and ping text present; prior shell assertions still pass.
- [ ] `pnpm -r build`, `pnpm -r test`, `pnpm lint` green.

### Acceptance Criteria

**Scenario:** Shell renders with live process seam.
**GIVEN** the desktop app launched via Playwright `_electron`.
**WHEN** the window finishes loading.
**THEN** note-pane, workspace-tab, and status-strip regions are visible.
**AND** the status strip contains `"from":"utility"` (or equivalent rendered text) proving the ping ran through the real seam.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->
