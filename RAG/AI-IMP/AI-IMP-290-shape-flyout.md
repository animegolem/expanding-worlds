---
node_id: AI-IMP-290
tags:
  - IMP-LIST
  - Implementation
  - dock
  - tools
  - design-adoption
kanban_status: planned
depends_on: [AI-IMP-289]
parent_epic: [[AI-EPIC-029-the-kit-adoption-push]]
confidence_score: 0.75
date_created: 2026-07-12
date_completed:
---

# AI-IMP-290-shape-flyout

## Summary of Issue #1

The dock's shape tools consolidate into ONE slot with a
Photoshop-style hold flyout (kit ruling 3 / wireframe 2a; the
owner's dock-species ruling folded AI-IMP-190 in): hold ~300ms (or
re-press the armed slot) opens a flyout that CENTERS on the armed
slot with a pointer tail; pick arms that shape and the slot wears
its glyph; long-press is the touch synonym (GR-5 §2 — slot wins
inside dock bounds). The shape set fills toward AI-IMP-190's Miro
comparison baseline where the decoration model already supports
the geometry. Done means: one shape slot, kit-anatomy flyout with
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
the slot, pointer tail, clamps in the frame). Hold detection on the
slot (~300ms, same threshold desktop and touch); a quick click arms
the current shape as today. Drawn set per the kit page (2a shows
the drawn four); the 190 comparison table adjudicates which extra
shapes ship — each candidate maps to existing decoration geometry
(round-1 lists the mapping; anything unmappable goes to Issues).
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

- [ ] Round-1: verify current shape-tool inventory in Dock/
      decorations-ui, the 190 table's candidates vs decoration
      geometry, and the kit 2a anatomy; record the shipping set
      decision here.
- [ ] One shape slot; quick-click arms current; hold ~300ms /
      long-press opens the flyout centered on the slot with
      pointer tail.
- [ ] Flyout exits: esc, release-outside, pick (preflight B1);
      pick arms + slot glyph updates.
- [ ] Shape set per the round-1 decision; each drawable by the
      shape tool and undo-captured as one command including
      defaults (preflight D2).
- [ ] AI-IMP-190's cancelled-with-pointer record still matches
      what shipped; append any delta there.
- [ ] Unit + e2e green; full local gate green with counts read.

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

