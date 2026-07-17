---
node_id: AI-IMP-307
tags:
  - IMP-LIST
  - Implementation
  - undo
  - appearance
  - tester-feedback
kanban_status: planned
depends_on:
parent_epic:
confidence_score: 0.6
date_created: 2026-07-17
date_completed:
---

# AI-IMP-307-appearance-undo-integrity

## Summary of Issue #1

First tester field doc (2026-07-17, item 9): choosing the dot
appearance on an image placement replaces it with the dot (by
design, §4.6 appearance kinds) — but **Ctrl+Z returns a BLANK
image**, and further undo never restores the original; the asset
remains intact in the gallery. Undo is the one system that must
never lie (§10.2). This is DIAGNOSIS-FIRST: reproduce the exact
sequence, convict the mechanism in this ticket with citations
BEFORE any fix (candidate space to CHECK, not assume: the
SetAppearance inverse captures the wrong prior state; the undo
applies but the renderer fails to rehydrate the image texture;
command coalescing eats the prior appearance). Done means: the
sequence appearance-change → undo restores the exact prior visual
state, pinned by unit + e2e, and the conviction is recorded.

### Out of Scope

The "what is the dot FOR" communication question (design-side);
appearance picker UI changes; any §4.6 semantics change.

### Design/Approach

Reproduce with `__ewDebug` scene census at each step (before /
after appearance change / after undo). Convict at the command or
renderer seam with cited code. Fix at the convicted seam only.
Sweep the OTHER appearance kinds for the same class once
convicted — one mechanism likely covers all.

### Files to Touch

Unknown until conviction — expected neighborhood: appearance
command handlers (packages/persistence or commands), canvas-engine
appearance rendering, `apps/desktop/test/e2e/*` for the pin.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and
**think**. Have you validated all aspects are **implemented** and
**tested**?
</CRITICAL_RULE>

- [ ] Reproduce: exact recipe + scene-census evidence recorded
      here.
- [ ] Convict with cited code BEFORE fixing; record here.
- [ ] Fix at the convicted seam; undo restores the exact prior
      visual state.
- [ ] Sweep all appearance kinds for the same defect class;
      record findings.
- [ ] Unit: SetAppearance inverse round-trips every kind.
- [ ] e2e: image → dot → Ctrl+Z → image renders (texture visible,
      not blank), gallery untouched throughout.

### Acceptance Criteria

**Scenario:** Undoing an appearance change.
**GIVEN** an image placement rendered normally.
**WHEN** the user sets the dot appearance, then presses Ctrl+Z.
**THEN** the placement renders the original image exactly as
before,
**AND** redo returns the dot, and the gallery is untouched
throughout.

### Issues Encountered

<!--
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->
