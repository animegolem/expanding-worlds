---
node_id: AI-IMP-302
tags:
  - IMP-LIST
  - Implementation
  - chrome
  - takeover
  - design-adoption
kanban_status: completed
depends_on:
  - AI-IMP-301
parent_epic: [[AI-EPIC-030-the-ratified-law-wave]]
confidence_score: 0.75
date_created: 2026-07-16
date_completed: 2026-07-17
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

- [x] Round-1 review: verify takeover mount/state paths and the
      shipped ☰/strip behavior; record corrections here first.
- [x] Rail retires on takeover open, flies home on close (240ms,
      panel-arrive reversed); board mode untouched.
- [x] Dock band morphs to ModeSwitcher + ⌕ (no ☰) and back; mode
      switching swaps takeover WITHOUT replaying the beat.
- [x] Reservation: rail band released during takeover; restored on
      close; takeover insets relaxed per kit (right 24 / bottom 64).
- [x] esc/✕/click-out all play the same reset (click-out via
      AI-IMP-301's swallow seam).
- [x] e2e: open outline → rail absent, band shows switcher; switch
      to gallery in place; close → rail back, tools back; assert
      reservation values both states (DOCK-GEO-04 recipe applies).
- [x] Evidence bundle: screenshots at both band identities + mid
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

#### Round-1 source verification (2026-07-16)

- The current chrome is the exact inverse of ruling 40: named takeovers hide
  PathBar/Dock/Identity but leave CharmRail mounted
  (`renderer/chrome/ChromeLayer.svelte:69-79`). `TakeoverKind` is only
  outline/settings/gallery/trash (`renderer/chrome/takeover.ts:16-31`);
  Search is a separate centered-layer store and scrim
  (`renderer/chrome/search.ts:1-40`;
  `renderer/chrome/SearchPalette.svelte:320,368-370`).
- The ticket's `takeoverActive` presentation driver is unsafe. That function
  intentionally also includes unnamed input blockers such as the big editor,
  first-run guide, and crop editor (`renderer/chrome/takeover.ts:49-76`);
  those modal-family states must not morph the dock. Presentation state must
  instead be the union of a named takeover and the centered Search layer.
- Search must remain a layer, not be promoted into `TakeoverKind` (RFC
  §8.3). Opening it from the takeover band must preserve the underlying named
  view and return there on close. Current behavior instead closes a named
  takeover before opening Search (`renderer/chrome/CharmRail.svelte:62-78`),
  while `search.ts:40` forcibly closes Search whenever any takeover/input
  blocker becomes active; both seams need correction without changing
  Search's centered-palette physics.
- “All shipped takeovers” includes Trash as well as outline/gallery/settings
  (`renderer/chrome/TakeoverLayer.svelte:46-82`). Search, Settings, and Trash
  have no member in the three-projection ModeSwitcher, so their band should
  show no false active projection. Graph is deliberately deferred in current
  chrome (`renderer/chrome/CharmRail.svelte:40-45`); its new switcher cell must
  remain visible inert-with-reason rather than become a dead click or invent
  graph content. **Ruling requested:** ratify no active triad member for
  Search/Settings/Trash and visible disabled-with-reason for Graph.
- Geometry is slightly misstated: the current takeover inset is right
  `56+24=80` and bottom `64+24=88`, not bottom 64
  (`renderer/chrome/TakeoverLayer.svelte:94-100`). Kit 1.5's migration target
  is total right 24 / bottom 64 after the rail release, as the checklist says.
  The reservation provider also needs presentation-state notification; a
  density-only read cannot release/restore the rail band.
- Focused repair scope: introduce a narrow takeover-chrome presentation
  state, render one persistent bottom-band component through in-place mode
  switches, retire/restore the rail on its 240ms beat, release the rail band,
  relax the takeover host, and keep board mode byte-for-byte. AI-IMP-301 owns
  the click-out sequence; this ticket composes its close with the same reset.

#### Implementation and validation (2026-07-16)

- Presentation now derives only from a named takeover or the centered Search
  layer. Search preserves an underlying named view, while unnamed input
  blockers retain the board chrome. The persistent dock renders either board
  tools or the three-projection switcher plus Search; Graph is visibly inert
  with its deferred reason, and Search/Settings/Trash assert no false mode.
- The rail and dock identities use the ruled 240ms fly beat. Initial mount
  suppresses the entrance animation so ordinary board launch remains stable;
  switching named modes updates only the active mark. Reservation reporting
  releases the rail to zero and the takeover host uses total right 24 / bottom
  64 until the presentation closes.
- Composing AI-IMP-301 exposed two integration boundaries during the focused
  gate: the takeover dismissal guard initially classified the persistent band
  as outside content, and Search's prior popover rung sat above chrome. Both
  were corrected at the cause: the band/window furniture are explicit guard
  exclusions, and the Search layer now remains above takeover content but below
  persistent chrome.
- Validation: `pnpm -r build` green; reservation unit 4/4; focused Playwright
  17/17 across shell, reservation-frame, gallery, search, and loose-note-trash.
- The full desktop gate caught an undefined `--ew-font-ui` reference on the
  new switcher. Chrome already inherits the platform UI face, so the repair is
  to remove that invented override rather than add a redundant token. The
  theme census then passed with all 578 desktop tests.
- The full e2e gate exposed a stale retention test that tried to operate the
  status perch while Trash takeover had retired the rail. It now closes Trash,
  awaits the rail's return, and dismisses the still-live condition there
  (`e2e/retention.spec.ts:33-58`). This preserves the retention flow without
  reaching through the takeover or weakening the rail-retirement ruling.
- The final Trash shard convicted a missed integration rather than stale test
  setup: a restore receipt lives in persistent toast chrome above the Trash
  takeover, but the takeover guard treated that toast action as outside
  content. It closed Trash and swallowed the action before Fly-to could run.
  The toast stack is now an explicit takeover-guard exclusion alongside the
  persistent band/window furniture (`renderer/chrome/TakeoverLayer.svelte:65-73`),
  and the existing cross-canvas Trash regression pins close-then-navigate.
- Evidence bundle captures (1280×800, compact): board identity
  `/private/tmp/law-wave-evidence-302-board.png`; outline identity
  `/private/tmp/law-wave-evidence-302-outline.png`; outline→gallery in-place
  switch `/private/tmp/law-wave-evidence-302-gallery-switch.png`; Search layer
  with persistent unmarked band `/private/tmp/law-wave-evidence-302-search.png`.
  The draft ledger's DOCK-GEO-04 readout recipe was reused, but that card binds
  only defaults-row 64↔112 reservation changes. No card currently promises the
  takeover band's identity or rail-release geometry, so the evidence finding is
  classified **missing promise**, not an exception or a claimed ledger pass.
- Round-2 Linux traces convicted a mount-order race in the new layered Search
  composition. In both `search.spec.ts` and `shell.spec.ts`, an immediate
  Escape after Search became visible reached `TakeoverLayer` (closing Outline)
  while Search remained. `SearchPalette` registered its capture listener in a
  post-render `$effect`, leaving that fast-runner interval. Escape capture is
  now declarative `<svelte:window>` state mounted with the palette DOM; it also
  prevents the default and stops the same event before the underlying view.
- Round-3's Windows smoke and Linux shard 4 disproved that diagnosis: the
  declarative listener was present, yet Search still remained while Outline
  closed (Actions run 29540903451, `shell.spec.ts:431-433` and
  `search.spec.ts:270-277`). The shared signature convicted focus-dependent
  ownership instead. `OutlineView`'s earlier capture listener maps bare Escape
  to Return whenever the event target is not an input, then calls
  `stopImmediatePropagation` (`renderer/views/OutlineView.svelte:330-368`;
  `renderer/outline/inventory.ts:121-133`). Svelte's window-event wrapper does
  not invoke a later declarative handler after `cancelBubble` is set, so on
  faster runners Escape arrived before Search autofocus, closed Outline, and
  suppressed Search's handler. Mac passed because the input usually owned
  focus first. The cause-level repair moves Search's top-layer peel to the
  stable `TakeoverLayer` host, mounted before every named view; the regression
  deliberately focuses the underlying takeover before Escape so correctness
  no longer depends on autofocus timing.
