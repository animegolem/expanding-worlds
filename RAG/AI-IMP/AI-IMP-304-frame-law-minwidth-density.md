---
node_id: AI-IMP-304
tags:
  - IMP-LIST
  - Implementation
  - chrome
  - reservation-frame
  - settings
kanban_status: completed
depends_on:
parent_epic: [[AI-EPIC-030-the-ratified-law-wave]]
confidence_score: 0.8
date_created: 2026-07-16
date_completed: 2026-07-17
---

# AI-IMP-304-frame-law-minwidth-density

## Summary of Issue #1

Two rev 0.73 frame rulings need enforcement. (1) §8.8.3: the
minimum supported window width is 960 CSS px (owner-ruled, kit-1.6
ruling 41) — the shipped BrowserWindow declares no minWidth
(verified, `apps/desktop/src/main/index.ts`), so the app can be
squeezed below every geometry promise. (2) §8.8.3/§11.5: density
is a TRIAD — compact (dense cursor default) · comfortable
(cursor-friendly spacious, ~36px controls, reservations UNCHANGED)
· touch (44px targets, strip 0, bands grow; the ONLY tier that
changes the reservation frame). Shipped comfortable retains only
the 64/112 bottom reservations, incorrectly drops the strip to 0,
and uses the touch-sized 44px control rule.
Done means: the window cannot shrink below 960 wide; comfortable
delivers ~36px controls via the token system; the density plumbing
accepts `touch` as a value; the settings row's exposure of touch
follows the no-quiet-lie rule below.

### Out of Scope

Building actual touch support (no touch build exists); any
reservation value changes for compact/comfortable; kit redraws.

### Design/Approach

minWidth: declare `minWidth: 960` on the BrowserWindow (review
picks a minHeight only if one is already implied elsewhere — the
ruling covers width; do NOT invent a height floor). Density:
extend the density token plumbing (theme/chrome tokens, the
`data-density` seam AI-IMP-300 shipped) to three values; wire the
~36px control size for comfortable through the token tier so kit
components inherit it (no per-component constants). Settings row:
per the owner's "auto refused as a quiet lie" precedent, do NOT
expose a touch segment that lies on a cursor desktop — the row
stays compact·comfortable visually and `touch` remains a plumbed,
testable value awaiting a touch build (record this scoping in the
row's code comment via constraint, not narration). Round-1 review
verifies the token seam and where control sizes derive today.

### Files to Touch

`apps/desktop/src/main/index.ts`: minWidth 960.
`apps/desktop/src/renderer/**/tokens or theme seam` (review
locates): density triad + comfortable ~36px control tier.
`apps/desktop/src/renderer/chrome/reservation.ts`: accept `touch`
(strip 0; other band growth waits for published values) as a value;
assert compact unchanged and comfortable corrected to that frame.
Settings sheet component (AI-IMP-300's): row stays two segments;
plumbing accepts three.
`apps/desktop/test/**`: reservation triple-state unit; e2e resize
floor.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and
**think**. Have you validated all aspects are **implemented** and
**tested**?
</CRITICAL_RULE>

- [x] Round-1 review: verify the density seam, control-size
      derivation, and settings row shape; record corrections here
      first.
- [x] BrowserWindow declares minWidth 960; e2e (or main unit)
      proves a smaller resize request clamps.
- [x] Density plumbing accepts compact | comfortable | touch;
      compact reservation output stays byte-unchanged and comfortable
      is corrected to the same frame (regression-pinned in unit tests).
- [x] Comfortable delivers ~36px interactive control sizing via
      the token tier; dock/rail/menus inherit without
      per-component edits.
- [x] Touch value produces strip 0; unpublished grown-band numerics
      are explicitly deferred (unit only — no UI exposure).
- [x] Settings row unchanged visually (two segments); a code-level
      constraint documents why touch is unexposed.
- [x] Evidence bundle: comfortable-density screenshots keyed to
      DOCK-HIT-01's companion (~36px controls).

### Acceptance Criteria

**Scenario:** Squeezing the window.
**GIVEN** the app at 1280×800.
**WHEN** the user drags the window edge to 700px wide.
**THEN** the window clamps at 960 and every reservation-frame
surface remains per its 960 edges specimen.

**Scenario:** Comfortable density.
**WHEN** density is set to comfortable.
**THEN** interactive dock/rail/menu controls measure ~36px while
strip/rail/dock reservations are 46/56/64–112.
**AND** compact output is byte-identical to v0.25.0.

### Issues Encountered

<!--
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->

#### Round-1 source verification (2026-07-16)

- The minimum-width diagnosis is exact: `BrowserWindow` declares 1280x800
  and no `minWidth` (`apps/desktop/src/main/index.ts:808-822`). No min-height
  floor is implied by current source, so the repair remains `minWidth: 960`
  only.
- The “compact/comfortable BYTE-UNCHANGED” checklist conflicts with rev
  0.73. The old two-tier mapping deliberately made Comfortable the touch
  referent (AI-IMP-286), so current `COMFORTABLE_RESERVATION.top` is 0 and
  its unit test pins that behavior (`renderer/chrome/reservation.ts:3-21`;
  `renderer/chrome/reservation.test.ts:17-21`); theme.css repeats strip 0
  (`renderer/theme.css:311-313`). Rev 0.73 supersedes that mapping: compact
  stays byte-identical, but comfortable must be corrected to the compact
  46/56/64/112 reservation frame. Preserving comfortable byte-for-byte
  would preserve the defect.
- Comfortable also already applies 44px sizing rather than merely lacking a
  size rule: Stepper (`renderer/ui/Stepper.svelte:28`), Toggle
  (`renderer/ui/Toggle.svelte:85-86`), Segmented
  (`renderer/ui/Segmented.svelte:78-79`), Settings rows
  (`renderer/views/SettingsView.svelte:882-884`), SettingsSection
  (`renderer/settings/SettingsSection.svelte:129-130`), and ArrangePopover
  (`renderer/canvas/ArrangePopover.svelte:77`) all encode the old touch
  mapping. Scope must retier those shared/component seams to Comfortable
  ~36px and reserve 44px for Touch; this is not achievable through one
  currently existing global size token alone.
- The app settings codec and reservation type each accept only the pair
  (`renderer/settings/settings.ts:22,92-93`;
  `renderer/chrome/reservation.ts:3,44-53`), while the visible Settings row
  correctly has only Compact/Comfortable
  (`renderer/views/SettingsView.svelte:385-395`). Extend codec + root side
  effect + reservation parsing to the
  triad while leaving that row two-option as ruled.
- The kit/RFC say Touch bands “grow” but publish no numeric Touch rail, dock,
  or expanded-dock values: the kit token file defines only 46/56/64/112/24
  (`tokens/chrome.css:45-55`) and GR-5 states only that controls/bands grow.
  **STOP/ruling requested:** supply the kit-owned Touch reservation values,
  or narrow this ticket to triad plumbing + strip 0 while deferring grown-band
  output. Codex will not derive authoritative geometry by adding the 12px
  control delta.
- The draft dock ledger's statement that shipped Comfortable retained the
  frame is source-drift: only 64/112 stayed; its strip is 0. The ledger is
  read-only in this wave, so the evidence manifest will classify that as a
  REQUEST for the lead's later ledger correction rather than editing it.

#### Accepted round-1 rulings (2026-07-16)

- Compact stays byte-identical. Comfortable is corrected—not preserved—to
  the compact 46/56/64/112 frame and receives the ~36px control tier.
- Touch is accepted end-to-end with 44px controls and strip 0. Because the kit
  still publishes no authoritative grown-band numbers, rail/dock/expanded
  values remain at 56/64/112 until a later ruling; no geometry was invented.
- The cursor Settings surface stays exactly two segments. Touch remains a
  codec/root/reservation value only until a touch build can expose it honestly.

#### Implementation and validation (2026-07-16)

- `BrowserWindow` now declares only the ratified width floor
  (`main/index.ts:808-820`). The hidden-window regression asks Electron for 700px and observes
  a 960px bound (`e2e/reservation-frame.spec.ts:41-49`). No height floor was
  invented.
- The density triad is shared by the app settings codec and reservation frame.
  Comfortable structurally reuses the compact constants; Touch overrides only
  the ruled strip while the unpublished bands remain conspicuously deferred
  (`renderer/settings/settings.ts:19-23,88-95`;
  `renderer/chrome/reservation.ts:3-23,47-61`). Unit tests pin all three.
- One `--ew-control-target` tier owns 28/36/44px. Only comfortable/touch apply
  the global button target, so compact CSS remains untouched; the old local
  Comfortable=44 exceptions were removed (`renderer/theme.css:1-12,312-328`).
  The Settings row still renders Compact/Comfortable only and explains the
  touch-build fence in source (`renderer/views/SettingsView.svelte:385-397`).
- Evidence revealed a shrink-to-fit interaction missed by the numeric plan:
  36px targets made the absolutely positioned flex dock choose a 478px
  intrinsic width and wrap to 87.6px, exceeding its unchanged 64px band. The
  main row now claims its max-content width under the existing 78vw ceiling
  (`renderer/chrome/Dock.svelte:749-767`), and e2e pins the row at <=64px while
  measuring dock, corner charm, and menu targets at >=36px
  (`e2e/reservation-frame.spec.ts:51-70`).
- The full e2e gate exposed one stale pre-law assumption in the gallery facet
  regression: it asked `BrowserWindow` to shrink to 560px before checking the
  strip's wrap behavior. That setup now contradicts the ratified 960px floor.
  The test instead constrains the reusable `GalleryFacets` component to 520px
  inside a legal frame, preserving the narrow-container contract (including
  its SourcePanel use) without weakening frame law
  (`e2e/gallery-facets.spec.ts:198-210`). The focused case passed 1/1.
- Validation: `pnpm -r build` passed; focused Vitest passed 33/33; focused
  hidden-window Playwright passed 6/6, followed by the final evidence case
  1/1. Evidence `law-wave-304-comfortable-controls-final.png` passes the
  DOCK-HIT-01 comfortable companion at the 960px floor. Ledger disposition:
  **PASS** for the companion, plus **REQUEST** to correct its stale statement
  that pre-wave Comfortable already preserved the strip.
