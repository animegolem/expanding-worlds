---
node_id: AI-IMP-115
tags:
  - IMP-LIST
  - Implementation
  - library
  - gallery
kanban_status: in-progress
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

- [x] Everything-scope bar shows Pull into this world enabled for
      a single selected asset-kind item; other actions stay
      browse-only.
- [x] Pull ingests by content hash (or resolves the existing node
      on recognition), closes the takeover, enters place mode with
      a ghosted preview at the cursor.
- [x] Click places at the point via the gateway; Escape stores
      unplaced with the toast; either way the mode ends cleanly
      (no stuck ghost, selection restored).
- [x] e2e: pull → place → placement exists at click point with
      bytes copied; pull → Escape → node exists unplaced + toast;
      pull an already-present hash → no duplicate node.
- [x] Full gates.

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

**Ingest verb.** `window.ew.secondary.ingest('source', { contentHash,
border: 'none' })` — the everything scope opens the library into the
`'source'` secondary slot (GalleryView.runQuery), so the pull reaches
for the same 090 verb the source-panel drag-out uses, just triggered
by a button instead of a drop. Ordinary copy semantics, border 'none'
(world curation stays behind; the library's tags are facts, but the
ratified pull is "an ordinary placement", so no border).

**Place mode.** New module `canvas/place-mode.ts`, attached to the host
in CanvasHost.svelte alongside the other surfaces (import, node-menu,
open-note…). GalleryView closes the takeover and dispatches ONE window
event `ew-place-mode {nodeId, contentHash, clientX/Y}`; the module owns
the ghost lifecycle. The ghost is an `<img>` (thumb → original
fallback, 076's idiom) appended to the host, `pointer-events:none`
(§8.8: chrome, never occludes). Selection is suspended by catching the
placement `pointerdown` in the CAPTURE phase on the host element — an
ancestor of the `<canvas>` that owns the gesture listener (gestures-ui
binds `canvas.addEventListener('pointerdown', …, {capture:true})`), so
stopping it there means the board's own select/drag never begins.
Click → `host.gateway.execute('CreatePlacement')` at
`camera.screenToWorld(local)`; Escape (capture keydown) → exit + toast
"Stored in this world — unplaced"; a right-click cancels the same way.
The mode also exits on any takeover re-open (onTakeoverChanged) so a
ghost can never linger over another surface. No takeover.ts change was
needed — closeTakeover + a window event were the whole seam (keeping
the AI-IMP-102 'trash' work uncontended).

**Recognition.** ingestFromSource (packages/persistence) ALWAYS
CreateNodes — its `deduplicated` flag is BYTES-only — so a naive pull
of an already-present hash would make a duplicate node. Recognition is
therefore done renderer-side BEFORE ingest: `hasContentHash` (the
mirror chip's exact probe, asked here against the PRIMARY) gates it;
when present, the existing node is resolved and the copy is skipped
entirely. FRICTION: `hasContentHash` returns presence + tagNames but
NOT the node id, and packages/** was fenced off, so I could not add a
clean `hash → node` query. The existing node is resolved by a bounded
scan of the primary's image gallery index (`getGalleryIndex
{kinds:['image']}` + chunked `getGalleryItems`, short-circuit on
match). This is acceptable because "this world" is the SMALL side of
the seam (the library "everything" is the big superset) and a pull is a
single deliberate act — but a dedicated `nodeByContentHash` query
(one-line addition when packages reopen) would retire the scan. Noted
as debt; behaviour is correct (e2e proves no duplicate node).

**Validation (all on the worktree branch).**
- `pnpm -r build` — clean (pre-existing NotePanel a11y/`state_referenced_locally` warnings only).
- `pnpm --filter desktop test:unit` — 6 files, 47 tests passed.
- `pnpm lint` — clean.
- `npx playwright test gallery-scope.spec.ts gallery-selection.spec.ts source-panel.spec.ts` — 10 passed (the new pull test + no regressions). The new test drives enablement (note-kind and 2-selection both disable pull), Escape→unplaced+toast+no placement (node ingested, bytes present), and a second pull of the same item → recognition places the SAME node at the click point with NO duplicate node.

**Deviations.** Pull is a single-item action per scope (bulk pull is
recorded debt in Out of Scope); the button is shown only in everything
scope (readOnly), disabled with a hint otherwise. The ghost is a fixed
120px screen square (contain-fit) rather than a true-scale preview —
v1 keeps it simple; true world-size ghosting can follow if wanted.
