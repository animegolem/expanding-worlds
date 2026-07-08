---
node_id: AI-IMP-206
tags:
  - IMP-LIST
  - Implementation
  - canvas
  - feel
  - devtool
kanban_status: planned
depends_on: []
parent_epic:
confidence_score: 0.8
date_created: 2026-07-08
---


# AI-IMP-206-live-feel-dial

## Summary of Issue #1

Alph field report (2026-07-08): canvas interaction has "a tad bit
much 'weight'" — zoom feels heavy. The owner's ask: "wire us a
live temp tool to adjust the scaling factor real time" so he and
alph can dial the feel over Discord instead of describing it in
words. Half exists already: `host.zoomTuning({tau, wheelSpeed,
pinchSpeed})` (AI-IMP-098) live-adjusts the zoom chase at runtime
— but only from a devtools console, unusable for alph. Done means
a **dev feel-dial panel** in the app: a hidden toggle (dev menu
item and/or keyboard chord) opens a small floating panel of
sliders bound to the live tunables — zoom tau, wheel speed, pinch
speed, plus whichever pan/glide friction constants the audit of
host.ts turns up as feel-relevant — with live numeric readouts, a
"copy values" button (so alph can paste results into Discord), and
a reset-to-shipped-defaults. Values are session-only; shipping new
defaults stays a code change made from the pasted numbers.

### Out of Scope

- Changing any shipped constant (that's the OUTPUT of the tuning
  session, its own one-line change).
- Persisting dial values across restarts.
- Beat-timing dials (AI-IMP-202 may want the same idiom later —
  build the panel so adding a slider is one registration line).

### Design/Approach

Inventory host.ts for live-adjustable feel scalars (zoomTuning's
three, pan glide/friction if present, anything the chase exposes).
Panel: a small always-on-top DOM overlay (not canvas-rendered),
kit-styled but explicitly dev furniture, draggable, one slider row
per tunable with min/max chosen around the shipped value (~×0.25
to ×4 log range), live apply on input via the existing host hooks
(add sibling hooks only where a scalar is currently module-local).
Toggle: Develop/dev menu entry + chord; hidden in normal use, but
PRESENT in release builds (alph tunes on his Windows build — that
is the entire point). "Copy values" writes a compact JSON blob to
the clipboard.

### Files to Touch

`canvas/host.ts` (expose any un-exposed scalars via the zoomTuning
pattern), a new small `dev/feel-dial.ts|svelte` overlay, menu
wiring for the toggle. E2e: open panel, move a slider, assert the
host tunable changed; copy-values produces parseable JSON.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [ ] Tunable inventory documented in Issues Encountered (what's
      exposed, what was newly seamed).
- [ ] Panel opens via menu/chord in a release-style build; sliders
      live-apply; readouts, copy-values, reset all work.
- [ ] Gates: `pnpm -r build && pnpm -r test && pnpm lint` + hidden
      e2e.
- [ ] HUMAN-TESTING entry appended at merge by the lead (this one
      IS the testing tool — include the open chord in the entry).

### Acceptance Criteria

**GIVEN** the feel-dial panel open on a running board
**WHEN** the user drags the zoom-tau slider
**THEN** the very next pinch/wheel zoom reflects the new value —
and "copy values" yields the full current set for pasting back to
the team.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->
