---
node_id: AI-IMP-214
tags:
  - IMP-LIST
  - Implementation
  - chrome
  - bug
kanban_status: completed
depends_on: []
parent_epic:
confidence_score: 0.8
date_created: 2026-07-09
date_completed: 2026-07-09
---


# AI-IMP-214-title-strip-trigger-and-nav-buttons

## Summary of Issue #1

Owner Parking Lot flush (2026-07-09, on v0.16.0, closing out the
AI-IMP-191 review): three defects in the top band. (1) The smoky
strip's reveal trigger is effectively ONE pixel row at the very
window edge — "hovering anywhere over the normal window chrome bar
should be showing the gradient" (his ruling: the Board button
location is fine and no hairline border is fine, CONDITIONAL on
this trigger getting fixed). (2) The back/forward history buttons
render BLACK — invisible against the board except on hover. (3)
The home button is not vertically centered against the traffic
lights. Done means the reveal zone covers the full title-band
height (the region a window chrome bar would occupy — use/extend
TITLE_STRIP_REVEAL_PX in chrome/feel.ts, named constant), the nav
buttons are visible at rest in both themes (token color, not
black), and the home glyph sits centered on the traffic-light
axis.

### Out of Scope

- The strip's gradient/fade itself (shipped, 191, owner-approved).
- Board menu click-away (AI-IMP-215).

### Design/Approach

Find the reveal trigger (TitleStrip mount condition /
gestures/host hover seam reading TITLE_STRIP_REVEAL_PX). Widen to
the full band height and verify the canvas doesn't lose pointer
events beneath the (invisible) trigger zone — the zone arms
reveal, it must not swallow clicks. Nav buttons: locate PathBar's
back/forward styles — likely missing a `color` token so they
inherit black; give them the chrome-mono token at rest with the
existing hover treatment. Home centering: measure against
trafficLightPosition (x:14, y:13) and align the glyph line-box.
E2e: pointer at y = band-height − 4px reveals the strip; nav
buttons' computed color at rest ≠ rgb(0,0,0) in both themes.

### Files to Touch

`chrome/TitleStrip.svelte` / reveal seam, `chrome/feel.ts`
(constant), `chrome/PathBar.svelte` (button color + home
alignment), shell e2e.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [x] Reveal triggers across the full band height; canvas clicks
      beneath are unaffected.
- [x] Back/forward visible at rest, both themes; home centered on
      the traffic-light axis.
- [x] E2e for trigger height and rest-state visibility.
- [x] Gates: build, per-package units, lint, e2e in 4+ foreground
      shards.
- [x] HUMAN-TESTING entry appended at merge by the lead.

### Acceptance Criteria

**GIVEN** the pointer anywhere over the title-band region
**THEN** the smoky gradient reveals — and at rest the history
arrows and home glyph read clearly against any board.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->

- **Root cause of the ~1px trigger:** the reveal-zone div was already
  `TITLE_STRIP_REVEAL_PX` (10px) tall, but 10px is a hairline against
  the ~37px title band — the owner read it as "one pixel." Widened the
  constant to 46px to match the ratified Pin & Menu Motion Prototype's
  `[data-stripzone]{height:46px}` (the band the whole bookmark beat
  lives inside).
- **Trigger no longer sinks canvas clicks.** The old reveal-zone was
  `pointer-events:auto` and armed reveal via `onpointerenter`, so it was
  a hit target — at 46px it would have swallowed any board click landing
  in the top band. Re-cut the trigger to sense the cursor's Y off a
  `svelte:window` `onpointermove` (reveal iff `clientY <=
  TITLE_STRIP_REVEAL_PX`); the reveal-zone div is now inert
  (`pointer-events:none`) and stays only as the e2e hover-target's
  boundingBox anchor. Single source of truth for reveal/lower, so the
  old `onpointerleave={hide}` (which would fight the widened band in the
  strip's own sub-37px gap) is removed. Verified against the whole e2e
  suite: no canvas interaction test operates in the newly-covered
  10–37px band, and the frames `(5,5)` clicks were already in the
  reveal band pre-change (behaviour identical).
- **Nav arrows "render BLACK":** in the LIGHT theme `--ew-text` is
  `#1d232b` (near-black) — the ‹ › arrows surface only on hover, which
  also smokes in the dark strip beneath them, so near-black text
  vanishes. Fixed by painting `.arrows button` with the chrome-mono
  `--ew-strip-text` (`:root`-only, `#dde3ea`, never re-themed), the same
  token the strip's own text uses. Home/crumbs/pin stay `--ew-text`:
  they are the always-shown signature spot on the bare board, not the
  strip. The ticket's suggested e2e (`color != rgb(0,0,0)`) was too weak
  to catch this — near-black is not pure black — so the test pins the
  arrow colour to the strip's own resolved colour in both themes.
- **Home centering** is a CSS line-box fix: `.home` now seats ⌂ in the
  same `inline-grid; place-items:center; min-height:1.3rem; line-height:1`
  box the pin uses, so it shares the row baseline and reads centered on
  the traffic-light axis (trafficLightPosition y:13) instead of riding
  high in its own glyph box. This is a FEEL dial — compile/lint clean,
  but sub-pixel optical centering against the live traffic lights is
  owner-validated (queued to HUMAN-TESTING), since e2e windows are
  headless and can't screenshot the OS chrome.
- Gates: `pnpm -r build`, per-package units (canvas-engine 380,
  persistence 538, protocol 1, shared-ui 1), desktop vitest 335, `pnpm
  lint` clean, e2e in 4 shards (a-d 44, e-i 62, j-r 72, s-z 50 = 228),
  all green.
