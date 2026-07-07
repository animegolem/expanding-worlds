---
node_id: AI-IMP-168
tags:
  - IMP-LIST
  - Implementation
  - gallery
kanban_status: planned
depends_on:
parent_epic:
confidence_score: 0.7
date_created: 2026-07-07
date_completed:
---


# AI-IMP-168-gallery-quick-look-and-size

## Summary of Issue #1

The EPIC-008 sign-off audit surfaced §17 item 27's two unbuilt
clauses — both ratified at rev 0.55 §14.4 but never implemented:
the gallery's THUMBNAIL-SIZE SLIDER and SPACE QUICK LOOK. Space is
already reserved and swallowed in the grid's keydown ("Space is
RESERVED for preview (rev 0.25)") — the preview itself never
shipped; no size control exists. Done means: a size slider rescales
the bucketed grid live (app-tier preference, persists), and Space
on the cursor cell opens a full-size preview overlay (the §8.8
modal family — board dimmed, Esc/Space/click-off closes, arrows
move the cursor WITH the preview open, Quick Look idiom), both
e2e-proven.

### Out of Scope

- Video/PDF preview (images only — the universal viewer epic owns
  rich kinds; this overlay is its gallery-local cousin and should
  not grow renderers).
- Gallery facet/scope changes.

### Design/Approach

Slider: a small range control in the gallery header driving the
grid's cell-size variable (find the bucketed-grid sizing seam in
GalleryView; virtualization must re-bucket on change). App-tier
setting `galleryThumbSize` (no migration). Quick Look: an overlay
in the takeover family within the gallery takeover — full-size
`ew-asset://` image (original, not thumb), filename/title caption,
registerInputBlocker NOT needed (gallery is already a takeover);
Space toggles, Esc closes, ArrowLeft/Right move the gallery cursor
and swap the preview (the Quick Look idiom). Respect the existing
cursor/selection model — preview never changes selection. E2E:
slider changes cell size and persists across relaunch; Space opens
preview on the cursor cell, arrows swap it, Esc returns focus to
the grid.

### Files to Touch

`apps/desktop/src/renderer/views/GalleryView.svelte` (+ a small
QuickLook component beside it).
`apps/desktop/e2e/gallery.spec.ts` extension.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [ ] Size slider rescales the virtualized grid live; app-tier
      persistence across relaunch (e2e).
- [ ] Space Quick Look: open/close/arrow-swap on the cursor cell;
      original-resolution asset; selection untouched (e2e).
- [ ] Tokens only (guards green); gallery keyboard map updated in
      the §8.2 registry if new bindings are declared.
- [ ] Gates: `pnpm -r build`, `pnpm -r test`, `pnpm lint`, desktop
      e2e hidden.
- [ ] HUMAN-TESTING entry appended at merge by the lead.

### Acceptance Criteria

**GIVEN** the gallery
**WHEN** the size slider moves
**THEN** thumbnails rescale live and the choice survives relaunch
**GIVEN** a cursor cell
**WHEN** Space is pressed
**THEN** a full-size preview opens; arrows walk neighbors; Esc
returns to the grid with selection unchanged.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->
