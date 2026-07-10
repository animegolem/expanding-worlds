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

- [x] Exact canvas equality enforced on create/update/re-anchor;
      typed refusal.
- [x] Cross-canvas tests for all three paths.
- [x] Gates: build, per-package units, lint, e2e in 4+ foreground
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

- No pre-existing typed refusal code fit exactly; used
  `VALIDATION_FAILED` (the handlers' grammar for domain-rule
  refusals, matching the existing cross-canvas group refusal in the
  same file) with structured details `{ anchor, placementId,
  placementCanvasId, canvasId }`.
- The "seed/fixture SELECT" was interpreted as a spec-level
  assertion: the ticket's own fixtures (mixed same-canvas anchors +
  a second canvas with a placement) are built and the DB is
  SELECT-audited for cross-canvas anchor rows on both endpoints.
  The shipped first-open seed (apps/desktop/resources/seed) contains
  images only — no decorations — so no wild data could violate the
  invariant; no schema migration needed, as designed.
- The update path validates against `prior.canvas_id` (the
  decoration's stored row); `UpdateDecorationPayload` carries no
  canvasId, so no payload claim exists to trust anyway — the risk
  was purely in validateAnchor never checking canvas at all.
- decorations.test.ts needed `registerCanvasHandlers` added to its
  registry to create a second canvas for cross-canvas fixtures.
- e2e ran as SIX foreground shards (a-d / e-g / h-i / j-n / o-r /
  s-u+v-z split): 45+48+18+45+30+46+4 = 236, full coverage verified
  via --list. One flake: perf.spec.ts "150 visible images … memory
  releases on swap" failed once and passed on retry (memory-release
  timing; unrelated to this persistence-handler change).
