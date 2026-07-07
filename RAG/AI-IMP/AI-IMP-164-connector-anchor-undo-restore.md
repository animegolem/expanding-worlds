---
node_id: AI-IMP-164
tags:
  - IMP-LIST
  - Implementation
  - persistence
  - undo
kanban_status: completed
depends_on:
parent_epic:
confidence_score: 0.75
date_created: 2026-07-07
date_completed: 2026-07-07
---


# AI-IMP-164-connector-anchor-undo-restore

## Summary of Issue #1

Codex review round 2, P2, VERIFIED: `deletePlacementRow`
(handlers/lifecycle.ts ~151) releases connector anchors before
deleting the placement, but the inverse payload records only
placement fields, and `restorePlacementRow` (~190) recreates the
placement alone — so Mod+Z after a delete brings the image back
with its previously attached connectors left free-floating. The
committed delete is correct; only the undo round-trip loses
fidelity. Done means undo of a placement deletion re-binds every
anchor the delete released, proven by a red-green test.

### Out of Scope

- Redo semantics beyond symmetry (redo re-deletes and re-releases —
  falls out of the same payload).
- Connector STYLE/geometry beyond what release mutated.

### Design/Approach

Read `releaseConnectorAnchors` (handlers/placements.ts ~70) first:
capture exactly what it mutates (anchor columns; any geometry
baking) BEFORE mutation, return the prior tuples
`{decorationId, side, priorAnchorPlacementId, priorGeometry?}`.
Extend the RestorePlacement inverse payload with an optional
`releasedAnchors` array (@ew/commands payload type — optional field,
same command version, handler tolerates absence for old records);
`restorePlacementRow` re-binds them after recreating the placement.
Mind delete-BATCH ordering: anchors re-bind only after their
placement exists (restore order within the batch already restores
placements first — verify, don't assume). Unit red-green in
handlers/lifecycle.test.ts: place two items, connect them, delete
one, undo via the inverse, assert the connector's anchor columns
point at the restored placement again. E2E if cheap via the undo
spec's existing connector fixtures.

### Files to Touch

`packages/commands/src/payloads/lifecycle.ts` (optional field).
`packages/persistence/src/handlers/lifecycle.ts`,
`handlers/placements.ts` (+ tests).

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [x] releaseConnectorAnchors returns prior anchor state; delete
      inverse carries it.
- [x] restorePlacementRow re-binds; old payloads without the field
      still restore (tolerant handler).
- [x] Red-green unit: connector re-binds on undo; batch-delete
      ordering covered.
- [x] Gates: `pnpm -r build`, `pnpm -r test`, `pnpm lint`, desktop
      e2e hidden.
- [x] HUMAN-TESTING entry appended at merge by the lead.

### Acceptance Criteria

**GIVEN** two placed images joined by a connector
**WHEN** one placement is deleted and Mod+Z pressed
**THEN** the placement returns WITH the connector re-anchored to
it, and redo releases it again.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->

- **What `releaseConnectorAnchors` mutates (captured before changing it):**
  for each decoration whose `anchor_start_placement_id` or
  `anchor_end_placement_id` equals the deleted placement, it (a) bakes
  the placement's `(x, y)` into `data.start` and/or `data.end` for the
  freed side(s), (b) nulls the freed anchor column(s), (c) stamps
  `updated_at`. Nothing else. It returned only the changed decoration
  ids.

- **Approach.** Split into `releaseConnectorAnchorsCapturing` (returns
  `ReleasedConnectorAnchor[]` = `{decorationId, freedStart, freedEnd,
  priorData}`, where `priorData` is the decoration's `data` blob BEFORE
  coordinates were baked) and a thin id-only `releaseConnectorAnchors`
  wrapper kept for the purge paths. `deletePlacementRow` now uses the
  capturing variant and stores the tuples on the `RestorePlacement`
  inverse via a new OPTIONAL `releasedAnchors?: ReleasedConnectorAnchor[]`
  field (same command version). `restorePlacementRow` re-binds each
  released side AFTER the placement row is re-inserted, restoring only
  the freed side's `start`/`end` key (or deleting it if it was absent
  in `priorData`) and setting the corresponding anchor column back to
  the placement id.

- **Tolerance for old records.** The re-bind loop is `for (const anchor
  of payload.releasedAnchors ?? [])`, so pre-AI-IMP-164 command-log
  records (no field) restore the placement alone exactly as before.

- **Per-side inversion, not whole-blob.** Restore only touches the
  side(s) a given delete actually freed, reading the decoration's
  CURRENT data first. This is what makes the batch case order-independent
  (see below): two separate re-binds of the same connector never clobber
  each other's geometry.

- **Batch-order finding (verified, not assumed).** `RestoreContent`
  restores all placements first, then recreates decorations. A connector
  only appears in a placement's `releasedAnchors` if it SURVIVED the
  delete (a connector deleted alongside its anchor is captured by
  `deleteDecorationRow` with its anchor columns intact and never enters
  `releasedAnchors`). So every re-bind UPDATE targets a decoration row
  that is live at re-bind time — the placements-first / decorations-last
  order is correct and the per-side write keeps the two-endpoints-deleted
  case exact regardless of which placement restores first. Covered by the
  new batch test (both endpoints deleted via `DeleteContent`, connector
  survives, both re-bind on undo).

- **RED proof.** With the three source files stashed (tests kept), the
  two new tests failed at HEAD on the re-bind assertion — `expected null
  to be <pA>` (anchor column still null after undo) — while the other 517
  persistence tests passed. Restoring the source turned both green.

- **Redo symmetry.** Asserted in both tests: the restore result's inverse
  is `DeletePlacement` / `DeleteContent`, and re-running it re-releases
  the anchors (column back to null, position re-baked).

- **Optional e2e skipped (deviation, justified).** `apps/desktop/e2e/
  undo.spec.ts` has NO connector/anchor fixtures — connector e2e fixtures
  live in `decorations.spec.ts`/`slice.spec.ts`. Building a connector
  round-trip there was not "cheap" per the ticket's condition, and the
  fidelity is fully exercised by the handler-level red-green. Skipped.

- **DeleteDraftPlacement left as-is.** Its inverse (CreatePlacement) does
  not restore anchors, but a just-created placement cannot yet have a
  committed connector anchored to it (the undo stack unwinds the connector
  first), so it is benign and out of this ticket's scope.
