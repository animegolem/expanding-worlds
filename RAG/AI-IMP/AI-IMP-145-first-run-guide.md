---
node_id: AI-IMP-145
tags:
  - IMP-LIST
  - Implementation
  - design-pass
  - onboarding
kanban_status: completed
depends_on: [AI-IMP-131]
parent_epic: [[AI-EPIC-019-public-face]]
confidence_score: 0.7
date_created: 2026-07-07
date_completed: 2026-07-07
---


# AI-IMP-145-first-run-guide

## Summary of Issue #1

EPIC-019's first-run walkthrough has final-candidate content (rev
0.55; First-Run Document t1): seven pages in the taped-paper
voice — 1 "A board for your pictures" · 2 "Your pictures are safe"
(LOAD-BEARING, never cut) · 3 cursor zones + tooltips-teach · 4
notes + [[links]] · 5 boards-in-boards · 6 tags/search/gallery/
trash-keeps-whole · 7 the optional "What do you plan to make?"
pick (three workflows, filters example ideas only). Arc rules: one
idea per page, ≤3 sentences, no feature names, no "node"; skip on
every page, never nags, never shows again (a settings action
replays); "start" lands INSIDE the seeded example. Done means the
guide runs exactly once on true first open, renders the ratified
copy verbatim on paper styling (Maple, dot progress, board visible
behind), and lands in the seeded example.

### Out of Scope

- Workflow picks seeding real starter worlds (deferred, queued).
- Seed-content changes (owner + tester curate).
- Marketing/public-face beyond this surface.

### Design/Approach

A first-open overlay in the takeover family (board visible
behind, per the mock): paper card, Maple text (131), dot progress,
`next ›`/`start ›`/`skip` grammar. Copy from the ratified verbatim
set — a `first-run-copy.ts` module holding the exact strings so
tests assert verbatim (content drift = test failure). Shown-once
rides an app-tier setting; Settings gains "replay the guide" in
Behavior. Page 7's pick stores the choice app-tier for the
example-ideas filter (consumer may be future; store the fact).
E2E: fresh profile shows the guide; skip → never again; replay
action works; page-2 copy asserted verbatim.

### Files to Touch

`apps/desktop/src/renderer/chrome/FirstRunGuide.svelte` (new) +
`first-run-copy.ts` (+ vitest verbatim).
App boot seam for true-first-open detection (app settings).
`views/SettingsView.svelte`: replay row.
`apps/desktop/e2e/first-run.spec.ts` (new; fresh-profile launch
pattern exists in e2e helpers).

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [x] Seven pages, ratified copy verbatim (unit), paper voice on
      tokens + Maple, dot progress.
- [x] Shows exactly once; skip everywhere; settings replay; e2e
      covers all three.
- [x] "start" lands inside the seeded example (e2e asserts the
      example board is active).
- [x] Page-7 pick stored; no other effect yet (recorded).
- [x] Gates: `pnpm -r build`, `pnpm -r test`, `pnpm lint`, desktop
      e2e hidden.
- [x] HUMAN-TESTING entry appended at merge by the lead (does the
      arc teach without preaching; page-2 trust moment).

### Acceptance Criteria

**GIVEN** a fresh profile's first open
**THEN** the guide walks seven pages with the ratified copy, skip
always available, and start drops into the seeded example
**AND** no subsequent launch ever shows it unbidden.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->

- **Suite-wide guide suppression.** Every e2e spec launches a fresh
  `EW_APP_CONFIG_DIR`, so the once-on-first-open guide would otherwise
  render its board-blocking takeover in all ~19 apps. Chose a
  read-only injection in main's `app-settings:get` handler gated on
  `EW_SUPPRESS_FIRST_RUN` (defaulted to `'1'` in playwright.config,
  which all specs inherit via `...process.env`); the first-run spec
  opts back in with `'0'`. Injected on read only — never persisted, so
  a real dismissal still writes `firstRunSeen` normally. This is the
  only main-side change (5 lines) plus one line in playwright.config.
  Verified no regression across settings/gallery/gallery-scope/
  library-seed/shell specs (17 passed).

- **`start` landing seam.** The seeded example lives in the LIBRARY
  slot, reachable only through the gallery's everything scope
  (storyboard screen 20 — "the library opens pre-arranged"); the
  primary project is never seeded, and switch-project is deferred. So
  `start ›` (a) ensures the example library exists — reusing the
  gallery's create-new IPC seam (`secondary.open` library
  createIfMissing → close → designate), idempotent when a library is
  already designated — then (b) opens the gallery takeover straight
  into everything scope via a one-shot flag GalleryView consumes on
  mount (`consumeGalleryEverythingRequest`). The e2e asserts the
  example board is active by the 3 seed artist-board cells rendering.
  The GalleryView change is 3 additive lines; ordinary gallery opens
  keep the this-world default.

- **skip vs. start semantics.** Implemented `skip` as a uniform bail
  on every page (mark seen, dismiss, stay on the board) and `start ›`
  (page 7 only) as the lander into the seeded example — matching the
  ticket's explicit contract ("skip everywhere; never again" vs
  "start lands inside the seeded example"). Storyboard screen 19's
  softer note that page-7 skip could ALSO drop into the example was
  not adopted, to keep skip's meaning consistent; flagged for the
  owner's feel pass.

- **Paper voice on tokens.** The card uses the existing `--ew-paper-*`
  palette + `--ew-font-editor` (Maple) + `--ew-scrim`/`--ew-drag-
  shadow`; the active dot and next/start link use `--ew-paper-info-
  text` (the paper's accent, matching the mock's link colour). No raw
  hex — the theme guard test scans the whole renderer tree and passes.
  Theme-aware for free (paper tokens invert on glass).
