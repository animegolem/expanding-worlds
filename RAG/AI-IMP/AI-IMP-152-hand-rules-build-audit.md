---
node_id: AI-IMP-152
tags:
  - IMP-LIST
  - Implementation
  - canvas
  - feel
  - hygiene
kanban_status: planned
depends_on:
parent_epic:
confidence_score: 0.7
date_created: 2026-07-07
date_completed:
---


# AI-IMP-152-hand-rules-build-audit

## Summary of Issue #1

The Two Materials restated the hand rules ratified at revs
0.12–0.21, which surfaced that their BUILD status is unaudited.
This ticket audits each against shipped code and implements the
gaps: (1) Option-at-drag-START duplicates (rev 0.17/0.21 — a new
placement of the same node per §6.5); (2) Option MID-drag = snap
bypass (0.21); (3) Shift tidy-constraint precedence silencing
snapping (0.15); (4) rotation magnetizes to cardinals + Shift 15°
quantize + bypass disables both (0.12); (5) locked refusal cursor
drawing nothing else (0.17); (6) esc peels one layer at a time —
selection → lens → takeover → nothing (§8.2 grammar). Done means:
a written audit table (shipped ✓ / gap → built here) in Issues
Encountered, every gap implemented with tests, and the full e2e
suite green.

### Out of Scope

- Beats (151). Any §6.9 semantic CHANGE — these rules are ratified
  text; this is conformance.
- Rebinding/shortcut work.

### Design/Approach

Audit first (read gesture/tool code + existing e2e), then build
gaps. Option-duplicate is the likely big gap: at drag start with
Option, clone via CreatePlacement of the same node at the drag
origin, then the drag moves the CLONE (one compound undo — the
runAsUndoGroup pattern); verify against §6.5 copy semantics.
Rotation quantize/magnetize likely ships (AI-IMP-031) — verify the
15° Shift step and bypass. Esc peel: assert the order with lens +
takeover + selection stacked (e2e). Each verified rule gets a
pinning e2e if none exists, so conformance can't silently regress.

### Files to Touch

Audit: `packages/canvas-engine/src/` gesture/tools + hit-test,
`apps/desktop/src/renderer/canvas/`.
Gaps: same homes (+ units).
`apps/desktop/e2e/` pinning assertions.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [ ] Audit table for all six rules with file:line evidence.
- [ ] Option-duplicate: built or verified; compound undo; e2e.
- [ ] Snap bypass + Shift precedence verified/pinned.
- [ ] Rotation magnetize + 15° + bypass verified/pinned.
- [ ] Refusal cursor verified/pinned; esc peel order e2e.
- [ ] Gates: `pnpm -r build`, `pnpm -r test`, `pnpm lint`, desktop
      e2e hidden.
- [ ] HUMAN-TESTING entry appended at merge by the lead (Option-
      duplicate feel if newly built).

### Acceptance Criteria

**GIVEN** the six ratified hand rules
**THEN** each is demonstrably shipped (pinned by a test) or built
by this ticket, with the audit table recording which.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->
