---
node_id: AI-IMP-230
tags:
  - IMP-LIST
  - Implementation
  - undo
  - P2
kanban_status: completed
depends_on: []
parent_epic:
confidence_score: 0.75
date_created: 2026-07-09
date_completed: 2026-07-09
---


# AI-IMP-230-universal-redo-invalidation

## Summary of Issue #1

Sol audit CA-005 (P2, probe-verified): §10.2 requires ANY new
durable command after an undo to clear redo. The coordinator
forwards only CAPTURED_COMMANDS to the stack, and
`UndoStack.record` early-returns on a null inverse WITHOUT
clearing redo — so note autosave, canvas creation, attach,
relink, and every other uncaptured commit leaves stale redo
standing (probe: redoDepth stayed 1 after UpdateNote). Redo can
then replay onto a changed world. Broader than AI-IMP-221's
gallery-specific bypass. Done means every committed durable
command reaches the coordinator; any non-undo/non-redo commit
clears redo unconditionally; whether it ALSO creates an undo
entry stays the capture-set question (AI-IMP-233's matrix).

### Out of Scope

- Which verbs get captured (233).
- The gallery gateway bypass (221 — but its fix must route
  through the same invalidation seam; coordinate).
- Group semantics (231).

### Design/Approach

One seam: the gateway (or wherever commits fan out) notifies the
coordinator of EVERY commit with its type + undo/redo provenance
flag. Coordinator: provenance undo/redo → stack bookkeeping as
today; otherwise clear redo ALWAYS, then push an entry only if
captured with a real inverse. Fix the null-inverse early return.
Tests: Sol's probe as regression (capture → undo → uncaptured
commit → redoDepth 0); redo survives its own undo/redo cycle.

### Files to Touch

`renderer/undo/undo-store.ts`, `undo-stack.ts` + specs; the
commit fan-out seam if commits bypass it today.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [x] Every durable commit reaches the coordinator; non-undo/redo
      commits always clear redo (null inverse included).
- [x] Probe regression + cycle tests green.
- [x] Gates: build, per-package units, lint, e2e in 4+ foreground
      shards.
- [x] HUMAN-TESTING entry appended at merge by the lead.

### Acceptance Criteria

**GIVEN** an undo followed by ANY new durable command
**THEN** redo is empty — Mod+Shift+Z can never replay onto a
world that moved on.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->

**Implemented (commit 1).** Added `UndoStack.invalidateRedo()` (clears
redo unconditionally, fires `onChanged` only when redo was non-empty).
The coordinator listener (`undo-store.ts`, `onCommittedAnywhere`) now
calls it for EVERY non-applying commit BEFORE the capture decision — so
uncaptured commits (note autosave `UpdateNote`, project verbs), commits
with a null inverse (`SetCanvasCamera`), and commits that land inside a
group but are never recorded all invalidate redo. The old null-inverse
early return in `record` is now moot: redo is cleared at the listener,
independent of whether `record` creates an entry. Kept `record`/
`recordGroup` clearing `#redo = []` (redundant now, preserves their unit
contract).

**Tests.** Ported Sol's CA-005 probe as three regressions in
`undo-store.test.ts` (through the real coordinator seam): (1) uncaptured
`UpdateNote` after an undo → redoDepth 0; (2) null-inverse
`SetCanvasCamera` after an undo → redoDepth 0 (mock now mirrors the real
null-inverse set so the premise is genuine); (3) self-cycle — two undos'
own inverse commits (gated by `applying`) do NOT wipe redo, redoDepth
climbs to 2. Added an e2e (`undo.spec.ts`): move → undo → a real
note-body autosave (`UpdateNote`, note-pane gateway, blur-flush) drops
redo to 0 and Shift+Mod+Z cannot replay.

**Residual gap flagged (NOT fixed here — out of fence).** Three renderer
sites commit durable commands by calling `window.ew.project.execute()`
with a HAND-ROLLED envelope, bypassing every `CommandGateway`, so their
commits never reach `onCommittedAnywhere` and thus never invalidate
redo: `views/TrashView.svelte` (RestoreRecord/PurgeRecord),
`views/SettingsView.svelte` (SetTrashRetention),
`views/GalleryActionBar.svelte` (gallery envelopes — this is AI-IMP-221's
known bypass). The e2e `exec()` helper does the same, confirming the
class. CA-005's probed defect (gateway-routed uncaptured commits) is
fully closed; these direct-execute view paths are a separate,
pre-existing gap whose files are outside this ticket's fence
(`views/**`). 221's gallery fix must route through this same
`invalidateRedo` seam; TrashView/Settings want the same when their
tickets land. Recommend a follow-up: either route these through a
gateway or add a lightweight commit broadcast at the preload/execute
boundary.

**Validation:** `pnpm -r build` clean · packages 1021 pass
(domain 58, shared-ui 1, commands 18, protocol 1, canvas-engine 387,
persistence 557) · desktop vitest 341 pass · `pnpm lint` clean · e2e in
4 foreground shards (see AI-IMP-233 note for the shared shard run):
a–d 44 pass + 1 pre-existing env failure (decorations font
enumeration under hidden windows, unrelated), e–i 65 pass + 1 flaky
(frames-drop multi-drop, passed on retry), j–r 75 pass, s–z 52 pass
(includes both new undo e2e).
