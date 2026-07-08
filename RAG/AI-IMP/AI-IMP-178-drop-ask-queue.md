---
node_id: AI-IMP-178
tags:
  - IMP-LIST
  - Implementation
  - drop
  - import
  - reentrancy
  - bug
kanban_status: planned
depends_on: []
parent_epic:
confidence_score: 0.9
date_created: 2026-07-08
---


# AI-IMP-178-drop-ask-queue

## Summary of Issue #1

Severity **P1** (M-03, lead-verified) from the AI-IMP-173 audit
(FAMILY 4, concurrent single-slot races). The multi-drop "how should
they land?" ask uses a single module-level `parked` slot; a second
multi-drop that arrives before the first ask is answered silently
discards the first batch's entire import.

Mechanism: `requestDropBehavior` awaits `readBehavior()` (a settings
read) then unconditionally sets the module-level `parked = req` with no
occupancy check. Drop batch 1 → its `run` closure (the only thing that
ever imports batch 1) is stored in `parked`; before answering, while
the next settings read is in flight, drop/paste batch 2 → batch 2
overwrites `parked`, and batch 1's closure is dropped with no trace.
Whatever the user then chooses imports only batch 2; batch 1's files
are lost silently. Cites:
`apps/desktop/src/renderer/chrome/drop-behavior.ts:51` (`let parked`),
`:86-88` (resolve reads `parked`), `:101-108` (`parked = req`, no
occupancy check); `apps/desktop/src/renderer/canvas/import-surfaces.ts:236-252`.

Done means: overlapping multi-drops queue instead of clobber; each
answered ask applies to exactly one batch and the next parked ask then
presents; no batch's import closure is ever discarded.

### Out of Scope

- The drop-behavior ask's copy/visual design — behavior only.
- The post-await drop-membership read (M-41, low-confidence) — not
  here.
- Any other single-slot race in the audit (undo `#applying` is
  AI-IMP-181; export temp dir is noted on the master list) — this
  ticket is drop-behavior only.

### Design/Approach

Replace the single `parked` slot with an array queue, copying the
exact house pattern already used by `mirror.ts`: it pushes onto a
`pendingAsk` array and only sets the active `ask` when it is null
(`mirror.ts:64-306`, specifically the `pendingAsk` push + `if
(ask===null)` gate around `:226-227`). Apply the same shape here:

- On a new multi-drop, push `req` onto a `pendingAsk[]` queue.
- Present the ask only if none is currently showing; otherwise the
  request waits its turn.
- When an ask is answered, apply the answer to the HEAD request (run
  its stored closure), then dequeue and present the next parked ask if
  any.

This preserves each batch's `run` closure until its own answer arrives,
so no import is discarded. Match `mirror.ts`'s null-guard exactly so
the two concurrent-ask surfaces stay consistent.

### Files to Touch

`apps/desktop/src/renderer/chrome/drop-behavior.ts`: replace `parked`
with a `pendingAsk[]` queue + `if (ask===null)` present-guard;
answer applies to head, then presents next (mirror `mirror.ts:64-306`).
`apps/desktop/tests/e2e/*` (drop/import spec): overlapping-multi-drop
e2e.
LOC: ~30–50.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [x] `parked` replaced with a `pendingAsk[]` queue mirroring
      `mirror.ts` (push + `if (ask===null)` present-guard).
- [x] Answering an ask applies to the head request's stored closure,
      then dequeues and presents the next parked ask.
- [x] No batch's `run` closure is discarded when a second multi-drop
      arrives mid-ask.
- [x] E2e: two overlapping multi-drops (batch 1, then batch 2 before
      answering batch 1); answer both asks; assert ALL files from both
      batches import.
- [x] Gates: `pnpm -r build && pnpm -r test && pnpm lint` + hidden
      e2e (`EW_TEST_HIDDEN_WINDOWS=1`).
- [ ] Append an `RAG/HUMAN-TESTING.md` entry: drop one multi-file set,
      then drop a second before answering; answer both; confirm every
      file lands.

### Acceptance Criteria

**Scenario: overlapping multi-drops both import fully.**
**GIVEN** a multi-file drop batch 1 whose "how should they land?" ask
is showing
**WHEN** the user drops/pastes a second multi-file batch 2 before
answering, then answers both asks
**THEN** every file in batch 1 imports
**AND** every file in batch 2 imports
**AND** no batch's import is silently discarded.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->

- Semantics the ticket left implicit, resolved from its own Done-means
  line ("each answered ask applies to exactly one batch and the next
  parked ask then presents"): `remember` persists the head's choice for
  FUTURE drops only — batches already queued behind the ask were
  dropped under `ask` and still present in turn, one ask per batch.
  This diverges deliberately from `mirror.ts` (whose one answer covers
  ALL parked drops) because the drop ask is per-batch by design: the
  modal names the batch's count, and choices like group-and-sort are
  per-batch compositions. Pinned in a unit test.
- The engagement-fade path also had the loss bug in miniature: fading
  with queued asks must resolve EVERY parked batch to `separate`, not
  just the head — otherwise the tail batches' closures would never run.
  Handled by draining the whole queue on disengage (each closure still
  fires, so no import is lost even when ignored).
- E2e flake, twice, before stabilizing: (1) the §8.2 4s idle fade
  raced slow cold runs and resolved batch 2's waiting ask to
  `separate` before the second click (Playwright clicks fire no
  pointermove) — fixed with the house `ew-test-set-engagement`
  hold:true pin; (2) counting placements immediately after the second
  answer raced the async frame composition — fixed by gating on
  `getFrameTree` root count per batch before asserting placement
  totals. Final spec passes 3/3 under --repeat-each.
- New unit suite `drop-behavior.test.ts` (7 tests) stubs `window.ew`
  under node vitest; fresh-worktree friction: `pnpm install` +
  `pnpm -r build` required before vitest resolves `@ew/protocol`
  (workspace deps resolve through dist, as CLAUDE.md warns).
- Gates run 2026-07-08: `pnpm -r build` green; unit tests green
  (packages 4 projects + desktop 312); playwright hidden e2e green
  201/201 (run as two sequential --shard halves to fit the harness's
  10-minute foreground cap — full coverage, one worker, same config);
  `pnpm lint` green.
