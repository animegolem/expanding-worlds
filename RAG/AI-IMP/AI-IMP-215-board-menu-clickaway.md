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

- [x] Outside pointerdown closes the Board menu; inside clicks
      unchanged; Escape composition intact.
- [x] Dismissing-click swallow rule stated and pinned by e2e.
- [x] Gates: build, per-package units, lint, e2e in 4+ foreground
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

- **Scope of "outside":** the close fires on a pointerdown on the BOARD
  (the empty ground), per the owner's words ("clicking the canvas
  outside of the gradient UI") and the acceptance ("clicks the board
  outside it"). The board surface is the Pixi `<canvas>` element itself
  (`target.tagName === 'CANVAS'`): the `.canvas-host` div wraps the
  whole chrome layer, so `closest('[data-testid="canvas-host"]')` cannot
  stand in for "the board" — it matches the menu, notices, and the dock
  too. A first attempt closing on ANY non-menu/non-trigger pointerdown
  regressed `background stage` (the softness-notice dismiss folded the
  menu it belonged to); scoping to the canvas element matches the
  gallery ground precedent (which ignores clicks on tiles/controls) and
  fixes that.
- **SWALLOW RULE (chosen + pinned):** the dismissing board click is
  SWALLOWED — `stopPropagation` at capture, before the canvas' own
  capture-phase pointerdown listener, so it ONLY lowers the menu and
  does not also deselect/marquee on the board beneath. This follows the
  gallery precedent (the dismissing click is consumed). Pinned by e2e:
  a selected pin survives the click-away (`selection().length === 1`
  after clicking empty board), proving the click lowered the menu
  without acting on the board.
- **Escape composition intact:** the AI-IMP-183 Escape `$effect`
  (capture + stopPropagation) is untouched and still peels the menu
  first-layer; e2e re-opens and closes via Escape, asserting the pin
  still survives (Escape never reaches the board either).
- **No unmount race (the 191 ghost lesson):** the strip hides by instant
  unmount (in:fade is intro-only), reveal/lower is the widened band's
  `pointermove` (AI-IMP-214), and the dismissing click never fires
  `pointerleave` — so dropping `boardMenuOpen` just unmounts the strip in
  the same tick; no double-fire, no ghost.
- **Behaviour reversal — one e2e choreography update.** The old menu
  deliberately stayed open on click-away so "background work (pick image,
  click canvas, adjust) doesn't fight the menu." Reversing that means the
  `background stage` test's "select the image with the menu still open →
  from-selection" flow no longer holds; updated it to the new grammar
  (fold the menu with Escape, select on the bare board, reopen for
  from-selection). `background lifecycle` and `decorations` already
  selected/closed before touching the canvas, so they were unaffected.
  Stale "never on click-away" comments in TitleStrip and e2e/helpers.ts
  updated.
- Gates: `pnpm -r build`, per-package units (canvas-engine 380,
  persistence 538, protocol 1, shared-ui 1), desktop vitest 335, `pnpm
  lint` clean, e2e in 4 shards (a-d 44, e-i 62, j-r 72, s-z 50 = 228),
  all green.
