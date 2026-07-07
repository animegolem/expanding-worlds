---
node_id: AI-IMP-116
tags:
  - IMP-LIST
  - Implementation
  - notes
  - feel
kanban_status: in-progress
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

- [x] Tethered panel scales with zoom, glued at the tether point;
      pinned panels and the big editor unaffected.
- [x] Below the floor the panel fades (does not shrink forever);
      constants live in the feel module.
- [x] AI-IMP-100 flight reservation uses the scaled footprint (fly
      to a note at low zoom — panel must not overlap its node).
- [x] e2e: open tethered panel, zoom out — panel's bounding box
      shrinks proportionally; pin it — box returns to screen-fixed
      size; zoom far out — tethered panel fades.
- [x] Full gates; HUMAN-TESTING entry for the feel dial.

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

**Scale ceiling (deviation from a literal "scales WITH the world").**
A tethered panel scales `min(zoom, 1)` — it shrinks below the default
as you zoom out but never balloons past its full-size card when you
zoom in. Reasons: (1) the RFC's own example and the owner finding are
entirely about zoom-OUT ("full-size card looming over a tiny board"),
and the RFC calls the default the "full-size" card — i.e. the ceiling;
(2) literal proportional-both-ways makes a zoomed-in card fill the
screen, which is worse than the bug being fixed; (3) capping at 1 makes
the AI-IMP-100 reservation provably safe (see below). The cap lives in
`feel.PANEL_TETHER_MAX_SCALE` — flip it to a larger number for true
both-ways scaling if the owner wants it. Flagged for the feel pass.

**Reservation (AI-IMP-100) kept as a safe superset, not a recomputed
inset.** `tetheredPanelInset()` still reserves the UNSCALED
`gap + size.width + margin`. Because the post-flight tethered scale is
capped at 1, `size.width` is the panel's MAXIMUM screen footprint at
any resulting zoom, so the flight never frames the node under the
panel. Below zoom 1 it over-reserves harmlessly (a little extra gap
between the framed node and the shrunk panel). A tighter,
zoom-aware inset would need a fixed-point solve (the inset changes the
fit zoom, which changes the panel size) and would have to thread the
target bounds through the shared `reserveTetheredPanelSpace()` helper
used by UsesList/TagPanel/jumpToPlacement — not worth it while the cap
guarantees correctness. The e2e asserts the panel lands right of its
node after a zoomed-out open.

**Legibility floor = fade, not clamp.** Below
`PANEL_LEGIBILITY_FLOOR` (0.4) the panel keeps shrinking with the world
but fades to zero opacity across `PANEL_LEGIBILITY_FADE` (0.2), gone at
scale 0.2 — a smooth ramp driven directly by the continuous zoom, so
there is no pop. A faded panel also drops `pointer-events` so an
invisible card never eats clicks. Both constants + the pure
`tetheredPanelScale`/`tetheredPanelOpacity` helpers live in
`chrome/feel.ts` and are unit-tested (`chrome/feel.test.ts`).

**Scope discipline.** Only the positioning/scaling seams changed:
`NotePanel.svelte` (scale state + transform + faded opacity in
`layout()` and the section style), `chrome/feel.ts` (constants +
helpers), `note/panels.ts` (reservation doc only — no logic change),
plus e2e/unit coverage. Panel body internals (AI-IMP-119) untouched;
no theme.css / persistence / protocol changes.

**Pre-existing flake, not mine.** `trash.spec.ts` "trash browser"
failed once then passed on retry (marked flaky) in the full-suite run:
a status toast and the trash view both carry `data-testid="trash-empty"`,
a strict-mode collision while the toast lingers. Unrelated to this
ticket (no trash/toast code touched). Full suite otherwise green.
