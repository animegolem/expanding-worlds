---
node_id: AI-IMP-305
tags:
  - IMP-LIST
  - Implementation
  - chrome
  - z-ladder
  - feel-pass
kanban_status: planned
depends_on:
parent_epic: [[AI-EPIC-030-the-ratified-law-wave]]
confidence_score: 0.6
date_created: 2026-07-16
date_completed:
---

# AI-IMP-305-bars-under-notes-diagnostic

## Summary of Issue #1

Feel-pass finding, still UNDIAGNOSED (deliberately carried without
a hypothesis since 2026-07-13): "the new bars are displaying
incorrectly underneath it [notes] and moving the dock." Two
distinct symptoms: chrome bars rendering BENEATH note panels
(violates the z-ladder — chrome rung 400 over panel rung 200,
`ChromeLayer.svelte:104–115` / `z.ts:15–24`; ledger DOCK-LAYER-01),
and something DISPLACING the dock (violates DOCK-GEO-03: the
defaults row must grow upward and take no space from the dock —
`Dock.svelte:237–248,339–345` translate only the defaults row, so
the displacement source is unknown). This ticket is
DIAGNOSIS-FIRST: reproduce both symptoms, convict the mechanism
with evidence (rects, `elementsFromPoint`, screenshots), record
the conviction in this ticket, THEN fix. Done means: both
symptoms reproduced → convicted → fixed → regression-pinned.

### Out of Scope

Any speculative refactor of the z-ladder; note posture work (the
notes epic); fixing symptoms whose mechanism is not yet convicted
— a fix without a recorded conviction is a violation of this
ticket, not a completion of it.

### Design/Approach

Evidence before hypothesis (the dock-wave lesson: the lead burned
a round guessing; the trace convicted). Reproduce on a board with
pinned + free note panels overlapping the dock footprint at both
densities, defaults row toggling, and a takeover cycle (AI-IMP-302
interaction). Capture per-symptom: full rect inventory
(dock stack, defaults row, note panels), `elementsFromPoint`
samples at dock control centers (LAYER-01 recipe), and DOM
stacking-context census (who created a context between rungs).
Candidate mechanism space to CHECK, not assume: a note panel
mounting inside a stacking context above chrome's; a transform on
an ancestor creating an accidental context; the defaults-row
translate leaking to the main row under a specific toggle order;
reservation double-application shifting the dock. Fix at the
convicted seam only, with the smallest change that restores the
ladder/geometry; pin with unit + e2e.

### Files to Touch

Unknown until conviction — expected neighborhood:
`apps/desktop/src/renderer/chrome/z.ts`,
`apps/desktop/src/renderer/chrome/ChromeLayer.svelte`,
`apps/desktop/src/renderer/chrome/Dock.svelte`,
`apps/desktop/src/renderer/note/NotePanel.svelte`.
`apps/desktop/test/e2e/*`: LAYER-01 + GEO-03 regression pins.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and
**think**. Have you validated all aspects are **implemented** and
**tested**?
</CRITICAL_RULE>

- [ ] Reproduce symptom A (bars under notes): exact recipe
      recorded in this ticket with a screenshot + rect/hit
      evidence.
- [ ] Reproduce symptom B (dock displacement): exact recipe +
      before/after main-row rects.
- [ ] Convict mechanism A with cited code (stacking context /
      mount point / rung constant); record here BEFORE fixing.
- [ ] Convict mechanism B likewise.
- [ ] Fix A at the convicted seam; DOCK-LAYER-01 e2e pin: every
      enabled main-row control first hit-test owner at center
      under an overlapping pinned AND free note.
- [ ] Fix B; DOCK-GEO-03 e2e pin: main-row rect identical
      before/during/after each defaults row at both densities.
- [ ] Evidence bundle: before/after captures keyed to
      DOCK-LAYER-01 + DOCK-GEO-03.

### Acceptance Criteria

**Scenario:** A pinned note overlaps the dock.
**GIVEN** a pinned note panel intersecting the dock footprint.
**WHEN** the board renders and the pointer samples each enabled
main-row control's center.
**THEN** every sample returns the dock control as first hit-test
owner, and the dock draws over the panel.

**Scenario:** Toggling defaults rows.
**WHEN** text, shape, and line defaults open and close repeatedly
at both densities.
**THEN** the main row's rect is identical before, during, and
after every toggle.

### Issues Encountered

<!--
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->
