---
node_id: AI-EPIC-015
tags:
  - EPIC
  - AI
  - library
  - import
date_created: 2026-07-05
date_completed:
kanban_status: in-progress
AI_IMP_spawned:
  - AI-IMP-088
  - AI-IMP-089
  - AI-IMP-090
  - AI-IMP-091
  - AI-IMP-092
  - AI-IMP-093
  - AI-IMP-094
---

# AI-EPIC-015-library-and-cross-project-sourcing

> Stub cut with RFC rev 0.18 (§14.4) as AI-EPIC-014; renumbered to
> 015 on 2026-07-06 after the gallery epic (AI-EPIC-014-gallery,
> shipped in v0.7.0) took the number and absorbed the in-project
> half of this scope: the thumbnail pipeline, bulk import with the
> progress strip, the gallery takeover with facets/buckets/selection/
> keyboard, and the flat tag facet. What remains here is the library
> ecosystem: cross-project sourcing and the surfaces that make one
> project a reference library for the others.

## Problem Statement/Feature Scope

The first outside tester's reference library lives in Allusion,
which is abandoned. RFC §14.4 accepts that this app owns the
reference-library surface — browsable, taggable, locally persisted
files — without adding a library concept to the domain. The
in-project gallery and bulk import shipped in v0.7.0; what does not
exist yet is everything that crosses a project boundary: no way to
pull material from one project into another, no library project
designation or scope toggle, no inbox mirror, and no migration path
off Allusion.

## Proposed Solution(s)

Per RFC §14.4 (self-contained there; read it first):

- The library project designation as packaging, not schema, and the
  gallery's this world · everything scope toggle (rev 0.22).
- Cross-project sourcing: open a second project read-only, browse
  it with the same rows, ingest by hash-copy with provenance; the
  tag border decision (none/all/pick, name_key merge).
- The placement picker as the compressed gallery; sources open as
  pinned mini-gallery panels from the project charm (one grammar,
  three compressions per §14.4).
- The inbox mirror (§14.4): once-per-project opt-in that also
  imports world drops into the library, one-way, hash-recognized,
  never blocking the foreground drop.
- Export size preflight, asked once per project (§16).
- First-open seeded example set with the one-time clear affordance.
- Stretch: the Allusion importer as a versioned adapter (§14.4;
  deprioritized — the mirror and native gallery let the tester's
  library re-accrete through use).

## Path(s) Not Taken

No global asset store: projects never reference outside themselves
(§14.4's source-never-reference rule). No watched directories. No
library-only record kinds — that is the standing stop signal. No
DAM feature race with Eagle. The in-project gallery, bulk import,
thumbnail pipeline, and flat tag facet are not re-scoped here —
they shipped in AI-EPIC-014-gallery (v0.7.0).

## Success Metrics

- Material drags from a read-only source project into a world with
  tags carried by decision, and the destination exports
  self-contained.
- With the mirror on, a file dropped into any world is findable in
  the library's gallery moments later, tagged or not, exactly once
  (hash dedupe).
- A designated library project opens straight into its gallery, and
  the everything scope surfaces unplaced material alongside placed.
- If the stretch adapter is built: the tester's Allusion library
  imports with tags intact (hierarchy flattened, rev 0.20) and zero
  manual per-file work.

## Requirements

### Functional Requirements

- [ ] FR-1: Library project designation (packaging, not schema) and the gallery's this world · everything scope toggle per §14.4 (rev 0.22).
- [ ] FR-2: Read-only source-project opening per §11.1/§14.4.
- [ ] FR-3: Ingest-by-copy with provenance and the tag border decision (none/all/pick, name_key merge) per §14.4.
- [ ] FR-4: Placement picker as compressed gallery; sources open as pinned mini-gallery panels from the project charm per §14.4.
- [ ] FR-5: Export size preflight, asked once per project, per §16. (Deferred to EPIC-008 with AI-IMP-093 — no export surface exists yet.)
- [ ] FR-6: First-open seeded example (public-domain set, ordinary records) with the one-time clear affordance per §14.4.
- [ ] FR-7: Inbox mirror — once-per-project opt-in, one-way, hash-recognized, non-blocking per §14.4.
- [ ] FR-8 (stretch): Allusion importer as a versioned adapter, hierarchy flattened, leaf collisions renamed per §14.4.

### Non-Functional Requirements

- Source-project reads never mutate the source (read-only open is a
  hard property, not a UI convention).
- Every §14.4 guardrail holds: projections over existing records
  only.

## Implementation Breakdown

Cut 2026-07-06 on the epic-015 branch: AI-IMP-088 secondary project
seam (FR-2 core; lead-built — it defines the interface everything
consumes) → then fan out: AI-IMP-089 library designation + scope
toggle (FR-1) · AI-IMP-090 ingest-by-copy + tag border (FR-3) ·
AI-IMP-093 export size preflight (FR-5, independent, can start
immediately). After 090: AI-IMP-091 open-as-source panels (FR-4) ∥
AI-IMP-092 inbox mirror (FR-7). AI-IMP-094 first-open seed (FR-6)
follows 089's create-library flow. FR-8 (Allusion importer) stays
stretch — cut only if the epic lands with room. Epic ships as a PR
per the standing close process; v0.8.0 rides the close.
