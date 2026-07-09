---
node_id: AI-IMP-235
tags:
  - IMP-LIST
  - Implementation
  - persistence
  - decorations
  - P2
kanban_status: planned
depends_on: []
parent_epic:
confidence_score: 0.85
date_created: 2026-07-09
---


# AI-IMP-235-anchor-canvas-equality

## Summary of Issue #1

Sol audit CA-012 (P2, lead-verified): `validateAnchor`
(handlers/decorations.ts) checks an anchor's placement is active
and project-owned but NOT that its canvas_id matches the
decoration's canvas — the authoritative boundary accepts a
connector on canvas A anchored to a placement on canvas B. The
scene can't represent it (falls back to free-point while the DB
claims a live anchor), and delete/restore behavior is
unpredictable. Current call sites happen to supply same-canvas
items; the invariant is unenforced exactly where the RFC says
domain rules live (command handlers). Done means create/update
anchor validation requires exact canvas equality (typed refusal),
covered by cross-canvas create, update, and re-anchor tests.

### Out of Scope

- Connector rendering (correct given valid data).
- The connector-store epic (EPIC-020).

### Design/Approach

Thread the decoration's canvas_id into validateAnchor; refuse on
mismatch with the handlers' existing refusal grammar. Audit the
three call paths (~47-73, ~83-105, ~164-197) so update and
re-anchor validate against the DECORATION'S stored canvas, not a
payload claim. Migration check: assert no existing cross-canvas
rows in the wild seed/test fixtures (a SELECT in the spec, not a
schema migration).

### Files to Touch

`packages/persistence/src/handlers/decorations.ts` + spec.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [ ] Exact canvas equality enforced on create/update/re-anchor;
      typed refusal.
- [ ] Cross-canvas tests for all three paths.
- [ ] Gates: build, per-package units, lint, e2e in 4+ foreground
      shards.
- [ ] HUMAN-TESTING entry appended at merge by the lead.

### Acceptance Criteria

**GIVEN** a command anchoring a connector to a placement on
another canvas
**THEN** the handler refuses — authoritative state can never hold
a relationship the scene cannot draw.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->
