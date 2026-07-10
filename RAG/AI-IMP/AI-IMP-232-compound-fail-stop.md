---
node_id: AI-IMP-232
tags:
  - IMP-LIST
  - Implementation
  - canvas
  - commands
  - P2
kanban_status: planned
depends_on: []
parent_epic:
confidence_score: 0.7
date_created: 2026-07-09
---


# AI-IMP-232-compound-fail-stop

## Summary of Issue #1

Sol audit CA-007 (P2, lead-spot-checked): several compound user
acts ignore intermediate CommandResults — move-and-frame
(host.ts ~1179-1208) can capture/release/arrange after
TransformContent FAILED; frame load (board-tooling ~286-309)
arranges after a failed capture; import (import-surfaces
~299-305) ignores a transform result then awaits a bare
`whenSceneApplied()` — an unqualified next-refresh wait with no
target, timeout, or cancellation, so a failed prerequisite can
hang the import (and its undo group, amplifying CA-006) forever
or resolve it against an unrelated event. Done means every
compound flow inspects each result and STOPS on failure (with the
user-visible refusal the first command would have shown), and the
bare waits become target-aware: keyed to canvas + revision or
required item IDs with try-now and bounded cancellation — the
AI-IMP-113 waitForItems discipline, never a hand-rolled wrapper.

### Out of Scope

- New wait primitives beyond what the host already exposes —
  EXTEND waitForItems/whenSceneApplied with targets if needed,
  in-place (that seam is CLAUDE.md-governed; keep it the one
  copy).
- Undo group identity (231).

### Design/Approach

Sweep the three named sites first, then grep every multi-command
flow for un-inspected `await execute`/`gateway.execute` chains
(list the full inventory in the ticket). Pattern: `const r =
await …; if (r.status !== 'committed') { surface + return }`.
For the import wait: whenSceneApplied gains an optional target
(revision or ids) OR import switches to waitForItems(ids) — pick
whichever the host already supports most cleanly. E2e: inject a
transform failure (revision conflict is the cheap injector) into
move-and-frame → no membership change, no arrange, refusal
surfaced; import with a failing transform → completes cleanly
(no hang), group closed.

### Files to Touch

`canvas/host.ts` (flow + wait seam), `canvas/board-tooling.ts`,
`canvas/import-surfaces.ts`, e2e for the injected failures.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [x] Full inventory of un-inspected compound chains recorded;
      all fail-stop with surfaced refusals.
- [x] No bare untargeted scene waits remain in compound flows;
      bounded cancellation everywhere.
- [x] Injected-failure e2e for move-and-frame and import.
- [x] Gates: build, per-package units, lint, e2e in 4+ foreground
      shards.
- [ ] HUMAN-TESTING entry appended at merge by the lead.

### Acceptance Criteria

**GIVEN** a compound gesture whose first command fails
**THEN** nothing downstream executes, the refusal is visible, and
nothing waits forever.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->

#### Inventory — every multi-command / runAsUndoGroup flow in the renderer

Classification of each `runAsUndoGroup` / multi-`execute` site by
whether a *downstream* command depends on an *intermediate* result
that could fail (the CA-007 hazard). Only the three named sites had a
dependent prerequisite with an un-inspected intermediate; all are in
the MAY-TOUCH set and are now fail-stop.

FIXED (dependent chains, were un-inspected — CA-007):
1. `canvas/host.ts` `resolveMoveWithMembership` (compound branch,
   ~1197): `TransformContent`(move) → `CaptureInFrame`×N →
   `ReleaseFromFrame` → `TransformContent`(arranges). None inspected.
   Now each result is checked; a non-committed step STOPS the group
   (no capture/release/arrange runs after a refused move). Refusal =
   the move's own authoritative snap-back on the next refresh (host
   has no toast channel — see Issues).
2. `canvas/board-tooling.ts` `loadIntoFrame` (~286): `CreatePlacement`
   loop (already skipped non-committed) → `waitForItems` (ignored) →
   `CaptureInFrame` (ignored) → arrange `TransformContent` (ignored).
   Now `waitForItems` bounds/stops, and capture+arrange are fail-stop
   with a surfaced `onError` refusal.
3. `canvas/import-surfaces.ts` `applyDropChoice` (~270):
   `importOneFile` loop (per-file resilient) → `waitForItems`
   (ignored) → arrange `TransformContent` (ignored) → **bare
   `whenSceneApplied()`** → `commitFrame` (already fail-stop) →
   `CaptureInFrame` (ignored). Now `waitForItems` bounds/stops, the
   arrange is fail-stop with surfaced `onError`, the bare wait is
   replaced by the targeted `whenSceneApplied({ revision })`, and the
   final capture surfaces its refusal.

ALREADY fail-stop (left unchanged):
- `canvas/host.ts` `commitFrame` (~1227): CreateNode →
  SetNodeAppearance → CreatePlacement, each inspected (`if
  (status !== 'committed') return`); returns null on failure.
- `note/NewBoardPalette.svelte:88` — fail-stop per the fresh-main
  brief (AI-IMP-239); untouched.

NOT the CA-007 hazard (recorded, not touched — outside MAY-TOUCH):
- `menus/ContextMenu.ts` (543/659/673/711/737/773): uses a local
  `execute` helper that inspects the result, surfaces `onError`, and
  returns a boolean; call sites guard with `if (await execute(...))`.
  Multi-command groups here are inspected batches / independent-target
  ops, not dependent chains with an un-inspected prerequisite.
- `canvas/decorations-ui.ts` (107/117/128) and the Flip/Lock loops in
  ContextMenu: batches of INDEPENDENT commands over a selection — a
  failure of one item does not corrupt the next; no downstream
  prerequisite.
- `canvas/charms-ui.ts` (275/369/471), `canvas/crop-editor.ts` (257),
  `tags/TagPanel.svelte:190`, `tags/TagAddField.svelte:52`,
  `note/panels.ts:799`, `note/note-editor.ts:195`,
  `note/NotePanel.svelte:501`, `chrome/bookmarks.ts:64`,
  `chrome/BookmarkMenu.svelte` (96/148): single-command groups (one
  durable verb per Mod+Z entry). No intermediate to gate a downstream
  command on. (charms-ui's fire-and-forget `execute` not surfacing a
  refusal is CA-008/appearance territory, not CA-007.)

#### Wait-seam extension (house-governed, one copy, extended in place)

`whenSceneApplied()` (host.ts) gained an optional
`{ revision?, timeoutMs? }`:
- `revision` makes the wait TARGET-AWARE — it resolves once an applied
  scene reflects at least that revision (try-now against a new
  `lastAppliedRevision`, updated in `refresh()` from `gateway.revision`
  observed at query time), instead of resolving on the next unrelated
  refresh (the "resolves against an unrelated event" defect).
- `timeoutMs` (default 2000, matching `waitForItems`) is a bounded
  backstop so a dropped/absent project-changed event can never hang a
  compound flow and its undo group — the CA-007 "wait forever" mode.
- A bare `whenSceneApplied()` keeps its original "resolve on the NEXT
  apply" contract, now also bounded. Import (the only caller) passes
  the committed arrange's `result.revision`. `CanvasScene` carries no
  revision and packages are read-only here, so revision targeting is
  tracked host-side rather than on the query result.

#### Failure injector (test seam)

`contextBridge` freezes `window.ew`, so the executor cannot be
monkeypatched from the page. Added a one-shot `__ewDebug.failNextCommand
(commandType)` (same mold as `setCamera`/`openCanvas`) that returns a
`conflict` for the next matching command through the host gateway. Its
`actualRevision` is set to the REAL observed `gateway.revision` (not
`expected + 1`) so the gateway's `noteRevision`-on-conflict is a no-op
— otherwise an advanced observed revision would false-conflict every
later command (the dispatcher's check is strict `!==`). The
move-and-frame e2e proves the injected conflict is one-shot and does
not wedge the gateway (the identical un-armed gesture then captures).

### Issues Encountered

- **Refusal surfacing for move-and-frame.** `host.ts` has no
  `onError`/toast channel — plain moves already surface refusal only
  as the authoritative snap-back on refresh (no toast anywhere in the
  host). Adding a toast channel to the host is out of this ticket's
  boundary, so the fix STOPS the compound (preventing the membership
  corruption) and lets the move's own snap-back be the refusal, as it
  is for every other host move. The e2e asserts membership + geometry
  are byte-identical to pre-drag. `board-tooling` and `import-surfaces`
  DO have `onError` and surface `describeFailure(...)` on their fixed
  steps.
- **Executor/gateway initializer cycle.** Wrapping the executor to
  read `gateway.revision` for the injector made TS infer `gateway` as
  `any` (referenced in its own initializer). Fixed by annotating the
  executor arrow's return type (`(envelope: CommandEnvelope):
  Promise<CommandResult>`), which breaks the inference cycle.
- **Placement/CreatePin loops kept resilient.** The per-item loops in
  `loadIntoFrame` and `applyDropChoice` still skip a non-committed item
  and continue (place what you can), matching the existing multi-file
  import contract — these are independent items, not a dependent
  prerequisite, so skip-and-continue is correct rather than fail-stop.
- **Known pre-existing e2e flakes (not mine):**
  `decorations.spec.ts` font-count (`> 3` vs exactly 3) failed then
  passed on retry (worktree-env issue per the brief);
  `import-batch.spec.ts` (the audit's recorded worst recurring flake,
  AI-IMP-173 follow-up) failed then passed on retry. Both marked
  flaky, both pre-existing.

### Validation

- `pnpm -r build` — pass.
- `pnpm --filter='./packages/*' test` — 18 + 387 + 570 + 1 + 1 = pass;
  `apps/desktop` `npx vitest run` — 357 passed (40 files). (The Pixi
  `getContext` jsdom stderr is pre-existing noise; all tests pass.)
- `pnpm lint` — pass.
- E2e in 6 foreground shards (`e2e/[a-d]`/`[e-g]`/`[h-i]`/`[j-n]`/
  `[o-r]`/`[s-z]`, coverage verified via `--list`): **46 · 49 · 17 ·
  47 · 30 · 50 = 239 passed**, 2 flaky (both the known pre-existing
  flakes above, each passed on retry). The new
  `compound-fail-stop.spec.ts` (2 tests) is in the `[a-d]` shard and
  passed.
