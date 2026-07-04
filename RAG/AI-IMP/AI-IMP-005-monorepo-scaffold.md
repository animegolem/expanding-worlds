---
node_id: AI-IMP-005
tags:
  - IMP-LIST
  - Implementation
  - infrastructure
kanban_status: completed
depends_on: AI-EPIC-002
parent_epic: [[AI-EPIC-002-workspace-scaffolding]]
confidence_score: 0.85
date_created: 2026-07-03
date_completed: 2026-07-03
---

# AI-IMP-005-monorepo-scaffold

## Monorepo scaffold per RFC 13.3

No workspace exists. Create the pnpm monorepo: `apps/desktop` plus
stub packages `domain`, `commands`, `persistence`, `canvas-engine`,
`protocol`, `shared-ui`, wired with strict TypeScript project
references, eslint (including the renderer/persistence boundary rule),
and vitest. Done means: `pnpm install`, `pnpm -r build`, `pnpm -r
test`, and `pnpm lint` all pass from a clean checkout, and a
boundary-violation fixture fails lint.

### Out of Scope

Electron itself (IMP-006), Svelte (IMP-007), CI workflows (IMP-008),
any real domain logic — stubs only. The spike/ directory stays outside
the workspace.

### Design/Approach

pnpm workspaces (`apps/*`, `packages/*`); a `tsconfig.base.json` with
strict settings shared via extends; each package: `src/index.ts` stub
export + one vitest test; eslint flat config at the root with
`no-restricted-imports` forbidding `@ew/persistence` (and sqlite
modules) anywhere under `apps/desktop/src/renderer`. Package names use
the `@ew/` scope. Node engversion pinned via `.nvmrc` and engines.

### Files to Touch

`pnpm-workspace.yaml`, root `package.json`, `tsconfig.base.json`,
`eslint.config.js`, `.nvmrc`: new.
`packages/{domain,commands,persistence,canvas-engine,protocol,shared-ui}/`:
package.json, tsconfig.json, src/index.ts, src/index.test.ts each.
`apps/desktop/`: placeholder package.json + tsconfig (filled by 006).

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [x] pnpm workspace + root scripts (build, test, lint) resolve and run.
- [x] Six stub packages with strict tsconfig references build via `pnpm -r build`.
- [x] One vitest test per package passes via `pnpm -r test`.
- [x] eslint flat config green; boundary fixture importing @ew/persistence from a renderer path fails lint (verified, then fixture removed).
- [x] Clean-checkout verification: fresh clone into temp dir installs and passes all gates.

### Acceptance Criteria

**Scenario:** Fresh checkout quality gates.
**GIVEN** a clean clone of the repository with pnpm available.
**WHEN** `pnpm install && pnpm -r build && pnpm -r test && pnpm lint` run.
**THEN** all commands exit zero.
**AND** adding `import '@ew/persistence'` to a renderer source file makes `pnpm lint` fail.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->

Completed 2026-07-03. Notes: Node 26 no longer bundles corepack, so
pnpm was installed globally via npm. pnpm 11's allowBuilds approval
flow required whitelisting esbuild's postinstall in
pnpm-workspace.yaml. Boundary rule verified by fixture (lint fails on
@ew/persistence import from renderer path, passes after removal).
Clean-checkout verification done via local git clone into a temp dir:
install, build, test, lint all green.
