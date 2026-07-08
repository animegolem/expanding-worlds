---
node_id: AI-IMP-200
tags:
  - IMP-LIST
  - Implementation
  - notes
  - panels
  - feel
kanban_status: planned
depends_on: []
parent_epic:
confidence_score: 0.6
date_created: 2026-07-08
---


# AI-IMP-200-panel-legibility-floor

## Summary of Issue #1

Owner review FAIL on AI-IMP-083/116 (2026-07-08): tethered notes
"render far too small in most cases, to the point they are almost
unperceivable as even open," the notebook effect isn't selling,
and undocking jumps the size 4–6× — a jarring discontinuity. Plus:
the big editor's shadows "do not read" (it opens fine). Root
shape: 116 made tethered panels scale WITH the world, so at the
zoom levels boards actually live at, a panel is a postage stamp;
the legibility floor (PANEL_LEGIBILITY_FLOOR 0.4) fades it rather
than holding it readable. Done means a tethered panel never
renders below a MINIMUM ON-SCREEN size — world-scaled until the
floor, then held at the floor (screen-fixed) instead of shrinking
away — closing most of the undock jump; and the big editor wears
a shadow that actually reads (per The Two Materials' material
rules), both themes.

### Out of Scope

- Paper anatomy (AI-IMP-194 — coordinate, likely same builder
  wave).
- The wedge bug (199) and spawn flash (193).
- Pinned-panel behavior (screen-fixed already, passed review).

### Design/Approach

Replace fade-at-floor with hold-at-floor: the panel's world scale
clamps at max(worldScale, MIN_PANEL_SCREEN_SCALE) — below the
clamp it behaves like a mini pinned panel glued to its anchor
(position still world-tracked, size screen-held). Keep a deep-zoom
fade only where even the held panel would occlude everything
(far-out overview). Tune MIN so default-size panels are readable
at typical board zoom; the undock jump then shrinks naturally —
verify the remaining ratio and record it. Big-editor shadow: token
value per Two Materials (paper casts), check both themes over art.
All constants named, owner feel-tunes.

### Files to Touch

`note/panels.ts` / `NotePanel.svelte` (scale clamp),
`NotePanels.svelte`/big-editor styles, theme.css token if needed.
E2e: panel on-screen size never below the floor across a zoom
sweep; existing world-scale specs updated to the new clamp.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [x] Hold-at-floor clamp; readable at typical zooms; deep-zoom
      behavior defined and deliberate.
- [x] Undock size ratio measured before/after and recorded.
- [x] Big-editor shadow reads in both themes.
- [x] Gates: `pnpm -r build && pnpm -r test && pnpm lint` + hidden
      e2e.
- [ ] HUMAN-TESTING entry appended at merge by the lead.

### Acceptance Criteria

**GIVEN** a tethered note at any board zoom
**THEN** it is never smaller on screen than the legibility floor —
open notes always read as open
**AND** undocking no longer multiplies the size 4–6×.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->

**Hold-at-floor.** Replaced fade-at-floor with a render clamp. The
tethered placement panel now carries two scales: `worldScale` =
`min(1, zoom)` (the true camera scale, drives only the deep-overview
fade) and the RENDER `scale` = `heldPanelScale(worldScale)` =
`max(worldScale, MIN_PANEL_SCREEN_SCALE)`. Above the floor it world-
tracks; below it, it behaves like a mini pinned panel — position still
world-tracked (glued to its node), size SCREEN-HELD at the floor. A
deep-overview fade (`tetheredPanelOverviewOpacity`) keeps the old
"dissolve, don't loom" behavior but only far out.

**Constants (named, in `note/panels.ts`; owner feel-tunes).**
`MIN_PANEL_SCREEN_SCALE = 0.5` (panel never renders below half its
default card → ≥160px wide), `PANEL_OVERVIEW_FADE_SCALE = 0.1`,
`PANEL_OVERVIEW_FADE_SPAN = 0.06` (held panel is fully opaque down to
worldScale 0.1, gone by 0.04). NB: these live in `note/panels.ts`, NOT
`chrome/feel.ts` — the brief fenced this agent out of `chrome/**`, and
they are SCALE fractions (not rendered-px), so they sit beside the panel
lifecycle. `feel.ts`'s now-unused `tetheredPanelOpacity`/
`PANEL_LEGIBILITY_FLOOR`/`FADE` were left untouched (out of scope; still
exercised by `feel.test.ts`) — a lead follow-up could delete them.

**Undock ratio measured (recorded).** Undock = tether→pin (sticky is the
full-size 320px card). Tethered rendered width vs pinned 320:
- BEFORE (fade-at-floor, scale = min(1,zoom)): zoom 0.3 → 96px →
  **3.33×**; zoom 0.2 → 64px → **5.0×** (the reported 4–6× jump).
- AFTER (hold-at-floor, floor 0.5): any board zoom ≤0.5 → held 160px →
  a flat **2.0×**.
E2e `undock (tether → pin)…` asserts ratio ≤2.1 at zoom 0.3. The
`…world-track down to a floor then HOLD…` e2e asserts width HOLDS at 160
across zooms 0.5/0.25/0.12 (no shrink) and stays opaque, fading only at
0.03.

**Big-editor shadow (The Two Materials).** The doc's rule: world content
is FLAT, floating PAPER casts a reading shadow. The big editor used
`0 18px 60px var(--ew-dialog-shadow)` — a single diffuse wash that "did
not read." Added token `--ew-paper-float-shadow` (a tight CONTACT layer +
a soft AMBIENT layer, like `--ew-drag-shadow`), themed: dark/default
`0 2px 8px rgba(0,0,0,.34), 0 20px 44px rgba(0,0,0,.52)`; light
`0 2px 8px rgba(8,10,14,.16), 0 18px 40px rgba(8,10,14,.26)`; glass
inherits the dark value (like `--ew-drag-shadow`, which glass also does
not override). `.big-editor` now uses it. E2e asserts a non-empty,
≥2-layer computed box-shadow.

**Also fixed (adjacent, in the undock path):** `pinHere()` never
scheduled a relayout (unlike `tearOut()`), so pinning at board zoom left
the sticky at the held tethered scale until the next pan. Added
`schedule()` so the undock resize lands immediately. (Cross-referenced
in AI-IMP-199.)

**199 coupling:** this hold-at-floor is ALSO the cure for AI-IMP-199's
"can't open anymore" half — an open note at board zoom is now visible and
interactable instead of faded to `pointer-events:none`. Same root cause
(AI-IMP-116 world-scale fade).
