---
node_id: AI-IMP-291
tags:
  - IMP-LIST
  - Implementation
  - charms
  - canvas
  - design-adoption
kanban_status: planned
depends_on: [AI-IMP-287, AI-IMP-288]
parent_epic: [[AI-EPIC-029-the-kit-adoption-push]]
confidence_score: 0.75
date_created: 2026-07-12
date_completed:
---

# AI-IMP-291-arrange-and-restyle-panels

## Summary of Issue #1

The selection verbs leave the dock for the charm bar (kit ruling 7
+ the dock-species ruling): the multi-select charm bar gains ⌗
opening an anchored glyph-grid popover with four named sections —
align / spread / pack / equalize — centered on the ⌗ charm;
z-order + group/lock/hide become context-menu rows; chords survive.
A selected shape's styling gains ◧ (the restyle panel — selection
restyle lives HERE, never in the dock; two questions, two homes).
This supersedes AI-IMP-198's surface half and must fix its named
defect: align-center collapses spreads. Done means: both charms
live with kit anatomy, the ~22 dock word-buttons' verbs all
reachable (charm popover or context menu), align-center fixed with
a regression test, 198 closed by pointer.

### Out of Scope

- Deleting the dock rows (AI-IMP-289 owns the dock side; the wave
  brief sequences so verbs never vanish).
- New arrange algorithms beyond the align-center fix — verbs keep
  their engine implementations (canvas-engine/arrange.ts).
- The zoom cluster: RULED dock-resident, untouched.

### Design/Approach

charms-ui.ts adds ⌗ to the multi-select charm census and ◧ to the
styled-selection census (shapes/text; round-1 confirms which
selections style). Panels are anchored surfaces (halo-aware via
287, frame-clamped via 286) built from kit components. ⌗ sections
map to existing arrange verbs; equalize = the "Eq. area" family.
Align-center fix in canvas-engine/arrange.ts: centering aligns
along ONE axis without collapsing the other's spread (the 198
audit's PureRef/Figma comparison is the behavioral reference —
verify its conclusion in round-1 before coding). ◧ hosts the
appearance controls the dock's contextual rows carried for a
SELECTION (ink, stroke, weight, font for text decorations),
committing per-gesture undo entries per GR-4.

### Files to Touch

`apps/desktop/src/renderer/canvas/charms-ui.ts`: ⌗/◧ charms +
  panel opens.
New panel components (chrome/ or ui/): ArrangePopover, RestylePanel.
`packages/canvas-engine/src/arrange.ts` + tests: align-center fix.
`apps/desktop/src/renderer/menus/ContextMenu.ts`: z-order /
  group/lock/hide rows for multi-select.
`RAG/AI-IMP/AI-IMP-198-arrange-normalize-repair.md`: close with
  pointer.
e2e: arrange-verbs + restyle spec.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [ ] Round-1: enumerate the dock word-button verbs against
      engine functions; verify the align-center defect and the
      198 table; verify kit anatomy (grammar 5a) + which charm
      census hosts ◧; record corrections here.
- [ ] ⌗ charm on multi-select; glyph-grid popover with the four
      named sections; centers on ⌗ with pointer tail; halo- and
      frame-aware; esc/click-away/re-click exits.
- [ ] z-order + group/lock/hide as context-menu rows; existing
      chords still work (regression-tested).
- [ ] align-center preserves the cross-axis spread; unit test
      pinning the fixed behavior with a named scenario.
- [ ] ◧ charm on styleable selections; restyle panel from kit
      components; each change = one undo step with its beat.
- [ ] Every retired dock verb reachable via ⌗/◧/context menu
      (record the mapping in this ticket on close); AI-IMP-198's
      cancelled record matches what shipped.
- [ ] Unit + e2e green; full local gate green with counts read.

### Acceptance Criteria

**Scenario:** aligning a spread of five nodes.
**GIVEN** five nodes selected in a horizontal spread
**WHEN** the user opens ⌗ and applies align-center (vertical)
**THEN** the nodes share one center Y and keep their X spread
**AND** one undo step restores all five positions.
**Scenario:** restyling a shape.
**GIVEN** a shape decoration selected
**WHEN** the user opens ◧ and changes ink
**THEN** the shape recolors as one undo step and the dock shows no
contextual row.

### Issues Encountered

