---
node_id: AI-IMP-252
tags:
  - IMP-LIST
  - Implementation
  - persistence
  - consolidation
kanban_status: planned
depends_on: []
parent_epic: [[AI-EPIC-027-hardening-and-consolidation]]
confidence_score: 0.75
date_created: 2026-07-10
date_completed:
---


# AI-IMP-252-node-appearance-codec

## Summary of Issue #1

Audit HC-004 (`RAG/CODE-AUDIT-2026-07-10-HELPER-CONSISTENCY.md`):
the node-appearance↔columns mapping is encoded three times —
`CreatePin` (`handlers/pin.ts:50-87`, node insert `:163-176`),
`SetNodeAppearance` (`handlers/nodes.ts:429-491`, reverse decoder
`:493-515`), and `UnplaceCard`'s inverse restore
(`handlers/pin.ts:483-506`) — and validation has already drifted:
CreatePin rejects empty dot colors and icon names
(`pin.ts:60-69`); SetNodeAppearance copies those strings unchecked
(`nodes.ts:449-465`). This is reachable at runtime because the
command registry's payload typing is compile-time only
(`packages/commands/src/registry.ts:73-83`) — the handler owns
runtime validation. Done means: ONE handler-side codec that
validates + encodes a `NodeAppearance` into fixed columns and
decodes columns for inverses; all three command paths use it;
malformed payloads (including empty dot/icon) are pinned by tests;
every kind round-trips.

### Out of Scope

- Renderer appearance UI (charms, pickers) — persistence encoding
  only.
- Any SQLite CHECK constraint — appearance kinds are a GROWING
  domain; validation stays in command handlers (CLAUDE.md rule,
  migration-0006 lesson).
- New appearance kinds or semantics changes.

### Design/Approach

New module beside the handlers (e.g.
`packages/persistence/src/handlers/node-appearance.ts`):
`validateNodeAppearance(payload, { allowedKinds? })` returning a
typed appearance or a structured error (codes matching current
handler errors — do not rename error codes), plus
`encodeAppearanceColumns(appearance)` and
`decodeAppearanceColumns(row)`. Callers pass an explicit
allowed-kind set where command vocabularies differ (CreatePin's
creation vocabulary vs SetNodeAppearance's full set) — the codec
must not silently widen either. SetNodeAppearance inherits the
empty-dot/icon rejection, closing the drift. UnplaceCard's inverse
restores via `decode→encode` so a future column change has one
home.

PRE-IMPLEMENTATION REVIEW (standing process): verify the cited
lines and CURRENT error codes/messages against source before
coding; record corrections here. Existing tests cover unknown
kinds and image-asset presence but NOT empty dot/icon
(`handlers/nodes.test.ts:268-285`, `:320-325`) — confirm and fill.

### Files to Touch

- `packages/persistence/src/handlers/node-appearance.ts` (new):
  codec + focused unit tests.
- `packages/persistence/src/handlers/pin.ts`: CreatePin encode +
  UnplaceCard inverse via codec.
- `packages/persistence/src/handlers/nodes.ts`: SetNodeAppearance
  + its decoder via codec.
- `packages/persistence/src/handlers/nodes.test.ts`,
  pin/placement tests: empty dot/icon rejection on BOTH forward
  paths, per-kind round-trip, inverse restore fidelity.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [ ] Pre-implementation review: HC-004 citations + current error
      codes verified; corrections recorded in this ticket.
- [ ] Codec module: validate (with allowed-kind set), encode,
      decode; unit tests round-trip every appearance kind.
- [ ] CreatePin, SetNodeAppearance, and UnplaceCard inverse all
      route through the codec; no local column mapping remains.
- [ ] SetNodeAppearance rejects empty dot color / icon name with
      the same structured error CreatePin uses (regression test).
- [ ] Existing structured error codes and messages preserved
      (no consumer breakage; grep consumers to confirm).
- [ ] `pnpm -r build`, package units green. (Desktop vitest +
      e2e supplied by the lead at merge.)

### Acceptance Criteria

**Scenario:** malformed runtime payload on the drifted path.
**GIVEN** a `SetNodeAppearance` command whose payload carries an
empty dot color
**WHEN** the handler validates via the shared codec
**THEN** it fails with the same structured error CreatePin returns
**AND** every appearance kind encodes → decodes → encodes to
identical columns across all three command paths.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->
