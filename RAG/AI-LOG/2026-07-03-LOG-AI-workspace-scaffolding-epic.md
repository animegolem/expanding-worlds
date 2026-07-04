---
node_id: LOG-2026-07-03-workspace-scaffolding
tags:
  - AI-log
  - development-summary
  - scaffolding
  - electron
closed_tickets: [AI-IMP-005, AI-IMP-006, AI-IMP-007, AI-IMP-008, AI-EPIC-002]
created_date: 2026-07-03
related_files:
  - pnpm-workspace.yaml
  - eslint.config.js
  - apps/desktop/electron.vite.config.ts
  - apps/desktop/src/main/index.ts
  - apps/desktop/src/preload/index.ts
  - packages/protocol/src/index.ts
  - .github/workflows/ci.yml
confidence_score: 0.95
---

# 2026-07-03-LOG-AI-workspace-scaffolding-epic

## Work Completed

Executed AI-EPIC-002 end to end. Lead-built: AI-IMP-005 (pnpm
monorepo per RFC 13.3 — six @ew/* stub packages, strict shared
tsconfig, vitest per package, eslint flat config with the RFC 11.1
renderer/persistence boundary rule verified by fixture, clean-checkout
gate proven via temp clone) and AI-IMP-006 (Electron three-process
shell per RFC 13.2 — main routes IPC and forks the utility stub,
sandboxed renderer behind a typed window.ew preload bridge,
@ew/protocol carrying the seam types, Playwright _electron e2e proving
the renderer→preload→main→utility ping round-trip and sandbox
integrity). Delegated to parallel worktree agents and merged after
review: AI-IMP-007 (Svelte 5 runes-mode shell — note pane, tabbed
workspace, status strip rendering the live ping; e2e extended) and
AI-IMP-008 (root pnpm check / check:ci chains, GitHub Actions
workflow with desktop e2e excluded pending display support,
actionlint-clean). Final verification: full `pnpm check` including the
desktop e2e run by the lead on merged master.

## Session Commits

- c474e02 EPIC-002 cut into IMP-005..008
- (IMP-005 commit) pnpm monorepo scaffold
- d06a822 AI-IMP-006 Electron shell with typed seam
- 0b4c5c2 (agent) AI-IMP-008; merged after review
- 1fcf927 (agent) AI-IMP-007; merged after review
- Closure commit: epic completed, INDEX regenerated, this log

## Issues Encountered

- The Playwright/Electron launch stall was self-inflicted: custom
  rollupOptions clobbered electron-vite's default externals, bundling
  the electron npm shim into the main bundle (crash before any window).
  Fix: external: ['electron'] in main and preload. A costly lesson in
  checking one's own config before suspecting version skew.
- Electron 43 breaks electron-vite 5 (cannot resolve
  electron/package.json through 43's exports map). Pinned electron@39;
  revisit when electron-vite catches up.
- electron install.js silently fails to extract the macOS binary
  (dist/ left with only LICENSES.chromium.html, exit 0). Workaround:
  ditto -x -k <cached zip> dist/ + path.txt. Reproduced independently
  by both agents; documented in tickets, CI comments — a preflight
  script is worth considering if it keeps biting.
- pnpm add/remove churn dropped the hidden hoist link
  (.pnpm/node_modules/electron) that electron-vite resolves through;
  only a full node_modules reinstall restored it.
- Node 26 ships without corepack; pnpm installed globally via npm.
- Known warnings accepted: electron-vite 5 peers vite ^5..^7 vs
  workspace vite 8 (works); fresh worktrees need packages/* built once
  before apps/desktop tsc passes (pnpm -r build ordering handles it —
  include in future agent briefs).

## Tests Added

- One vitest smoke test per stub package (six packages).
- apps/desktop/e2e/shell.spec.ts: Electron launch, title, typed ping
  round-trip renderer→preload→main→utility, sandbox require check,
  three shell-region visibility assertions, live status-strip text.
- Boundary lint verified by transient fixture (not committed).
- Root pnpm check / check:ci gate chains; CI workflow ready for a
  remote.

## Next Steps

EPIC-003 (domain & persistence core) is next on the critical path:
SQLite schema for all RFC §4 records, UUIDv7, command envelope,
project locking/recovery, staged import, FTS5, and the §5 invariant
test suite — the utility-process stub from IMP-006 is its host, and
@ew/protocol grows the real Project API types. Read RAG/INDEX.md, the
EPIC-003 file, and RFC §4/§5/§10/§11 before cutting IMPs. Decompose
with care: schema+invariants, command pipeline, project service+
locking, staged import+FTS are plausible seams. The delegation model
continues to work; keep agent briefs carrying the electron binary
workaround and the packages-build-order note.
