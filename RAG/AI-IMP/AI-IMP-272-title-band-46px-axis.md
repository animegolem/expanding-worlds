---
node_id: AI-IMP-272
tags:
  - IMP-LIST
  - Implementation
  - chrome
  - field-report
kanban_status: completed
depends_on: []
parent_epic:
confidence_score: 0.8
date_created: 2026-07-10
date_completed: 2026-07-10
---


# AI-IMP-272-title-band-46px-axis

## Summary of Issue #1

Owner, v0.22.0, 2026-07-10 night, two persistent chrome issues:
(1) "the gradient still doesn't fire" — the title strip's smoky
gradient reads as nothing; (2) top-line vertical misalignment —
the pin not centered vs the text, ⌂ a touch low, the whole line
off vs the traffic lights. REVIEW CONVICTED BOTH AS ONE GEOMETRY
DEFECT against the ratified Pin & Menu Motion Prototype
(RAG/design/Pin & Menu Motion Prototype.dc.html:65-69): the
prototype is a FIXED 46px stripzone with the gradient filling it
(inset:0) plus a hairline border-bottom, traffic lights at
top:17px (12px dots → centers at y=23 = the band's center). The
shipped strip is CONTENT-HEIGHT (~30px, asymmetric padding
0.32/0.7rem) — the .82→.28 gradient collapses onto ~30px of
near-black-on-dark, perceptually "not firing" — while the lights
sit at y:13 (center 19), the PathBar at a magic top:0.55rem
(row center ~21), and the strip row centers at ~13: every element
off every other by a few px in a different direction. Done means:
one shared 46px axis — band, gradient run, lights, path row, and
strip row all centered on y=23 — and the gradient visibly reads
as the prototype's smoky decay.

### Out of Scope

- The reveal/band-enter mechanics (AI-IMP-255, working).
- Strip content (Board menu, nav, controls) beyond centering.
- Linux frameless controls styling.

### Design/Approach

The band height IS the reveal threshold: TITLE_STRIP_REVEAL_PX
(46) becomes the one axis constant. (1) main: mac
trafficLightPosition y 13→17 (prototype-exact, centers 23);
win32 titleBarOverlay height 34→46 (OS controls join the axis).
(2) TitleStrip: .title-strip gets height 46px (inline from the
constant), symmetric vertical padding (0 0.6rem) with
align-items:center, gradient unchanged (now runs the full band),
plus the prototype's hairline border-bottom via a NEW :root strip
token --ew-strip-hairline (no raw color outside theme.css). Board
menu top adjusts below the taller band. (3) PathBar: .path-wrap
top:0 + height 46px + flex align-items:center (magic 0.55rem
retired); row children normalized to inline-flex/align-items:
center/line-height:1 so the ⌂ text glyph, crumb text, and the
SVG pin share one optical center.

### Files to Touch

- `apps/desktop/src/main/index.ts` (framelessWindowOptions).
- `apps/desktop/src/renderer/chrome/TitleStrip.svelte`.
- `apps/desktop/src/renderer/chrome/PathBar.svelte`.
- `apps/desktop/src/renderer/theme.css` (--ew-strip-hairline).
- e2e: any strip-geometry assertions that pinned the old height.
- `RAG/HUMAN-TESTING.md` (owner: the mac look; alph: Windows
  overlay at 46).

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [x] Lights y:17 (mac) + overlay height 46 (win32); constants
      cited to the prototype in comments.
- [x] Strip: fixed 46px band, centered row, full-run gradient,
      hairline token; Board menu clears the band.
- [x] PathBar: banded centering (top:0/height:46/center), row
      children optically normalized.
- [x] Full check:ci + chrome/shell e2e shards green (pipefail).
- [x] HUMAN-TESTING entries (both platforms).

### Acceptance Criteria

**GIVEN** the frameless shell on macOS
**WHEN** the title band reveals
**THEN** the smoky gradient visibly fills a 46px band dissolving
into the board (the prototype's decay, not a sliver)
**AND** the traffic lights, ⌂, path text, and pin share one
vertical center (y≈23)
**AND** on Windows the OS window controls center on the same axis
**AND** the reveal/band-enter behavior is unchanged.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->

Validated: check:ci green (build/units/lint/spike); e2e shell/
navigation/z-ladder/label-clearance 21/21. Geometry is prototype-
cited in comments; the e2e layer is structurally blind to the
OS band (255 lesson), so the HUMAN-TESTING entries are the real
close — owner mac look, alph Windows overlay-at-46.
