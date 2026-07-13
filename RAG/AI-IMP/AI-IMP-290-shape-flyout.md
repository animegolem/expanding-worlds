---
node_id: AI-IMP-290
tags:
  - IMP-LIST
  - Implementation
  - dock
  - tools
  - design-adoption
kanban_status: completed
depends_on: [AI-IMP-289]
parent_epic: [[AI-EPIC-029-the-kit-adoption-push]]
confidence_score: 0.75
date_created: 2026-07-12
date_completed: 2026-07-12
---

# AI-IMP-290-shape-flyout

## Summary of Issue #1

The dock's shape tools consolidate into ONE slot with a
Photoshop-style hold flyout (kit ruling 3 / wireframe 2a; the
owner's dock-species ruling folded AI-IMP-190 in): hold ~300ms (or
re-press the armed slot) opens a flyout that CENTERS on the armed
slot with a pointer tail; pick arms that shape and the slot wears
its glyph; long-press is the touch synonym (GR-5 §2 — slot wins
inside dock bounds). AI-IMP-190 never authored the comparison table
it claimed; this ticket authors the candidate/geometry/decision table
below. Done means: one shape slot, kit-anatomy flyout with
esc/release-outside/pick exits, the 190 table's Phase-1 set
decision executed and recorded, AI-IMP-190 closed by pointer.

### Out of Scope

- New decoration RECORD kinds requiring persistence/migration work
  — if a Miro-baseline shape needs one, it is recorded in this
  ticket's Issues and deferred to a cut ticket with a lead-reserved
  migration number.
- The 4×4 grid palette (2b) — graduation path if the 3D family
  lands.
- Defaults row content (AI-IMP-289).

### Design/Approach

Flyout is an anchored surface on the one-physics rule (grows from
the slot, pointer tail, clamps in the frame). Hold detection is
~300ms: quick-release arms the remembered shape, re-pressing an armed
slot or holding opens, release-over-row picks, and release-outside/Esc
cancels. The first touch line reads `Shapes · S`. The ratified set is
rectangle, ellipse, triangle, diamond, and the shipped arrow. Diamond
is a JSON variant of `kind:'shape'`, not a record kind or schema change.
Arming from the flyout writes the slot's remembered shape
(per-session; round-1 checks whether tool defaults persist
anywhere already before inventing storage).

### Files to Touch

`apps/desktop/src/renderer/chrome/Dock.svelte`: slot + hold
  detection.
`apps/desktop/src/renderer/ui/` or chrome-local flyout component
  (anchored-placement consumer).
`apps/desktop/src/renderer/canvas/decorations-ui.ts` /
  `board-tooling.ts`: shape-kind arming + any new drawable
  variants.
`RAG/AI-IMP/AI-IMP-190-shape-picker-and-gap-review.md`: close with
  pointer here.
e2e: flyout open/pick/esc + draw-one-of-each spec.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [x] Round-1: verified current shape-tool inventory in Dock/
      decorations-ui, the 190 table's candidates vs decoration
      geometry, and the kit 2a anatomy; record the shipping set
      decision here.
- [x] One shape slot; quick-click arms current; hold ~300ms /
      long-press opens the flyout centered on the slot with
      pointer tail.
- [x] Flyout exits: esc, release-outside, pick (preflight B1);
      pick arms + slot glyph updates.
- [x] Shape set per the round-1 decision; each drawable by the
      shape tool and undo-captured as one command including
      defaults (preflight D2).
- [x] AI-IMP-190's cancelled-with-pointer record still matches
      what shipped; append any delta there.
- [x] Unit + e2e green; full local gate green with counts read.

### Acceptance Criteria

**Scenario:** picking a shape by hold.
**GIVEN** the shape slot is armed with rectangle
**WHEN** the user holds the slot ~300ms, picks ellipse, and drags
on the board
**THEN** an ellipse decoration commits as ONE undoable command
**AND** the slot now wears the ellipse glyph and quick-click
re-arms ellipse
**AND** esc while the flyout is open closes it without changing
the armed shape.

### Issues Encountered

| Candidate | Geometry mapping | Decision |
| --- | --- | --- |
| Rectangle | Existing `shape` rectangle | Ship |
| Ellipse | Existing `shape` ellipse | Ship |
| Triangle | Existing `shape` triangle | Ship |
| Diamond | Extend `shape` JSON variant | Ship |
| Block arrow | Existing `shape-arrow` tool / `shape:'arrow'` geometry | Ship |
| Rounded rectangle | Rectangle + defaults rounding | Defer to defaults |
| Pentagon | No current geometry variant | Defer; no schema invented |
| Hexagon | No current geometry variant | Defer; no schema invented |
| Star | No current geometry variant | Defer; no schema invented |
| Parallelogram | No current geometry variant | Defer; no schema invented |
| Speech bubble | No variant; intersects deferred text-in-shape | Defer |
| Cross | No current geometry variant | Defer; no schema invented |
| Cylinder / 3D family | No current geometry; triggers 2b graduation | Defer |

Round-1 correction: use the shared phase-A measured anchor and keep
the pointer tail honest after frame clamping. Shape memory is session-only.

Implementation evidence: the hold boundary and memory live in a pure
tested helper; the phase-A action reports its measured placement so the
nub follows a clamped surface; diamond extends the JSON shape validator,
draw session, preview, and durable renderer together. Focused validation:
canvas-engine 29 files / 409 tests; desktop helper/defaults 2 files / 6
tests; shell + decorations Playwright 10 tests green after correcting the
expected final decoration census from 8 to 10. `pnpm -r build` is green.
The full wave gate passed: persistence 658, canvas-engine 409, desktop
541, and hidden-window Playwright 268.

Round-3 oracle correction: Linux shard 1 convicted the E2E helper's
probe-then-act race, not the product protocol. The Dock slot now exposes
`data-armed` and `data-flyout-open`; the helper reads those stable states,
performs one required action, and awaits the visible flyout before choosing
a row. Re-press while open is ruled idempotent-open; outside/Escape/pick are
the explicit exits. A wave-wide sweep found no other count-probe driving a
corrective action; remaining zero-count uses are terminal assertions.
