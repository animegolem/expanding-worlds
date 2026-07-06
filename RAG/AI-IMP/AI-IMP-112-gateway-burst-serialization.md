---
node_id: AI-IMP-112
tags:
  - IMP-LIST
  - Implementation
  - commands
  - canvas-engine
kanban_status: in-progress
depends_on:
parent_epic: [[AI-EPIC-022-fleet-friction]]
confidence_score: 0.8
date_created: 2026-07-06
date_completed:
---

# AI-IMP-112-gateway-burst-serialization

## Summary of Issue #1

`CommandGateway.execute()` reads its observed `#revision` at
envelope-build time and advances it only after the await resolves,
so N parallel executes all stamp the SAME stale
expectedProjectRevision and every commit after the first fails the
§10.2 optimistic check. Three tickets hit this wall independently
(IMP-044/064 papered over with `checkRevision:false`; IMP-079
hand-rolled a promise chain at ONE call site). Done = the gateway
serializes internally so bursts chain with the check ON, the
IMP-079 workaround is retired, and a guard test pins the behavior
forever.

### Out of Scope

- The cross-gateway self-conflict (two gateway instances synced
  via async push): the documented rule stands — id-targeted
  mutations of a stable record may pass `checkRevision:false`.
  Document WHY in the gateway doc comment; do not build a shared
  revision bus.
- Batching/coalescing commands; any protocol change.

### Design/Approach

Inside `packages/canvas-engine/src/command-gateway.ts`: an
internal promise chain (`#tail = this.#tail.then(...)`) so each
execute builds its envelope only after the previous execute in the
same gateway has committed and advanced `#revision`. Rejections
must not poison the chain (catch before chaining the next). The
public signature and result contract are unchanged — callers that
fire-and-forget in parallel now just work. Then find the IMP-079
serialization at its Workspace/gallery-place call site and remove
the hand-rolled chain in favor of plain parallel calls (behavior
now guaranteed by the gateway). Doc comment on the gateway: the
burst rule, and the standing checkRevision:false rule for
stable-record mutations with the IMP-044/064 rationale.

### Files to Touch

`packages/canvas-engine/src/command-gateway.ts`: the chain +
doc comment.
`packages/canvas-engine/src/command-gateway.test.ts` (or the
existing test home): the guard test.
`apps/desktop/src/renderer/**` (IMP-079 call site, likely
Workspace.svelte or views/): retire the manual chain — grep for
its comment; if retiring is not mechanical, leave it and report.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and
**think**. Have you validated all aspects are **implemented** and
**tested**?
</CRITICAL_RULE>

- [x] Gateway serializes: guard test proves FIVE PARALLEL executes
      of independent CreatePlacements all commit with the
      revision check ON (this test FAILS against the old
      gateway — verified by reverting locally: 4/5 came back
      `conflict`).
- [x] A rejected command does not poison the chain: the next
      queued execute still runs (two units — a thrown IPC error
      and a typed `error` result, each mid-chain).
- [x] IMP-079's manual serialization retired (mechanical: kept
      the visual cascade offset, dropped the `placeQueue` chain).
- [x] Doc comment records the burst rule and the
      checkRevision:false rule with the IMP-044/064 rationale.
- [x] Full gates including the board/gallery e2e specs that
      exercise placement bursts.

### Acceptance Criteria

**GIVEN** five parallel gateway.execute CreatePlacement calls
**WHEN** they race
**THEN** all five commit under the optimistic check
**AND** a deliberately conflicting command still fails cleanly
without blocking subsequent commands.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->

- Chain design. `execute()` now builds a `run` promise that chains
  off `#tail` (the prior execute's settle) and only then calls the
  private `#run`, which reads `#revision` and builds the envelope.
  `#tail` is reassigned to `run.then(noop, noop)` so BOTH fulfilment
  and rejection settle the chain without propagating — a failed or
  thrown command cannot stall later queued executes. The caller still
  receives `run` itself (not the swallowed tail), so its own typed
  failure or thrown error reaches it unchanged. Public signature and
  result contract are untouched.
- Reverted-gateway proof. Temporarily inlined the old
  build-envelope-then-await body (no chain) and ran the burst guard:
  it failed with `[ 'committed', 'conflict', 'conflict', 'conflict',
  'conflict' ]` — exactly the defect (only the first command in the
  parallel burst commits; the rest stamp the stale revision and
  conflict). Restored the chain; 295/295 green.
- IMP-079 retired (mechanical). Workspace.svelte's `onPlaceNode`
  had TWO burst adaptations tangled together: a visual cascade
  offset (`placeBurst` / `PLACE_CASCADE_OFFSET`) and a `placeQueue`
  promise chain doing the serialization. Only the serialization was
  IMP-079's workaround — removed it in favor of a plain
  fire-and-forget `h.gateway.execute(...).then(ok, err)`. The visual
  cascade stays (unrelated concern: keeps burst placements from
  stacking at dead center). The gallery bulk-place e2e still passes.
- Validation (exact): `pnpm -r build` OK; `@ew/canvas-engine test`
  295 passed (25 files); `desktop test:unit` 39 passed (5 files);
  `pnpm lint` clean; playwright `import.spec.ts panels.spec.ts`
  13 passed; plus `gallery-selection.spec.ts gallery-scope.spec.ts`
  7 passed (the actual burst-place path).
- Friction. Fresh worktree had the husk Electron dist — applied the
  documented dist-copy + path.txt fix to launch e2e. Initial lint
  failure on an unused `_envelope` param in one unit; dropped it.
