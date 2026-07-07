---
node_id: AI-IMP-168
tags:
  - IMP-LIST
  - Implementation
  - gallery
kanban_status: completed
depends_on:
parent_epic:
confidence_score: 0.7
date_created: 2026-07-07
date_completed: 2026-07-07
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

- [x] Size slider rescales the virtualized grid live; app-tier
      persistence across relaunch (e2e).
- [x] Space Quick Look: open/close/arrow-swap on the cursor cell;
      original-resolution asset; selection untouched (e2e).
- [x] Tokens only (guards green); gallery keyboard map updated in
      the §8.2 registry if new bindings are declared.
- [x] Gates: `pnpm -r build`, `pnpm -r test`, `pnpm lint`, desktop
      e2e hidden.
- [x] HUMAN-TESTING entry appended at merge by the lead.

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

**Size slider ↔ virtualization.** The bucketed grid was already pure
index math — the cell edge was a `const CELL = 168` read by three
derivations (`columns`, `layout`'s row tops, `visibleRows`' overscan
height) and by `scrollIndexIntoView`. Promoting it to a `$state`
(`cellSize`, default CELL, clamped 112–264 step 8) means a slider move
recomputes every downstream `$derived` — the grid re-buckets and
re-lays-out on the next tick with no reload; the render window
naturally shrinks/grows. The CSS side is one custom property
`--cell` set on the grid element from `cellSize`; `.cell` reads
`width/height: var(--cell, 168px)`. Persisted app-tier as
`galleryThumbSize` via the existing `window.ew.settings` bridge
(`setApp` on the slider's `change`, live rescale on `input` so the
settings file is written once per drag, not per pixel); read back in
an `onMount`. No migration (app-tier JSON).

**Non-image-kind decision (recorded).** Quick Look is IMAGES ONLY
(§14.4: the gallery-local cousin of the universal viewer grows no
renderers). `openPreview()` is a silent no-op unless the cursor cell
is kind `image` with a `contentHash` — a board or note cursor + Space
does nothing (Space still `preventDefault`ed so it never
page-scrolls). While the preview is open, arrows walk the cursor
through cells of ANY kind (cursor semantics stay simple ±1 / row);
landing on a non-image shows an honest "No full-size image for this
item" line rather than a blown-up glyph. Chose this over "skip
non-images during nav" because the cursor is the grid's, and desyncing
it from a plain step would surprise; over "show the cell art" because a
note/board has no larger rendition to reveal.

**Esc layering.** `TakeoverLayer` (fenced `chrome/`) closes the gallery
on a BUBBLE-phase window Escape listener. GalleryView already owned a
CAPTURE-phase window Escape listener (the rev-0.25 peel: tag field →
selection → decline). Quick Look became the OUTERMOST peel in that same
capture listener: when `previewOpen`, Esc `preventDefault` +
`stopPropagation` + `closePreview()` and returns — the takeover's
bubble listener never sees it, so closing the preview never closes the
gallery. Space/arrow handling stays in `onGridKeydown` (focus rides the
cursor cell, which `setCursorIndex` re-focuses on every move), gated by
an early `if (previewOpen)` modal branch so the grid's other keys are
inert under the preview.

**Deviation — caption has no filename.** The ticket asked for a
"title/filename" caption; the gallery read model (`getGalleryItems`,
in the FROZEN `packages/persistence`) carries no original filename, so
the caption shows the item's title (`label` — note title, else
`shortCode(id)`) plus the pixel dimensions (`width × height`, which the
read model DOES carry). Adding a filename column would touch a fenced
package; recorded as debt rather than scope-creep here.

**Keybinding registry.** Bare Space's declaration moved from "Toggle
selection" to a new `gallery-quick-look` binding; the selection toggle
is now `Mod+Space` (matching the long-standing dispatch — bare Space
was reserved, Mod+Space toggled). Display-only, per §8.2. The existing
`gallery-keyboard.spec` "bare Space is reserved" case still passes (it
presses Space on a NOTE cell, now an image-only no-op); its comment was
updated to say so and to assert the preview does not open.
