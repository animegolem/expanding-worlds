---
node_id: AI-IMP-299
tags:
  - IMP-LIST
  - Implementation
  - gallery
  - design-adoption
kanban_status: planned
depends_on: [AI-IMP-288]
parent_epic: [[AI-EPIC-029-the-kit-adoption-push]]
confidence_score: 0.8
date_created: 2026-07-12
date_completed:
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

- [ ] Round-1: inventory gallery chrome vs ui/ components; read
      the kit's grouping thresholds; record corrections here.
- [ ] Segmented + FacetChip + pill TextInput + menu-tier
      completion + Buttons adopted; no local geometry; uniform
      focus ring everywhere.
- [ ] Facet row wraps at narrow widths (test at a narrow window).
- [ ] Arrange-by grouping: date bands (mono caption + hairline) ·
      name letter headers past the threshold · size flat; grouping
      changes with the control live.
- [ ] Guard allowlist gallery entries removed.
- [ ] Existing gallery behavior suite green (facets, bulk bar,
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

### Issues Encountered

