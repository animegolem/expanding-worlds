---
node_id: AI-EPIC-002
tags:
  - EPIC
  - AI
  - infrastructure
  - electron
date_created: 2026-07-03
date_completed:
kanban_status: planned
AI_IMP_spawned:
---

# AI-EPIC-002-workspace-scaffolding

## Problem Statement/Feature Scope

No application code exists. RFC-0001 §13 fixes the technology
direction (Electron, TypeScript, Svelte 5, SQLite, a three-process
layout, and a package split), but there is no repository skeleton,
build system, test harness, or process wiring to put features into.
Every subsequent epic needs this foundation.

## Proposed Solution(s)

Stand up the monorepo per RFC §13.3: `apps/desktop` plus `packages/`
(domain, commands, persistence, canvas-engine, protocol, shared-ui) as
pnpm workspaces with strict TypeScript project references. Implement
the Electron shell per §13.2: main process (window lifecycle, menus,
narrow IPC routing), sandboxed renderer hosting a minimal Svelte 5
app, and a project utility process stub reachable only through the
preload boundary. Wire vitest for unit tests, Playwright for
end-to-end smoke tests, linting, and a packaging baseline. The
deliverable is a launchable empty application whose process and
package boundaries already enforce RFC rules (renderer executes no
SQL, durable work stays off the UI thread).

## Path(s) Not Taken

No Tauri or native-shell reconsideration — RFC §13 accepted Electron.
No feature code beyond a walking skeleton. Packaging polish
(signing, updater, distribution) is explicitly out of scope per RFC
§13's note that the packaging choice may be revisited.

## Success Metrics

- `pnpm install && pnpm dev` launches the shell with all three
  processes alive; `pnpm test` and `pnpm lint` pass in CI.
- A round-trip ping crosses renderer → preload → main → utility
  process and back, proving the seams RFC §11.3 depends on.
- Package boundary lint rule fails the build if renderer code imports
  persistence internals.

## Requirements

### Functional Requirements

- [ ] FR-1: pnpm workspace monorepo matching RFC §13.3 layout.
- [ ] FR-2: Electron main/renderer/utility process layout per §13.2 with sandboxed renderer and typed preload API.
- [ ] FR-3: Minimal Svelte 5 shell rendering a placeholder workspace.
- [ ] FR-4: vitest + Playwright + eslint + CI pipeline green.
- [ ] FR-5: IPC round-trip demonstration through the preload boundary.

### Non-Functional Requirements

- Strict TypeScript everywhere; no `any` in public package APIs.
- Renderer stays sandboxed with context isolation enabled.
- Build reproducible from clean checkout on macOS as primary target.

## Implementation Breakdown

IMPs to be cut when this epic activates.
