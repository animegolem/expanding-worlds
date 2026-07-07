---
node_id: AI-IMP-164
tags:
  - IMP-LIST
  - Implementation
  - persistence
  - undo
kanban_status: planned
depends_on:
parent_epic:
confidence_score: 0.75
date_created: 2026-07-07
date_completed:
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

- [ ] releaseConnectorAnchors returns prior anchor state; delete
      inverse carries it.
- [ ] restorePlacementRow re-binds; old payloads without the field
      still restore (tolerant handler).
- [ ] Red-green unit: connector re-binds on undo; batch-delete
      ordering covered.
- [ ] Gates: `pnpm -r build`, `pnpm -r test`, `pnpm lint`, desktop
      e2e hidden.
- [ ] HUMAN-TESTING entry appended at merge by the lead.

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
