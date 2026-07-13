---
node_id: AI-IMP-299
tags:
  - IMP-LIST
  - Implementation
  - gallery
  - design-adoption
kanban_status: completed
depends_on: [AI-IMP-288]
parent_epic: [[AI-EPIC-029-the-kit-adoption-push]]
confidence_score: 0.8
date_created: 2026-07-12
date_completed: 2026-07-13
---

# AI-IMP-299-gallery-kit-adoption

## Summary of Issue #1

The gallery is the named One-voice 1.2 straggler: hand-rolled
segmented control and facet chips with local geometry, completion
menus at the wrong tier radius, no uniform focus ring. The kit
ruling (letter 11–12): gallery = ADOPTION, not new grammar — kit
components replace every hand-rolled control (Segmented, FacetChip,
pill TextInput + menu-tier completion, Buttons); the facet row
WRAPS, never clips; and arrange-by carries its grouping: date →
time bands (mono caption + hairline, content-register) · name →
letter headers only past ~24 items · size → flat gradient, never
banded. Done means: zero local control geometry in gallery chrome
(guard allowlist shrinks), facet wrap behavior, grouped grid per
arrange-by, and the shipped behavior suite green throughout.

### Out of Scope

- The gallery inspector + reflow (AI-IMP-204 — design open).
- Bulk-verb undo semantics (shipped in the trust wave; untouched).
- The source panel's compressed form (kit exists; adoption rides a
  later ticket if drift is found — this ticket is the in-project
  takeover).

### Design/Approach

Mechanical-sweep-plus: GalleryFacets/GalleryActionBar swap to ui/
components (Segmented and FacetChip may need extraction to ui/ if
they exist only as kit drawings — round-1 checks what ui/ already
has from prior sweeps); completion list adopts the menu tier.
Grouping renders at the grid level from the existing arrange-by
sort: date banding buckets by day/week per the kit's drawn
thresholds (round-1 reads them off the kit page), name headers
appear only past ~24 items (threshold constant, tester-tunable),
size never groups. Empty-scope vocabulary and scope-ready gate
(shipped patterns) unchanged.

### Files to Touch

`apps/desktop/src/renderer/views/` gallery components
  (GalleryView/GalleryFacets/GalleryActionBar — round-1 confirms
  paths): component swaps + grouping.
`apps/desktop/src/renderer/ui/Segmented.svelte` / `FacetChip
  .svelte`: extract/new if absent.
Guard allowlist: gallery entries retire.
e2e: facet wrap + grouping per arrange-by; existing gallery suite
  updated.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [x] Round-1: inventory gallery chrome vs ui/ components; read
      the kit's grouping thresholds; record corrections here.
- [x] Segmented + FacetChip + pill TextInput + menu-tier
      completion + Buttons adopted; no local geometry; uniform
      focus ring everywhere.
- [x] Facet row wraps at narrow widths (test at a narrow window).
- [x] Arrange-by grouping: date bands (mono caption + hairline) ·
      name letter headers past the threshold · size flat; grouping
      changes with the control live.
- [x] Guard allowlist gallery entries removed.
- [x] Existing gallery behavior suite green (facets, bulk bar,
      scope gate); full local gate green with counts read.

### Acceptance Criteria

**Scenario:** the swept gallery.
**GIVEN** a project gallery of 30+ items
**WHEN** the user arranges by name
**THEN** letter headers group the grid (past the threshold) with
kit-geometry chrome throughout
**AND** switching to size shows a flat gradient with no headers
**AND** narrowing the window wraps the facet row without clipping
**AND** the no-native/no-local-geometry guard passes with the
gallery allowlist entries gone.

### Round-1 source verification (2026-07-13)

`ui/` has Button, TextInput, ColorPicker, PickerList, Stepper, and
SwatchRow, but no Segmented or FacetChip. Both primitives must be added
to `renderer/ui/` and consumed by gallery (and then Settings for
Segmented); they are extractions of existing behavior, not new grammar.
GalleryActionBar already consumes shared Button/TextInput
(`renderer/views/GalleryActionBar.svelte:22-35`), so its remaining work
is completion-menu tier/focus adoption rather than a wholesale rewrite.

Two premises are stale. The facet root already wraps
(`GalleryFacets.svelte:141-169,242-253`), so round 2 preserves it and adds
the narrow-width regression instead of changing layout. Date grouping
also already ships with Today / This week / This month / named months /
years (`views/gallery-buckets.ts:1-13,45-98`) and GalleryView currently
uses it only for date while name/size stay flat
(`GalleryView.svelte:576-600`). The only grouping feature addition is
name-letter headers above the named constant `NAME_GROUP_THRESHOLD = 24`;
size remains flat.

There are no gallery guard exceptions to retire. The text-style guard's
allowlist is already empty and explicitly pins GalleryFacets as
non-exempt (`ui/input-styling-guard.test.ts:16-21,57-70`); the native
kit-input guard is also absolute (`ui/no-native-inputs.test.ts:6-10,
44-50`). Round 2 asserts those facts and keeps both green. Because this
wave touches `ui/`, it also adds the omitted consumer-contract pin for
`TextInput variant="bare"` promised by the nav verdict
(`ui/TextInput.svelte:77-94`) alongside the new component contracts.

Round-1 ruling: accepted as proposed; the grouping constant is exactly
24, and date/wrap/size behavior stands as shipped.

### Issues Encountered

- Implementation-time transport review found one missing premise in the
  accepted plan: the compact gallery index carried id/time/kind only,
  while labels are deliberately viewport-hydrated. Honest name-section
  boundaries were impossible without either eager-hydrating the entire
  collection or extending the existing index. The latter won: one
  nullable `noteTitle` column from the query's already-joined note row,
  no schema/write/new query. Untitled entries share `#`; raw ids never
  become headings. The correction was sent through the Codex inbox before
  the projection changed.
- Shared `Segmented` and `FacetChip` now own the kit geometry and focus
  ring. GalleryView, facets, action bar, and Quick Look consume shared
  controls; a source contract test rejects any raw `<button>` returning
  to those four files. Existing input/native guards remain absolute—there
  was no gallery allowlist to remove.
- The narrow-wrap acceptance uses an actual Electron `BrowserWindow`
  resized to 560×800; it proves the cleanup facets land below the sort
  row. Name grouping is separately pinned at 24 flat / 25+ grouped, and
  size has no headers.
- Focused validation: persistence gallery 10/10; UI/grouping/keyboard
  units 35/35; gallery e2e 22/22. Full `CI=true pnpm check` green:
  shared-ui 1, commands 19, domain 60, protocol 1, canvas-engine 410,
  persistence 659, desktop unit 565, hidden-window e2e 274 (6.3m);
  eslint and spike typecheck green. The isolated clone printed its known
  non-failing `git main` diagnostic.
