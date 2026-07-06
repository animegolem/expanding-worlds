---
node_id: AI-IMP-091
tags:
  - IMP-LIST
  - Implementation
  - chrome
  - library
kanban_status: planned
depends_on: [AI-IMP-088, AI-IMP-090]
parent_epic: [[AI-EPIC-015-library-and-cross-project-sourcing]]
confidence_score: 0.7
date_created: 2026-07-06
date_completed:
---

# AI-IMP-091-open-as-source-panels

## Summary of Issue #1

§14.4: every row in the project charm's menu offers two actions —
switch, and OPEN AS SOURCE. A source opens as a pinned panel (the
compressed gallery: same facets, a mini grid) obeying ordinary
panel physics; dragging out of it runs 090's ingest into the
current world, and the panel header carries the session-scoped tag
border control (none · all · pick; defaults all-from-library,
none-from-world). Done = source panel opens from the project menu,
browses read-only, drags ingest onto the board (placed at the drop
point via the ordinary placement flow after ingest), border control
applies to every pull, e2e.

### Out of Scope

- Multiple simultaneous source panels (one source at a time,
  replace-on-open — 088's slot model).
- The full gallery's keyboard model inside the mini grid (mouse
  browse + facets is the compression; keyboard parity is polish).
- "Pick" tag border UI beyond a simple checkbox list.

### Design/Approach

Project charm menu rows gain the second action. The panel is a new
chrome component reusing gallery row/cell rendering and facet
machinery against the secondary transport (089 establishes the
pattern; extract the shared query-transport shim rather than
duplicating). Drag out: HTML5 drag with a custom MIME carrying
{contentHash, sourceTags}; the canvas drop handler (import-surfaces)
recognizes it, calls ingest (border decision from the panel
header), then places the new node at the drop point
(CreatePlacement) — placement is this-world material after ingest,
ordinary in every way. Panel is screen-fixed (pinned physics),
closable, survives navigation like pinned note panels (§8.5
grammar).

### Files to Touch

`apps/desktop/src/renderer/chrome/` project menu + new
SourcePanel.svelte (+transport shim shared with GalleryView);
`apps/desktop/src/renderer/canvas/import-surfaces.ts` drop
recognition; `apps/desktop/e2e/source-panel.spec.ts` (new).

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and
**think**. Have you validated all aspects are **implemented** and
**tested**?
</CRITICAL_RULE>

- [x] Project menu rows: switch + open-as-source; source opens the
      pinned mini-gallery against the secondary seam.
- [x] Mini grid: thumbnails, sort + kind + tag facets, read-only.
- [x] Header border control: none/all/pick, session-scoped,
      defaults by source kind (library → all, world → none).
- [x] Drag out → ingest with the border decision → placement at
      the drop point; dedupe pull places without recopying.
- [x] Panel physics: screen-fixed, survives navigation, closes
      cleanly (secondary released when panel closes).
- [x] e2e: open fixture as source, pull one tagged image onto the
      board, assert placement + copied bytes + merged tags.
- [x] Full gates.

### Acceptance Criteria

**GIVEN** a world open and a library on disk
**WHEN** the artist opens the library as source and drags an image
onto the board
**THEN** the bytes copy in, tags carry per the header decision, a
placement lands at the drop point, and the source project is
untouched.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->

Landed as specified; deviations and decisions worth knowing:

- No project-list menu existed (the ⧉ charm was a deferred stub, and
  the app is single-project), so the "every row offers two actions"
  shape compresses to a two-action popover on the ⧉ charm itself:
  a deferred "Switch project…" row plus the live open-as-source
  directory prompt (plain text field, the 089 designation idiom —
  never `<datalist>`, AI-IMP-069). Rows re-derive naturally when a
  project list arrives.
- The one-source-slot ownership moved into a small renderer registry
  (`chrome/source-slot.ts`): both the gallery's everything scope and
  the panel acquire/release by owner id; acquire REPLACES the other
  owner and notifies it first (gallery → this-world + a notice line
  `gallery-evicted-notice`; panel → closes itself). GalleryView's
  `holdsSource` flag is subsumed by the registry's owner check; the
  scopeEpoch fence and hydration-generation guards are untouched and
  the 089 e2e stays green.
- The registry also carries the session tag border
  (`setSourceBorder`/`sourceBorder`) so import-surfaces' drop branch
  never depends on a Svelte component, plus the panel open-request
  store (the search-panel pattern); the panel mounts in ChromeLayer
  as a FADE-EXEMPT sibling of the fading root (ImportProgressStrip
  precedent) — pinned chrome must not dim with the idle clock, and
  it survives navigation and takeovers (z above the takeover cover).
- Drag-out shipped as real HTML5 DnD (`application/x-ew-source-item`
  carrying `{contentHash}`; sourceTags stay behind — the border is
  session state, not drag payload). The e2e drives it with
  dispatchEvent-built DragEvents sharing one real DataTransfer
  (dragstart on the cell, drop on the board), since raw mouse moves
  cannot synthesize Chromium's drag loop under Playwright; no
  click-to-place fallback was needed.
- The mini grid skips 077's virtualization: cells hydrate lazily via
  IntersectionObserver batches instead — viewport-scaled work at
  panel scale without duplicating the windowing math. Note/board
  cells render but do not drag (090's ingest is asset-shaped).
- `RAG/INDEX.md` was NOT regenerated (outside this ticket's file
  fence); the lead should run `./RAG/scripts/generate-index.sh` on
  merge.
