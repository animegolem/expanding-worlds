---
node_id: AI-EPIC-008
tags:
  - EPIC
  - AI
  - export
  - acceptance
date_created: 2026-07-03
date_completed:
kanban_status: in-progress
AI_IMP_spawned: [AI-IMP-120, AI-IMP-121, AI-IMP-122]
---

# AI-EPIC-008-export-import-signoff

## Problem Statement/Feature Scope

RFC §16 requires portable export with lossless reimport, and §17–18
define the 26-item vertical slice and acceptance checklist that gate
Phase 1. Neither exists, and open question 11 (container format) is
still undecided.

## Proposed Solution(s)

> Owner direction (2026-07-06, strategy review): alongside the §16
> portable export, DATA SAFETY rides a LOCAL GIT STORE — the
> checkpoint/sleep moments (AI-IMP-096) also snapshot the database
> into a local repo (a poor-man's event log; composes with the rev
> 0.24 session-snapshot shape), and an Advanced setting exposes
> connect/upload to a remote. Design pass on cadence, retention,
> and repo layout is queued in RAG/DESIGN-QUEUE.md. The export
> size preflight (AI-IMP-093) rides this epic.

Decide the export container format (closing open question 11), then
implement export per §16 — manifest, schema version, database or
normalized data, Markdown note exports, original assets, full
metadata, Trash included unless active-only is chosen — and lossless
import into a fresh project directory with all record identities
preserved, coexisting with the original. Finish with Phase 1 sign-off:
script or manually execute all 26 §17 slice items and audit every §18
acceptance criterion, fixing gaps or filing follow-up tickets, and
record the result in an AI-LOG that declares Phase 1 complete.

> Scope refresh (2026-07-06 doc review): §16 grew past this epic's
> FRs — the Markdown escape-hatch export with uses sections, JSON
> Canvas per board (rev 0.21), full-res rendered board images, the
> standing vault mirror (rev 0.23), git session snapshots (rev
> 0.24), and the git-backup-at-checkpoint direction above. Re-cut
> the FRs against current §16 at activation; §17/§18 are also
> stale against EPIC-013/014/015 surfaces and the sign-off audit
> (FR-5/6) must reconcile them first.

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

- [x] FR-1: Container format decision recorded and RFC open question 11 closed. *(rev 0.57: one .ewproj ZIP)*
- [x] FR-2: Export pipeline per §16 in the utility process with progress reporting. *(AI-IMP-157)*
- [x] FR-3: Import pipeline recreating a project with preserved IDs per §16. *(AI-IMP-158; roundtrip diff exact)*
- [x] FR-4: Active-content-only export variant. *(AI-IMP-157; FK-checked filter)*
- [ ] FR-5: Slice walkthrough of §17 items 1–26 with evidence.
- [ ] FR-6: §18 acceptance audit with pass/fail record.
- [x] FR-7: Git snapshot engine at checkpoint moments per rev 0.52
      §11.4 (end-session, quit, idle; readable notes tree; size
      readout) — AI-IMP-120.
- [x] FR-8: In-app Restore from backup… materializing a snapshot as
      a new project directory — AI-IMP-121.
- [x] FR-9: Remote push as an Advanced off-by-default setting —
      AI-IMP-122.

### Non-Functional Requirements

- Export of a multi-GB project streams without exhausting memory.
- Import validates schema version and fails cleanly on mismatch.

> Backup half RATIFIED and activated 2026-07-06 (RFC rev 0.52,
> §11.4): design-queue item resolved — cadence is end-session +
> quit + in-place idle checkpoint; snapshots always carry a
> readable notes tree; minimal in-app restore-to-copy; keep-all
> retention with a Settings size readout; remote push Advanced,
> off by default. AI-IMP-120/121/122 cut. The export/import
> sign-off half (FR-1–6) still re-cuts against current §16 at its
> activation.

## Implementation Breakdown

- AI-IMP-120: git snapshot engine + cadence (FR-7).
- AI-IMP-121: Restore from backup… restore-to-copy surface (FR-8).
- AI-IMP-122: remote push Advanced setting (FR-9).
- Export/import sign-off IMPs cut at that half's activation
  (FR-1–6).
