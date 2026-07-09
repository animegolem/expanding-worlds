---
node_id: AI-IMP-215
tags:
  - IMP-LIST
  - Implementation
  - chrome
  - menus
  - bug
kanban_status: planned
depends_on: []
parent_epic:
confidence_score: 0.85
date_created: 2026-07-09
---


# AI-IMP-215-board-menu-clickaway

## Summary of Issue #1

Owner Parking Lot flush (2026-07-09, on v0.16.0): "clicking the
canvas outside of the gradient UI does not dismiss the dialogue" —
the title strip's Board dropdown stays open when the user clicks
the board beneath it. §8.2 desk physics: a click on empty ground
puts things down (the same grammar 188 just gave the gallery).
Done means a pointerdown outside the open Board menu (and outside
its trigger) closes it through its own close path, composing with
183's Escape routing (Escape still closes it first-layer) — while
clicks INSIDE the menu behave as today.

### Out of Scope

- Menu contents/anatomy (Menus Document).
- The strip reveal trigger (AI-IMP-214 — same wave, same file
  family; coordinate but separate concerns).

### Design/Approach

Find the Board dropdown's open state (TitleStrip.svelte,
boardMenuOpen). House pattern for click-away is established (the
gallery's ground pointerdown, the charm popovers' outside-click
close) — reuse the idiom: a capture-phase window pointerdown while
open, target-not-within check, close via the existing setter. Mind
the strip's own hide-on-pointerleave: clicking the canvas also
leaves the strip — verify close ordering doesn't double-fire or
fight the unmount (the 191 ghost lesson: hide is an instant
unmount).

### Files to Touch

`chrome/TitleStrip.svelte` (or the dropdown component it hosts),
shell e2e: open Board menu → click canvas → menu closed AND the
click did not also act on the board (swallowed-or-not: state the
chosen rule; the gallery precedent swallows the dismissing click).

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [ ] Outside pointerdown closes the Board menu; inside clicks
      unchanged; Escape composition intact.
- [ ] Dismissing-click swallow rule stated and pinned by e2e.
- [ ] Gates: build, per-package units, lint, e2e in 4+ foreground
      shards.
- [ ] HUMAN-TESTING entry appended at merge by the lead.

### Acceptance Criteria

**GIVEN** the Board dropdown open
**WHEN** the user clicks the board outside it
**THEN** the menu closes — nothing on the desk stays standing
after a click on empty ground.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->
