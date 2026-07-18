---
node_id: AI-IMP-224
tags:
  - IMP-LIST
  - Implementation
  - session
  - snapshots
  - design-first
kanban_status: planned
depends_on: []
parent_epic: [[AI-EPIC-007-lifecycle-trash-undo]]
confidence_score: 0.6
date_created: 2026-07-09
---


# AI-IMP-224-end-session

## Summary of Issue #1

Terra lifecycle review (2026-07-09) + earlier audit: the full
snapshot/checkpoint/lock-release ritual exists and runs — but ONLY
on quit. The visibly named **End Session** control
(MenuPopover.svelte) is disabled, so no user can deliberately
close a session without exiting the app, which blocks the intended
clean sync boundary and makes some ticket/testing wording untruthful
(docs speak as if End Session is live). Done means End Session is
a real end-to-end verb: click → the same ritual quit runs
(snapshot episode, checkpoint, writer-lock release) → a DEFINED
post-session state — which is the design decision that gates this
ticket (DESIGN-QUEUE "Lifecycle closure decisions" Q4: project
chooser vs closed-project shell vs app exit), plus what work is
deliberately excluded from that first surface (e.g. future vault
pull-back). No build until Q4 is ruled.

**Round-1 split (2026-07-17):** the selector/End Session surface stays
parked and this ticket remains open, with a hard dependency on the
future session-selector/launcher shell. The independently convicted
data-safety half lands now: snapshot/checkpoint returns a typed outcome,
and a failed or deferred snapshot aborts destructive GC while the quit
deadline and lock-release path remain bounded.

### Out of Scope

- Snapshot/push feature expansion beyond typed completion and the
  snapshot-before-GC fail-stop.
- Vault-mirror return path (deferred scope; the post-session
  surface only reserves its place).
- Multi-project management beyond whatever Q4's ruling names.

### Design/Approach

After Q4: wire the menu row to the existing quit-episode sequence
factored into a reusable "close session" op (main owns it; the
renderer requests). Post-session state per ruling. The row's
disabled state and tooltip retire; docs/tests that pretended it
was live get truthed. E2e: End Session → ritual runs (snapshot
count bumps, lock released — assert via a second open) → the ruled
surface shows; reopening the project works and recovery stays
quiet.

Authorized data-safety split: make `runSnapshot` always resolve a typed
success/failure (including flush, notes-tree, checkpoint, git, and
deferred-index outcomes), then gate `gc-sweep` on success. A failure
must still permit the independent 15-second quit bound and close/release
sequence. Prove the ordering through an injected failed snapshot whose
GC callback is never invoked.

### Files to Touch

- Data-safety split: `main/snapshot.ts`, a focused end-session data
  controller + tests, and the quit orchestration in `main/index.ts`.
- Parked surface: `chrome/MenuPopover.svelte`, the future selector
  shell, and end-to-end session lifecycle coverage.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [x] Q4 ruling verified; implementation dependency on the undrawn/
      unbuilt session-selector shell recorded.
- [x] Snapshot completion is typed and failure/defer is loud without
      trapping quit.
- [x] Snapshot failure aborts GC; failure-injection regression proves
      the destructive callback is never reached.
- [ ] End Session runs the full ritual and lands on the ruled
      surface; lock provably released; reopen clean.
- [ ] Stale "End Session is live" wording in docs/tests truthed.
- [ ] Gates: build, per-package units, lint, e2e in 4+ foreground
      shards.
- [ ] HUMAN-TESTING entry appended at merge by the lead (this is
      session 2's trust beat — end, reopen, everything where he
      left it).

### Acceptance Criteria

**GIVEN** an open project with unsaved-feeling recent work
**WHEN** the user clicks End Session
**THEN** the snapshot/checkpoint/release ritual completes, the
ruled post-session surface appears, and reopening finds every
piece of work exactly where it was — without ever quitting the
app.

**GIVEN** snapshot/checkpoint cannot complete during the bounded data
half
**WHEN** End Session or quit reaches the snapshot-before-sweep gate
**THEN** the outcome is typed and recorded as incomplete
**AND** `gc-sweep` is never invoked
**AND** the independent close/lock-release deadline still proceeds.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->

#### Round-1 source verification (2026-07-17)

- **Visible gap confirmed.** End Session is still disabled and inert
  (`MenuPopover.svelte:206-215`; `e2e/shell.spec.ts:535-545`). There is
  no production renderer-to-main verb; preload exposes only the
  component operations plus test-only snapshot/data hooks
  (`preload/index.ts:68-86,180-245`).
- **Q4 wording is stale but implementation remains interface-blocked.**
  RFC rev 0.70 now binds a selector-through-cover transition, running
  step sentence, cancelability until close, and a just-closed card that
  reads `put away — safe to sync` (`RFC:3124-3143`); DESIGN-QUEUE marks
  Q4 resolved (`DESIGN-QUEUE.md:431-435`). No project selector exists:
  App always mounts Workspace (`App.svelte:36-38`), and AI-IMP-293
  records the native chooser as an interim seam (`AI-IMP-293:114-119`).
  The current restore/open route relaunches and quits
  (`main/index.ts:966-980`), contradicting this ticket's same-app
  acceptance. Per the undesigned-interface fence, the lead must either
  make 224 depend on a separately drawn/built selector/session shell
  (recommended) or expressly authorize a minimum selector shell here.
  The native-folder/relaunch path is not an acceptable substitute.
- **Ritual scope corrected.** Quit has reusable tag settle, snapshot,
  GC, close, and lock release (`main/index.ts:1312-1365`;
  `utility/index.ts:299-307`; `project.ts:197-204`). Snapshot flushes
  editors, writes the readable notes tree when enabled, and checkpoints
  WAL (`snapshot.ts:518-549`). The standing vault mirror does not exist;
  notes-tree explicitly excludes vault/wiki and JSON Canvas output
  (`notes-tree.ts:16-18`), so “mirror when enabled” is presently a clean
  skip, not shipped machinery.
- **New fail-stop defect convicted.** `SnapshotEngine.runSnapshot()`
  swallows failure and returns void (`snapshot.ts:185-192,571-578`),
  while `runEndSessionData()` proceeds to destructive GC regardless
  (`main/index.ts:1323-1331`). That violates snapshot-before-sweep's
  recovery guarantee (`RFC:2869-2873`). A shared lifecycle controller
  needs a typed snapshot outcome and must not sweep after snapshot or
  checkpoint failure. AI-IMP-281 records completion unobservability
  (`AI-IMP-281:114-119`) but not this GC interaction.
- Existing snapshot/GC e2e invokes only test hooks
  (`e2e/snapshots.spec.ts:40-72`; `e2e/gc.spec.ts:9-39`). After the
  selector ruling, acceptance must exercise the real row, step/cancel
  state, dirty-editor flush, fail-stop ordering, close/release via a
  second writer, selector cover/card, and same-process reopen. The
  already-shipped next-open timeout perch (`main/index.ts:1352-1355`;
  `settings.ts:124-134`) should be retained, not duplicated.

#### Round-1 ruling and data-safety outcome

- Lead authorized the split: the surface half remains parked on the
  selector/launcher shell; no interim picker or renderer verb was built.
- `SnapshotEngine.runSnapshot` now returns typed success/failure and
  treats renderer flush, notes-tree, WAL checkpoint, git, and busy-index
  deferral as observable failures. The serialized chain still always
  resolves, so a backup fault cannot trap quit.
- `runSnapshotBeforeGc` makes successful snapshot completion the sole
  capability to invoke `gc-sweep`. Injection coverage proves a failed
  snapshot produces zero sweep calls; the main quit path records the
  failed backup while continuing its existing 15-second close bound.
- Validation at implementation checkpoint: workspace build passed;
  snapshot/end-session focused unit 11/11; desktop unit 581/581;
  GC/snapshot e2e 3/3; lint passed. The desktop unit run retains the
  known jsdom canvas diagnostic while all tests pass.
