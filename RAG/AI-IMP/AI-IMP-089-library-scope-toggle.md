---
node_id: AI-IMP-089
tags:
  - IMP-LIST
  - Implementation
  - gallery
  - library
kanban_status: completed
depends_on: [AI-IMP-088]
parent_epic: [[AI-EPIC-015-library-and-cross-project-sourcing]]
confidence_score: 0.8
date_created: 2026-07-06
date_completed: 2026-07-06
---

# AI-IMP-089-library-scope-toggle

## Summary of Issue #1

§14.4 (rev 0.22): the gallery's primary toggle — *this world ·
everything* — selects WHOSE gallery is shown. "Everything" IS the
designated library project's gallery (the mirror makes it the
converging superset); the tag facet always shows the active scope's
vocabulary; when the current world's mirror is off, the gallery
says so instead of pretending "everything" is complete. Includes
the library designation UX: creating/designating the library
project (packaging, not schema — a `libraryProjectDir` app setting
from AI-IMP-088, set through a simple settings row / first-use
prompt in the gallery toggle). Done = the toggle lives in the
gallery header, everything-scope browses the library over the
secondary seam, honest empty/off states, e2e.

### Out of Scope

- Ingest/drag-out of the everything scope (AI-IMP-090/091 own
  cross-project material movement; this ticket is BROWSE only —
  place actions disable outside this-world scope for now).
- The inbox mirror itself (AI-IMP-092).

### Design/Approach

GalleryView gains a scope state (default this-world). Everything
scope routes getGalleryIndex/getGalleryItems through ew.secondary
against libraryProjectDir (read-only), reusing the identical query
names — the seam mirrors the primary's query surface, so the view
only swaps the transport. Thumbnails resolve via the secondary's
derivatives dir (ew-asset protocol gains a source discriminator or
the secondary serves through a parallel scheme — decide with the
088 seam, smallest honest change wins). No library designated →
the toggle's everything side opens the designation prompt. Mirror
off for this world → a quiet notice line under the header.
Selection/keyboard model unchanged (it is scope-agnostic over
indices).

### Files to Touch

`apps/desktop/src/renderer/views/GalleryView.svelte` + facets
header; `apps/desktop/src/main/` thumbnail serving for secondary;
`apps/desktop/e2e/gallery-scope.spec.ts` (new).

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and
**think**. Have you validated all aspects are **implemented** and
**tested**?
</CRITICAL_RULE>

- [x] Scope toggle in the gallery header; this-world default;
      state survives facet changes, resets on project switch.
- [x] Everything scope queries the library over the secondary seam;
      thumbnails render; tag facet shows library vocabulary.
- [x] No-library state: designation prompt (create new or pick
      existing directory); honest mirror-off notice line.
- [x] Place/board actions disabled outside this-world scope.
- [x] e2e: seed a library fixture, toggle scopes, assert entries
      and tag vocabularies swap; primary project untouched.
- [x] Full gates.

### Acceptance Criteria

**GIVEN** a designated library with tagged images and a world with
its own material
**WHEN** the artist flips this world · everything
**THEN** the grid and tag facet swap between the two projects'
content, place actions grey outside this-world, and with the
world's mirror off a notice says everything may be incomplete.

### Issues Encountered

Landed as specified; decisions and deviations worth knowing:

- Thumbnails took the "source discriminator" option: asset/thumb
  URLs carry `?scope=source`, main records target→dir on a
  successful `secondary:open` (cleared on close, close-project, and
  utility death — the slots die with the process) and re-roots the
  ew-asset read there. ASSET_URL_RE gained the same trailing-query
  tolerance THUMB_URL_RE already had. A closed slot answers 404,
  which the renderer's existing fallback chain absorbs. Immutable
  cache headers stay correct cross-scope (content-addressed bytes).
- "Resets on project switch" is satisfied structurally: GalleryView
  unmounts with the takeover and owns all scope state; nothing
  persists. Index staleness across the transport swap extends the
  existing itemsGeneration counter (refresh now drops rows whose
  generation moved); a separate non-reactive scopeEpoch fences the
  ASYNC open handshake only (flip-away mid-open releases the slot
  unshown) — the generation can't serve there because project
  pushes also bump it.
- Beyond place/trash, TAG is also disabled in everything scope: the
  bar executes against the PRIMARY transport, so tagging library
  node ids would write garbage into the world. Enter's activate()
  and cell drag-out are fenced too (foreign ids must not reach
  panels/dive/board import). Delete's keyboard path is guarded
  inside trashSelection so both routes share one guard.
- Designation stores `libraryProjectDir` only AFTER a successful
  read-only open validates the directory; "create new" from the
  prompt was NOT built (v1 per ticket brief: pick existing, plain
  text input — no <datalist>, it segfaults hidden e2e windows).
- mirrorOff resets to false on each everything entry so a stale
  true can't flash the notice before getSettings answers.
- Not run from the worktree: generate-index.sh and the AI-LOG entry
  (both outside this agent's file fence; lead's merge pass owns
  them).
- Gates: 36/36 desktop units, pnpm -r build, lint clean; e2e 7/7
  (gallery-scope 2 new, gallery 2, gallery-facets 1, secondary 2)
  plus insurance runs of gallery-keyboard/-selection (10/10 with
  the overlap).

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->
