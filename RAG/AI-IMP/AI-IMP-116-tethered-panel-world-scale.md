---
node_id: AI-IMP-116
tags:
  - IMP-LIST
  - Implementation
  - notes
  - feel
kanban_status: planned
depends_on:
parent_epic: [[AI-EPIC-016-context-click-menus]]
confidence_score: 0.75
date_created: 2026-07-06
date_completed:
---

# AI-IMP-116-tethered-panel-world-scale

## Summary of Issue #1

Tethered note panels render at fixed screen size while the board
zooms, so zooming out leaves a full-size card looming beside a
tiny node (owner finding 2026-07-06; ratified rev 0.47 §8.5,
superseding the earlier screen-scale type rule for the tethered
state). Done = a tethered panel scales proportionally with the
world like the node it belongs to, with a legibility floor;
pinned panels stay screen-fixed exactly as today.

### Out of Scope

- Pinned panels, the big editor, panel commit semantics — all
  unchanged.
- Panel-flight reservation math (AI-IMP-100) beyond keeping it
  correct at scaled sizes.

### Design/Approach

The tethered panel's layout already tracks its anchor per frame
(note/panels.ts + NotePanel positioning). Apply a CSS transform
scale tied to camera zoom (world-proportional: scale = zoom ×
k, k chosen so the default size at 100% matches today), with
transform-origin at the tether point so it stays glued to the
node. Legibility floor: a feel constant pair (FLOOR, FADE) — below
FLOOR rendered scale the panel fades like charms' screen-size
rule rather than shrinking into unreadable confetti; expose the
constants via the feel module. Interaction targets must scale
with the panel (hit-testing follows the transform naturally).
Verify the tether tail and the AI-IMP-100 reserved-space math use
the SCALED footprint. Pinned conversion snaps to the ordinary
screen-fixed size (the pin gesture "peels it onto the glass").

### Files to Touch

`apps/desktop/src/renderer/note/panels.ts` / `NotePanel.svelte` /
`NotePanels.svelte`: the scale transform + floor.
`apps/desktop/src/renderer/chrome/feel.ts` (or panel feel home):
constants.
`apps/desktop/e2e/panels.spec.ts`: coverage.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and
**think**. Have you validated all aspects are **implemented** and
**tested**?
</CRITICAL_RULE>

- [ ] Tethered panel scales with zoom, glued at the tether point;
      pinned panels and the big editor unaffected.
- [ ] Below the floor the panel fades (does not shrink forever);
      constants live in the feel module.
- [ ] AI-IMP-100 flight reservation uses the scaled footprint (fly
      to a note at low zoom — panel must not overlap its node).
- [ ] e2e: open tethered panel, zoom out — panel's bounding box
      shrinks proportionally; pin it — box returns to screen-fixed
      size; zoom far out — tethered panel fades.
- [ ] Full gates; HUMAN-TESTING entry for the feel dial.

### Acceptance Criteria

**GIVEN** a tethered note beside its node
**WHEN** the artist zooms from 100% to 25%
**THEN** the panel shrinks in proportion and stays glued to the
node, fading below the legibility floor
**AND** pinning at any zoom yields the ordinary screen-fixed
sticky note.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->
