---
node_id: AI-IMP-115
tags:
  - IMP-LIST
  - Implementation
  - library
  - gallery
kanban_status: planned
depends_on:
parent_epic: [[AI-EPIC-015-library-and-cross-project-sourcing]]
confidence_score: 0.7
date_created: 2026-07-06
date_completed:
---

# AI-IMP-115-everything-scope-pull

## Summary of Issue #1

Finding something in the everything-scope gallery is a dead-end:
the action bar is browse-only and switching scopes loses the find
(doc-review cluster 4; ratified rev 0.47 §14.4). Done = a single
live everything-scope action, **Pull into this world**, that
ingests by the ordinary copy semantics and ends as a PLACE CURSOR
over the board — click places, Escape stores unplaced with a
toast.

### Out of Scope

- Bulk multi-select pull (v1 is the single focused item; bulk is
  recorded debt).
- Note-kind ingest (asset-shaped only, same as the source panel).
- Any change to this-world scope actions or the source panel.

### Design/Approach

GalleryActionBar (everything scope): enable one action wired to
the EXISTING ingest path (the mirror/source-panel family —
ingest-from-secondary with border:'none'; find the exact verb the
gallery can reach, the scope toggle already knows the library
secondary). On success: close the takeover and enter a PLACE MODE
on the active canvas — a ghosted thumbnail follows the cursor
(reuse the import/drag ghost idiom if one exists in
import-surfaces; otherwise a small screen-space element following
pointermove over the host layer), click commits an ordinary
CreatePlacement at the point (gateway path — AI-IMP-112 makes
bursts safe), Escape exits the mode leaving the node unplaced and
toasts "stored in this world — unplaced". The mode must obey the
§8.8 contract (cursor ghost is chrome, never occludes the charm
bar interactions — simplest: place mode suspends selection). If
the ingested item already exists in this world (hash recognition,
the §14.4 dedupe), pull SKIPS the copy and goes straight to place
mode with the existing node — same recognition the mirror chip
uses.

### Files to Touch

`apps/desktop/src/renderer/views/GalleryActionBar.svelte`: the
action.
`apps/desktop/src/renderer/canvas/` (import-surfaces.ts or a new
place-mode module): the cursor-carry mode.
`apps/desktop/src/renderer/chrome/takeover.ts` only if closing
with a payload needs a seam.
`apps/desktop/e2e/gallery-scope.spec.ts` (or spec home): coverage.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and
**think**. Have you validated all aspects are **implemented** and
**tested**?
</CRITICAL_RULE>

- [ ] Everything-scope bar shows Pull into this world enabled for
      a single selected asset-kind item; other actions stay
      browse-only.
- [ ] Pull ingests by content hash (or resolves the existing node
      on recognition), closes the takeover, enters place mode with
      a ghosted preview at the cursor.
- [ ] Click places at the point via the gateway; Escape stores
      unplaced with the toast; either way the mode ends cleanly
      (no stuck ghost, selection restored).
- [ ] e2e: pull → place → placement exists at click point with
      bytes copied; pull → Escape → node exists unplaced + toast;
      pull an already-present hash → no duplicate node.
- [ ] Full gates.

### Acceptance Criteria

**GIVEN** the artist finds an image in everything scope
**WHEN** they hit Pull into this world and click a spot on their
board
**THEN** the image is copied into this project and placed exactly
there in one continuous gesture
**AND** pressing Escape instead stores it unplaced with a toast
naming where it went.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->
