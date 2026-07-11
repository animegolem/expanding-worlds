---
node_id: AI-IMP-261
tags:
  - IMP-LIST
  - Implementation
  - persistence
  - import
  - field-report
kanban_status: planned
depends_on: []
parent_epic:
confidence_score: 0.65
date_created: 2026-07-10
date_completed:
---


# AI-IMP-261-asset-content-dedup

## Summary of Issue #1

alph, v0.20.0, 2026-07-10: "placing an image twice doesn't
generate a new copy... but dragging it from folder a second time
does" — re-importing the same FILE mints a duplicate asset (two
ids, two blobs, two gallery rows). OWNER RULING (chat): hash the
library, keep a table of hashes; a new file gets hashed and is NOT
re-added on match. Done means: importing bytes whose content hash
matches an existing ACTIVE asset reuses that asset (the placement
is still created where the import asked for one); the library
gains no duplicate row or blob; existing duplicate assets are left
alone (no retroactive merge in this ticket).

**MIGRATION 0009 RESERVED for this ticket (was 0008; the lead swapped the two unlanded reservations at the AI-IMP-266 round-1 review — 266 needed a contiguous number first and 261 was unstarted)** (content_hash column +
backfill + index). Growing-domain rule: no CHECK constraints.

### Out of Scope

- Retroactive merge of existing duplicates (a later curation tool;
  candidate DESIGN-QUEUE item if alph wants it).
- Perceptual/near-duplicate matching — exact content hash only.
- Cross-project dedup (library mirror semantics stay as they are).

### Design/Approach

Pre-implementation review: read the import pipeline
(`packages/persistence/src/import/`, the staged-import path from
AI-IMP-014 + the C10-005 reservation work) and record where bytes
first land and where the asset row is minted; confirm the hash can
be computed on the staged file BEFORE promotion so a match aborts
staging cleanly under the request-owned staging model. Then:
sha-256 over the original bytes at import; migration 0009 adds
`content_hash` (nullable, backfilled for existing assets by
hashing blobs — a startup/migration-time pass; verify blob-store
access from migration context, else backfill lazily on first
open); on match with an active same-project asset, return the
existing assetId as a typed `deduplicated` outcome so callers
(drop, gallery import, appearance image) create their placement
against it. Provenance: append the new original filename to the
matched asset's provenance record if the model supports it —
review decides; do not invent a new provenance shape here.
Concurrency: the C10-005 reservation already serializes same-name
destinations; hash-match must be checked inside the same critical
window to keep two simultaneous imports of one file from both
missing the match.

### Files to Touch

(Census in review; expected:)
- `packages/persistence/src/migrations/0009-asset-content-hash.ts`.
- `packages/persistence/src/import/ingest.ts` / pipeline: hash +
  match + typed outcome.
- Handlers/protocol: the deduplicated outcome surfaced to the
  renderer (toast copy: "already in the library — reused").
- Tests: same-bytes re-import reuses; different bytes same name
  doesn't; concurrent same-file imports yield one asset.
- `RAG/HUMAN-TESTING.md`: alph entry (his exact drag-twice case).

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [ ] Pre-implementation review: pipeline census; hash point,
      backfill feasibility, provenance shape recorded here.
- [ ] Migration 0009: content_hash + index + backfill (or the
      reviewed lazy variant); migration tests.
- [ ] Import path: match-before-promote inside the reservation
      window; typed deduplicated outcome; staging cleaned.
- [ ] Renderer surfaces the reuse honestly (no silent swallow, no
      error tone).
- [ ] Unit + concurrent-import regressions green; full gate green.
- [ ] HUMAN-TESTING entry for alph.

### Acceptance Criteria

**GIVEN** an image already in the library
**WHEN** the same file is dragged in again
**THEN** no new asset row or blob is created
**AND** the drop still places a card/pin backed by the existing
asset, with a quiet "reused" notice
**AND** two simultaneous imports of the same new file yield
exactly one asset.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->
