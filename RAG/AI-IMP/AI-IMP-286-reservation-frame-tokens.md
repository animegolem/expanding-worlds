---
node_id: AI-IMP-286
tags:
  - IMP-LIST
  - Implementation
  - chrome
  - tokens
  - design-adoption
kanban_status: completed
depends_on: []
parent_epic: [[AI-EPIC-029-the-kit-adoption-push]]
confidence_score: 0.85
date_created: 2026-07-12
date_completed: 2026-07-12
---

# AI-IMP-286-reservation-frame-tokens

## Summary of Issue #1

RFC §8.8.3 (rev 0.71) makes the chrome bands a named RESERVATION
FRAME, but the shipped clamp logic (`anchored-placement.ts`) and
band furniture (dock/rail/strip) use scattered per-surface numbers.
Remediation: band tokens land in `theme.css` — `--ew-reserve-strip`
· `--ew-reserve-rail` · `--ew-reserve-dock` · `--ew-reserve-gutter`
(names normative; initial values from the kit-1.4 proposal: 40 / 56
/ 64→112 armed / 24; left edge reserves nothing) — plus the density
token pair (`compact` / `comfortable`) as ONE switch, and every
floating/anchored/takeover surface clamps inside frame + gutter
through the shared helper. A dev-only `showReservations` tint
overlay makes the frame visible for review. Done means: one token
source, zero magic band numbers in clamp math, guard test enforcing
it, tinted overlay demonstrable.

### Out of Scope

- Touch behavior beyond the token switch (strip=0 at comfortable
  density is a token VALUE, not new input handling).
- The dock's defaults row itself (AI-IMP-289) — this ticket only
  makes the 64→112 growth a token the dock will drive.
- Charm-halo clearance (AI-IMP-287).

### Design/Approach

Tokens in `theme.css` beside the existing tiers; a small
`reservation.ts` module in chrome/ reads them once per change (CSS
var read + resize/density events, never per-frame) and exports the
frame rect for clamp consumers. `anchored-placement.ts` swaps its
edge margins for the frame; `takeover.ts` insets takeovers to frame
+ gutter (the outliner kit retrofit shape). Guard test in the
z-guard pattern: grep-level assertion that chrome modules reference
tokens, not literal band numbers. `showReservations` renders four
tinted divs in `ChromeLayer.svelte` behind a dev flag (settings dev
section or query param — follow the existing dev-toggle pattern).
Density: `data-density` attribute on the app root driving the token
pair; the settings segment ships in AI-IMP-300.

### Files to Touch

`apps/desktop/src/renderer/theme.css`: band + density tokens.
`apps/desktop/src/renderer/chrome/reservation.ts`: new — frame
  rect provider + density accessor.
`apps/desktop/src/renderer/chrome/anchored-placement.ts`: clamp
  against the frame.
`apps/desktop/src/renderer/chrome/takeover.ts` +
  `TakeoverLayer.svelte`: inset to frame + gutter.
`apps/desktop/src/renderer/chrome/ChromeLayer.svelte`:
  showReservations tint overlay.
`apps/desktop/src/renderer/chrome/Dock.svelte`, `CharmRail.svelte`,
  `TitleStrip.svelte`: consume band tokens for their own extents.
`apps/desktop/src/renderer/*guard*.test.ts`: new reservation guard.
`apps/desktop/e2e/`: one spec asserting takeover inset + clamp.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [x] Round-1: verify current clamp margins/band numbers in
      anchored-placement.ts, takeover.ts, Dock/CharmRail/TitleStrip
      against this ticket; record corrections here.
- [x] Add band + density tokens to theme.css; document "names
      normative, values kit-owned" in a comment citing §8.8.3.
- [x] New chrome/reservation.ts: frame rect from tokens + window
      size; density switch via data-density; unit tests.
- [x] anchored-placement.ts clamps inside frame + gutter; unit
      tests updated (popover near each edge lands inside frame).
- [x] takeover.ts/TakeoverLayer inset to frame + gutter; rail
      remains visible over any takeover.
- [x] Dock/CharmRail/TitleStrip extents read the tokens; no
      literal 40/56/64 remain in chrome band math.
- [x] Guard test fails on new literal band numbers in chrome/.
- [x] showReservations dev toggle tints the four bands.
- [x] E2E: takeover inset + one anchored-surface clamp assertion;
      full local gate green with counts read.

### Acceptance Criteria

**Scenario:** an anchored panel opens near the dock while a tool is
armed.
**GIVEN** the app at desktop density with showReservations on
**WHEN** a popover is opened from a control adjacent to the bottom
band
**THEN** the popover's rect stays inside the reservation frame plus
gutter on all four sides
**AND** the dock band token reports the grown value while a tool is
armed
**AND** switching data-density to comfortable sets the strip band
to 0 and the popover re-clamps without a reload.

### Issues Encountered

#### Round-1 source verification (2026-07-12)

- The ticket's "kit-1.4 proposal" attribution was incorrect: the
  reservation names are normative in RFC §8.8.3, but the tracked kit
  token file does not define their values. Preserve shipped geometry in
  this adoption wave: strip 46 (with an open kit-1.3 design question),
  rail 56, dock 64/112 expanded, and gutter 24.
- `placeAnchored` and its DOM action already form the shared pure/DOM
  placement seam. The defect is adoption: production callers supply
  scattered margins and no reservation bands. Reservation bands become
  the helper default; caller-specific anchor gaps remain unchanged.
- Takeover geometry is owned by `TakeoverLayer.svelte` CSS, not
  `takeover.ts`. Its ad-hoc settings inset is replaced by reservation
  custom properties.
- `compact` is the shipped desktop geometry; `comfortable` is the RFC's
  touch referent (including strip 0). The session-only switch belongs on
  `document.documentElement` and follows the existing feel-dial dev
  chord/debug-seam convention rather than settings or a query string.
- Furniture stays positioned inside its reservation band rather than
  stretching to fill it. The provider exposes the dock's 112 expanded
  value while this ticket leaves the shipped dock expansion state false.
- Round-3 post-merge correction (2026-07-12): the DOM adapter
  (`placeAnchoredElement`) let legacy caller margins override the
  frame gutter on defaulted bands — viewport edges landed at 4/8px
  instead of 24. Convicted by the strengthened e2e pin (an anchored
  surface, SearchPanel, in addition to the takeover) after the lead
  had merged round 2; fixed in one commit (bands defaulted → gutter
  owns the edge; explicit bands remain the opt-out seam with their
  own margin). Lesson recorded: the acceptance item asked for an
  anchored surface AND a takeover — the first spec asserted only
  the takeover despite its name; weak evidence hides adapter
  mismatches.
