---
node_id: AI-IMP-302
tags:
  - IMP-LIST
  - Implementation
  - chrome
  - takeover
  - design-adoption
kanban_status: planned
depends_on:
  - AI-IMP-301
parent_epic: [[AI-EPIC-030-the-ratified-law-wave]]
confidence_score: 0.75
date_created: 2026-07-16
date_completed:
---

# AI-IMP-302-takeover-chrome-migration

## Summary of Issue #1

RFC rev 0.73 §8.2 (kit-1.5 ruling 40, wired in the Outliner/
Gallery/Graph/Search kits and grammar §1/§5): when a takeover
opens, the vertical charm rail RETIRES and the bottom band changes
identity into the takeover's chrome — the ⊛ ▤ ⊞ mode switcher +
⌕. The strip's universal ☰ NEVER duplicates (lead ruling on the
kit's bar-☰: the kits show ☰ in the bar; the RFC text is
normative — ModeSwitcher + ⌕ only). Closing (✕ / esc / click-out)
resets in one 240ms ease-out: the bar morphs back to tools, the
rail flies home (panel-arrive reversed). Board mode is untouched.
The rail band RELEASES its reservation while retired (§8.8.3) and
takeover panels relax into the freed edge (kit: right 80 → 24,
bottom 64). Today the rail floats in negative space over invisible
boards — the feel pass's structural finding. Done means: all
shipped takeovers present the migrated chrome, the reset beat
plays, and the reservation releases/restores correctly.

### Out of Scope

The graph takeover's content (still deferred); settings sheet
redesign beyond respecting the released band; any dock tool
changes in board mode; the notes epic.

### Design/Approach

Round-1 review verifies against source how takeovers mount
(`takeover.ts`, ChromeLayer) and how the dock/rail read state.
Approach: a `takeoverActive` presentation state (exists —
AI-IMP-160 referenced `takeoverActive()`) drives three
coordinated changes: (1) CharmRail unmounts/retires with the
fly-home beat; (2) Dock swaps its row content to the takeover
band — ModeSwitcher (⊛ ▤ ⊞, current mode marked, others switch
takeover in place) + ⌕ (opens search takeover/palette per §8.3's
two-door rule) — one 240ms ease-out morph each way, honoring the
one-fade-clock doctrine for chrome (the morph is the sanctioned
transition, cite the kit's ew-bar-arrive); (3) `reservation.ts`
reports the rail band released while a takeover is up. Takeover
panels relax insets per kit. Mode switching between takeovers must
not replay the full retire/arrive beat — the band persists, only
content marks move.

### Files to Touch

`apps/desktop/src/renderer/chrome/CharmRail.svelte`: retire/return.
`apps/desktop/src/renderer/chrome/Dock.svelte`: band identity swap.
`apps/desktop/src/renderer/chrome/reservation.ts`: rail release.
`apps/desktop/src/renderer/chrome/takeover.ts`: mode-switch seam.
Takeover hosts (Outliner/Gallery/Search/Settings components):
inset relaxation.
`apps/desktop/test/e2e/*`: migration, reset, reservation.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and
**think**. Have you validated all aspects are **implemented** and
**tested**?
</CRITICAL_RULE>

- [ ] Round-1 review: verify takeover mount/state paths and the
      shipped ☰/strip behavior; record corrections here first.
- [ ] Rail retires on takeover open, flies home on close (240ms,
      panel-arrive reversed); board mode untouched.
- [ ] Dock band morphs to ModeSwitcher + ⌕ (no ☰) and back; mode
      switching swaps takeover WITHOUT replaying the beat.
- [ ] Reservation: rail band released during takeover; restored on
      close; takeover insets relaxed per kit (right 24 / bottom 64).
- [ ] esc/✕/click-out all play the same reset (click-out via
      AI-IMP-301's swallow seam).
- [ ] e2e: open outline → rail absent, band shows switcher; switch
      to gallery in place; close → rail back, tools back; assert
      reservation values both states (DOCK-GEO-04 recipe applies).
- [ ] Evidence bundle: screenshots at both band identities + mid
      mode-switch, keyed to the ledger cards touched.

### Acceptance Criteria

**Scenario:** Opening and closing a takeover.
**GIVEN** board mode with the rail and dock shipped as v0.25.0.
**WHEN** the user opens the outline takeover.
**THEN** the rail retires, the bottom band reads ⊛ ▤ ⊞ + ⌕ (no
second ☰; the strip's remains), and the rail band's reservation
reports released.
**WHEN** the user presses ⊞ in the band.
**THEN** the gallery replaces the outline with no retire/arrive
replay.
**WHEN** the user presses esc.
**THEN** one 240ms reset restores tools and rail, and reservation
values match v0.25.0 board mode exactly.

### Issues Encountered

<!--
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->
