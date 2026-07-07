---
node_id: AI-IMP-169
tags:
  - IMP-LIST
  - Implementation
  - testing
  - sign-off
kanban_status: completed
depends_on: []
parent_epic: [[AI-EPIC-008-export-import-signoff]]
confidence_score: 0.85
date_created: 2026-07-07
date_completed: 2026-07-07
---


# AI-IMP-169-signoff-gap-tests

## Summary of Issue #1

The EPIC-008 FR-5 evidence map walked all thirty §17 slice items
against the suite. Four clauses are genuinely uncovered — everything
else is either tested or re-ruled covered-by-design with citations
(item 23's retention default: settings.test.ts already asserts the
seeded `'never'`; item 25: process.spec's lock-contention and
import-crasher recovery; item 26: the round-3 exact table diff).
This ticket closes the four gaps with tests so PHASE-1-SIGNOFF.md
cites green evidence, not promises:

1. **Item 8 "rename a tag"** — tag create/assign/panel are tested;
   the rename verb has no e2e.
2. **Item 11 canvas cycle** — "navigation, graph queries, and export
   do not recurse indefinitely" has no cycle-shaped test anywhere.
3. **Item 19 cross-canvas undo decline** (rev 0.58 presence fence) —
   the decline toast naming the other board, stack intact, then
   applying after navigating there.
4. **Item 24 outline exclusions** — trashed records excluded by
   default; drawn connectors appear nowhere as outline rows
   (the connectors-are-not-edges invariant's only Phase 1 checkpoint
   since the graph takeover deferred at rev 0.62).

Done means all four are green in the hidden-window suite and the
sign-off audit can cite spec file + test title for every §17 clause
it marks covered.

### Out of Scope

- Item 29's "retitle the frame" — the verb is a declared
  COMING_SOON stub (inventory.ts: "frame naming arrives with frame
  labels"); the audit records it as a gap absorbed by AI-IMP-138.
- Fixing any product defect a new test exposes. A red test here is
  a FINDING for the audit — report it, cut a fix ticket; do not
  bury a behavior change inside a test-only ticket.
- The audit document itself (the lead writes PHASE-1-SIGNOFF.md
  after this closes).

### Design/Approach

Extend existing specs rather than minting new files — each gap is
one scenario in an established suite with helpers already shaped for
it. Await `waitForItems`/`whenSceneApplied` after every navigation
per the house rule; no hand-rolled waits.

- **Tag rename** (tags.spec.ts): create tag, assign to a node, open
  the tag panel, rename via the panel's rename affordance, assert
  the panel title, the node's chip, and quick-open/search reflect
  the new name; old name gone.
- **Cycle walk** (navigation.spec.ts or export-import.spec.ts —
  wherever the export helpers live is the better host): make node
  A's canvas contain a placement of A itself (legal per §4.3);
  navigate in twice (path grows, no hang), open the outline takeover
  (recursive query terminates), export the project and import the
  archive back (the §16 walker must not recurse) — assert both
  complete and the imported project opens.
- **Cross-canvas decline** (undo.spec.ts): move a placement on
  board B, navigate home to A, Mod+Z → assert the decline notice
  names B and the undo stack did NOT pop (a second Mod+Z on an
  A-local edit still works); navigate to B, Mod+Z → the move
  reverts. Rev 0.58 semantics exactly — decline is not an error.
- **Outline exclusions** (outline.spec.ts): board with a note node,
  a drawn connector between two placements, and a second node moved
  to Trash; open outline → trashed node's row absent, connector
  present as NO row/edge anywhere in the takeover; restore the
  node → row returns on reopen.

### Files to Touch

`apps/desktop/e2e/tags.spec.ts`, `navigation.spec.ts` (or
`export-import.spec.ts`), `undo.spec.ts`, `outline.spec.ts`;
`helpers.ts` only if a cycle-builder helper earns reuse. Test-only —
zero `src/` changes expected (see Out of Scope if red).

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [x] Tag rename e2e green: panel title, chip, and search/quick-open
      all follow the rename.
- [x] Cycle e2e green: navigation ×2, outline open, export AND
      re-import all terminate on a self-cycle.
- [x] Cross-canvas decline e2e green: notice names the board, stack
      survives, step applies after navigating there.
- [x] Outline e2e green: trashed excluded by default, connectors
      never rows, restore brings the row back.
- [x] Full gates: `pnpm -r build && pnpm -r test && pnpm lint` +
      desktop e2e hidden (194/194, 4.7m), tee'd to a scratchpad log.
- [x] Any red = finding documented in Issues Encountered + audit
      note; no product code changed here.

### Acceptance Criteria

**GIVEN** the §17 evidence map's four uncovered clauses
**WHEN** the suite runs hidden on current main
**THEN** each clause has a named green test in the spec files above,
and PHASE-1-SIGNOFF.md can cite file + title for items 8, 11, 19,
and 24 with no "pending" verdicts left except item 29's ticketed
frame-retitle gap.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->

- **The cross-canvas walk found a real defect on first run**: the
  decline toast NEVER named the board — `boardLabel()` read a
  `noteTitle` field that `getOutlineTree` doesn't return (it returns
  `label`), hidden by an `as`-cast interface and a unit harness that
  injects boardLabel as a dep. Fixed as AI-IMP-172 (committed
  before this ticket so the test lands green); the e2e is its
  regression guard. Exactly the class of gap this ticket existed to
  close — the mechanism was unit-tested, the WIRING was not.
- Item 8's rename clause double-ruled: no UI verb exists (only the
  command) — AI-IMP-171 cut for the affordance; the e2e here is
  exec-driven propagation, honest about that in its comment.
- Two clauses re-ruled covered during recon (evidence-map misses,
  same class as item 25): item 23's retention default
  (settings.test.ts asserts the seeded 'never') and item 24's
  query-level trash exclusion (queries-structure.test.ts:399) — the
  e2e here adds the command-path walk (real TrashNode/RestoreRecord
  through the takeover) and the connector clause.
- One stumble: the decline toast rides the single-slot 'undo'
  SURFACE, whose name becomes the data-testid — asserting
  getByTestId('toast') found nothing. Surface names are testids for
  every status toast.
