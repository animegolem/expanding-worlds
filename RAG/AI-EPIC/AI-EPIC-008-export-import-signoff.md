---
node_id: AI-EPIC-008
tags:
  - EPIC
  - AI
  - export
  - acceptance
date_created: 2026-07-03
date_completed:
kanban_status: backlog
AI_IMP_spawned:
---

# AI-EPIC-008-export-import-signoff

## Problem Statement/Feature Scope

RFC §16 requires portable export with lossless reimport, and §17–18
define the 26-item vertical slice and acceptance checklist that gate
Phase 1. Neither exists, and open question 11 (container format) is
still undecided.

## Proposed Solution(s)

Decide the export container format (closing open question 11), then
implement export per §16 — manifest, schema version, database or
normalized data, Markdown note exports, original assets, full
metadata, Trash included unless active-only is chosen — and lossless
import into a fresh project directory with all record identities
preserved, coexisting with the original. Finish with Phase 1 sign-off:
script or manually execute all 26 §17 slice items and audit every §18
acceptance criterion, fixing gaps or filing follow-up tickets, and
record the result in an AI-LOG that declares Phase 1 complete.

## Path(s) Not Taken

No cross-project merge, no partial/selective import, no cloud or sync
targets (§15). Purged records and regenerable derivatives stay
non-exported per §16.

## Success Metrics

- Export → import roundtrip preserves identities, links, tags,
  placements, bookmarks, Trash, and assets (automated diff of both
  databases modulo storage paths).
- All 26 slice items of §17 verified and evidenced in the sign-off log.
- Every §18 acceptance criterion checked off or ticketed with rationale.

## Requirements

### Functional Requirements

- [ ] FR-1: Container format decision recorded and RFC open question 11 closed.
- [ ] FR-2: Export pipeline per §16 in the utility process with progress reporting.
- [ ] FR-3: Import pipeline recreating a project with preserved IDs per §16.
- [ ] FR-4: Active-content-only export variant.
- [ ] FR-5: Slice walkthrough of §17 items 1–26 with evidence.
- [ ] FR-6: §18 acceptance audit with pass/fail record.

### Non-Functional Requirements

- Export of a multi-GB project streams without exhausting memory.
- Import validates schema version and fails cleanly on mismatch.

## Implementation Breakdown

IMPs to be cut when this epic activates.
