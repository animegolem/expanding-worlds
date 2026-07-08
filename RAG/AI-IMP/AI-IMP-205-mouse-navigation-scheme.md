---
node_id: AI-IMP-205
tags:
  - IMP-LIST
  - Implementation
  - canvas
  - input
  - feel
kanban_status: planned
depends_on: []
parent_epic:
confidence_score: 0.7
date_created: 2026-07-08
---


# AI-IMP-205-mouse-navigation-scheme

## Summary of Issue #1

Alph field report (2026-07-08, Discord — "this is a big thing
imo"): on a MOUSE he expects **hold middle button to pan** and
**plain scroll wheel to zoom**. Neither exists: middle-drag does
nothing, and plain wheel PANS (correct for trackpad two-finger
scroll, which arrives as the same wheel events — the owner built
on a trackpad, "that's on me"). The two devices are
indistinguishable at the event level in Chromium, so this is the
classic Figma/Miro input-scheme problem. Done means: (1)
middle-button drag pans, unconditionally — it collides with
nothing on any device; (2) a **navigation scheme setting**
(trackpad / mouse) governs plain wheel: trackpad scheme keeps
wheel=pan (today's behavior, default), mouse scheme makes
wheel=zoom-at-cursor via the existing chase path; pinch
(ctrl-wheel) and Cmd+wheel zoom in BOTH schemes. Alph on a Windows
mouse flips one setting and gets the PureRef-style scheme he
expects.

### Out of Scope

- Auto-detecting the device per-event (deltaMode/notch heuristics
  are unreliable; a deliberate setting is honest — note any cheap
  "suggest the switch" heuristic as a future line, don't build).
- Wheel-over-panel rules (AI-IMP-201 — but its rule table gains a
  scheme column; coordinate, same wave or sequenced).
- Zoom feel constants (AI-IMP-206 dial).

### Design/Approach

Middle-drag pan: pointerdown with `button === 1` on the canvas
starts a pan gesture (same camera path as space-drag/two-finger
pan), capture the pointer, suppress the default auxclick/autoscroll
behavior, cursor to grabbing. Check the gestures-ui capture-phase
pointerdown seam and the pre-render pointerdown watcher (AI-IMP-184)
for interactions. Scheme setting: a `navigation.scheme` value in
the settings store (`'trackpad' | 'mouse'`, default trackpad),
surfaced in the settings surface next to zoom behavior; onWheel
consults it — mouse scheme routes plain wheel into the zoom chase
(reusing Cmd+wheel's path and speed), trackpad scheme unchanged.
Settings-broadcast refresh per AI-IMP-177's idiom. RFC: §8/§3
input grammar gains the scheme table; keep §5/§18 consistent.

### Files to Touch

`canvas/host.ts` (onWheel scheme branch, middle-drag pan),
`canvas/gestures-ui.ts` if the pointer seam lives there, settings
store + settings UI row, RFC input-grammar section. E2e: middle-drag
pans in both schemes; wheel zooms in mouse scheme / pans in
trackpad scheme; pinch zooms in both.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [ ] Middle-button drag pans; no autoscroll/auxclick leakage.
- [ ] Scheme setting exists, persists, defaults to trackpad;
      wheel obeys it; pinch/Cmd+wheel zoom in both schemes.
- [ ] RFC input grammar updated; 201's rule table cross-checked.
- [ ] Gates: `pnpm -r build && pnpm -r test && pnpm lint` + hidden
      e2e.
- [ ] HUMAN-TESTING entry appended at merge by the lead (alph
      first pass — it's his scheme).

### Acceptance Criteria

**GIVEN** the mouse scheme selected
**WHEN** the user rolls the wheel over the board
**THEN** the board zooms at the cursor — and holding the middle
button and dragging pans, in either scheme, on any device.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->
