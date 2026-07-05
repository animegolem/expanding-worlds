---
node_id: AI-EPIC-014
tags:
  - EPIC
  - AI
  - library
  - import
date_created: 2026-07-05
date_completed:
kanban_status: backlog
AI_IMP_spawned:
---

# AI-EPIC-014-library-and-cross-project-sourcing

> Stub cut with RFC rev 0.18 (§14.4). Activates after AI-EPIC-013:
> the browser view reuses the takeover framework, tree/tag query
> machinery, and the tag panel, and is gated on the thumbnail
> derivative pipeline (§4.7's shared image codec).

## Problem Statement/Feature Scope

The first outside tester's reference library lives in Allusion,
which is abandoned. RFC §14.4 accepts that this app owns the
reference-library surface — browsable, taggable, locally persisted
files — without adding a library concept to the domain. None of it
exists: no bulk import, no thumbnail-grid browsing, no way to pull
material from one project into another, and no migration path off
Allusion.

## Proposed Solution(s)

Per RFC §14.4 (self-contained there; read it first):

- Bulk import producing unplaced nodes through the staged pipeline,
  with batch progress and hash dedupe.
- The file-browser projection: thumbnail grid over a project's
  nodes with sort facets, bulk selection, and tag filtering, on the
  EPIC-013 takeover framework; a library project is packaging, not
  schema.
- The thumbnail derivative pipeline and main-process image codec
  (§4.7) as the enabling ticket.
- Cross-project sourcing: open a second project read-only, browse
  it with the same rows, ingest by hash-copy with provenance; the
  tag border decision (none/all/pick, name_key merge).
- The placement picker as the compressed browser (one grammar,
  three compressions per §14.4).
- Capstone: the Allusion importer as a versioned adapter — after
  verifying the tester's Allusion version and whether its tags live
  in its internal database or file metadata.

## Path(s) Not Taken

No global asset store: projects never reference outside themselves
(§14.4's source-never-reference rule). No watched directories. No
library-only record kinds — that is the standing stop signal. No
DAM feature race with Eagle.

## Success Metrics

- A thousand-file bulk import completes with progress, dedupe, and
  every file findable in the browser by tag.
- Material drags from a read-only source project into a world with
  tags carried by decision, and the destination exports
  self-contained.
- The tester's Allusion library imports with tags intact (flattened
  per §14.4) and zero manual per-file work.

## Requirements

### Functional Requirements

- [ ] FR-1: Thumbnail derivative pipeline + main-process image codec per §4.7.
- [ ] FR-2: Bulk import to unplaced nodes with batch progress per §14.4/§11.2.
- [ ] FR-3: File-browser projection on the takeover framework per §14.4.
- [ ] FR-4: Read-only source-project opening per §11.1/§14.4.
- [ ] FR-5: Ingest-by-copy with provenance and the tag border decision per §14.4.
- [ ] FR-6: Placement picker as compressed browser per §14.4.
- [ ] FR-7: Allusion importer as a versioned adapter per §14.4/§4.7.
- [ ] FR-8: Export size preflight, asked once per project, per §16.
- [ ] FR-9: First-open seeded example (public-domain set, ordinary records) with the one-time clear affordance per §14.4.

### Non-Functional Requirements

- Browser stays responsive at 10k nodes (virtualized list; it is a
  data view, not a canvas).
- Every §14.4 guardrail holds: projections over existing records
  only.

## Implementation Breakdown

IMPs to be cut when this epic activates.
