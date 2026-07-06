---
node_id: AI-EPIC-014
tags:
  - EPIC
  - AI
  - gallery
  - thumbnails
  - import
date_created: 2026-07-06
date_completed:
kanban_status: in-progress
AI_IMP_spawned:
  - AI-IMP-076
  - AI-IMP-077
  - AI-IMP-078
  - AI-IMP-079
  - AI-IMP-080
  - AI-IMP-081
---

# AI-EPIC-014-gallery

## Problem Statement/Feature Scope

Reference material is only visible where it is placed. A project
holding hundreds of imported images has no browsable projection of
what it owns — the Allusion/Eagle use case the app exists to absorb
(§14.4) has no surface, unplaced nodes are reachable only through
the outline's list rows, and nothing in the app shows a picture at
more than placement size. The first outside tester's core loop —
hoard, tag, retrieve — cannot run. §14.4 (rev 0.18–0.22) already
decided the shape; this epic builds its gallery half over the
current project.

## Proposed Solution(s)

The gallery (⊞) as a takeover view: a thumbnail grid over the
project's nodes, joining graph ⊛ · outline ▤ as projections of one
database, with its own rail charm and a slot in the takeover mode
switcher. Query machinery is shared with the outline and tag panel;
entries are ordinary nodes — no new record kinds (the §14.4
standing guardrail).

The load-bearing prerequisite is real thumbnails: the derivative
job queue and generator seam exist (§11.2,
`packages/persistence/src/import/derivatives.ts`) but the generator
is a noop — pixel resizing was explicitly deferred until an image
codec landed. This epic lands the main-process codec (§4.7's
shared-codec note), a background worker loop that drains the queue
without blocking imports, and §11.4's lazy rebuild of missing
derivatives.

On top of the grid: sort facets (date · name · size), the kind
facet (image · note · board), a flat tag filter with counts
(orderable by name or count), and the untagged · unplaced cleanup
filters. Date sort renders BUCKETED sections — relative near the
top, degrading to months then years — with the current section
header doubling as the jump control (rev 0.22: grouped time, not
infinite scroll). Bulk selection summons a floating action bar
(tag · place · trash); placement reuses the §6.10 grammar the
outline shipped (drag out, place on current canvas). Large drops
run as an interruptible progress strip with a live hash-dedupe
count, never a modal. Note-kind entries render as text posts —
title visible, tags on hover — so clippings sit beside pictures
("a diary of sorts", first tester).

Two design turns run inside the epic before their tickets: the
gallery keyboard model (open question 26: arrow navigation, range
selection) and the text-post presentation amendment to §14.4.

## Path(s) Not Taken

The library ecosystem is EPIC-015, deliberately: library-project
designation, the this world · everything toggle, the inbox mirror,
open-as-source panels, the tag border, the first-open seed, and
the Allusion importer (deprioritized, rev 0.19). This epic's
gallery shows the current project only. Advanced search as
user-composed views and the booru/URL drop (clip + tags) each need
their own RFC design turn first and ride later epics. The OS-drop
importer dialogue (open question 27) stays deferred.

## Success Metrics

- A project holding 500+ imported images opens the gallery and
  scrolls it smoothly; thumbnails generate in the background after
  bulk import without blocking the drop or the UI (perf gate on
  owner hardware, per the local-only perf-suite rule).
- The hoard-tag-retrieve loop closes without touching a board:
  bulk-import, bulk-tag from the action bar, refind by tag facet,
  place on the current canvas.
- Date sort shows bucketed sections whose header jumps to any
  period; no unbucketed infinite grid remains.
- Every §14.4 gallery behavior in scope passes e2e; existing gates
  stay green.

## Requirements

### Functional Requirements

- [ ] FR-1: A real thumbnail generator behind the existing
      derivative seam — main-process image codec, background worker
      draining `derivative_jobs`, §11.4 lazy rebuild of missing
      derivatives; imports never block on it.
- [ ] FR-2: Gallery takeover ⊞ — rail charm, takeover mode-switcher
      participation, thumbnail grid over the project's nodes per
      §14.4.
- [ ] FR-3: Facets — sort by date · name · size; kind facet
      image · note · board; flat tag filter with counts orderable
      by name or count; untagged · unplaced cleanup filters.
- [ ] FR-4: Grouped time — date sort renders bucketed sections
      (relative → months → years); the current section header names
      where you are and opens the period list for random access.
- [ ] FR-5: Bulk selection with a floating action bar: tag · place
      · trash.
- [ ] FR-6: Placement from the gallery via the §6.10 grammar —
      drag out and place-on-current-canvas, consistent with the
      outline's flows.
- [ ] FR-7: Large drops run as an interruptible progress strip
      with a live hash-dedupe count, never a modal.
- [ ] FR-8: Note-kind entries render as text posts — title
      visible, tags on hover (§14.4 amendment, design turn in this
      epic).
- [ ] FR-9: Gallery keyboard model — arrow navigation and range
      selection over the grid (open question 26; design turn in
      this epic, then build).

### Non-Functional Requirements

- No new record kinds: gallery entries are nodes, grouping is view
  state over indexed timestamps, thumbnails are regenerable
  derivatives and never authoritative (§11.2, §14.4 guardrail).
- The grid must virtualize: memory and paint cost scale with the
  viewport, not the collection.
- Thumbnail generation is main-process work (§13.2 process layout);
  the renderer never decodes originals for grid cells.
- Gallery queries stay read-model projections beside the outline's
  (§14.1 precedent); takeovers scope to one project ID (§8.2).
- The codec choice is a versioned, replaceable dependency — decide
  native module vs Electron built-in with a written trade-off in
  the deciding IMP.
- Derivatives preserve alpha: thumbnails of transparent sources
  (PNG, GIF, WebP, AVIF) are encoded in an alpha-capable format and
  the grid composites them over the surface — never a baked
  background. Originals are already byte-identical by the §11.2
  hash-store rule; the thumbnail is the only re-encode in the
  system and must not be the place transparency dies.

## Implementation Breakdown

Cut 2026-07-06: AI-IMP-076 thumbnail pipeline (FR-1, the codec
decision ticket — lead) → AI-IMP-077 gallery takeover: grid +
grouped time (FR-2, FR-4 — lead, interface-defining) →
AI-IMP-078 facets + text posts (FR-3, FR-8) · AI-IMP-079 bulk
selection + action bar + placement (FR-5, FR-6) in parallel →
AI-IMP-080 keyboard model (FR-9, rides 079's selection).
AI-IMP-081 import progress strip (FR-7) is independent and can
fan out alongside 076. The §14.4 text-post amendment (FR-8's
design turn) is folded by the lead at the 078 merge.
