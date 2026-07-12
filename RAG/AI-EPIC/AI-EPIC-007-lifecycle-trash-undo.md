---
node_id: AI-EPIC-007
tags:
  - EPIC
  - AI
  - trash
  - undo
date_created: 2026-07-03
date_completed:
kanban_status: in-progress
AI_IMP_spawned:
  - AI-IMP-102
  - AI-IMP-114
  - AI-IMP-219
  - AI-IMP-220
  - AI-IMP-224
---

# AI-EPIC-007-lifecycle-trash-undo

## Problem Statement/Feature Scope

RFC §9 and §10.2 define recoverable deletion, restore, purge, garbage
collection, and structural undo. Users cannot yet delete anything
safely: there is no Trash view, no impact summaries, no undo of
structural commands, and no cleanup of unreferenced resources.

## Proposed Solution(s)

Implement lifecycle_state transitions with the aggregate rules of
§9.2–9.6: placement deletion with bare-node auto-trash and Keep in
Project, note/canvas/node trashing with impact summaries, root-canvas
protection, and lossless restore per §9.7. Build the Trash view with
retention defaulting to Never, Empty Trash with impact summary, and
purge invalidating dependent undo. Add the mark-and-sweep garbage
collector of §9.8 honoring active records, Trash, valid undo, jobs,
and export leases. Complete structural undo per §10.2: project-global
in-memory stack, inverse commands, redo clearing, cross-canvas
undo navigating to and highlighting its effect with the in-place
setting alternative.

## Path(s) Not Taken

No project time travel, no archive/hide lifecycle beyond view filters
(open question 10), no persisted undo across restarts (invariant 31),
no automatic retention enabled by default.

## Success Metrics

- RFC §17 slice items 19–23 pass end to end.
- Restore of a trashed note/node/canvas reproduces all preserved
  relationships byte-for-byte in the database.
- GC never collects a resource referenced by active records, Trash,
  undo, jobs, or export leases (property-style test).

## Requirements

### Functional Requirements

- [x] FR-1: Trash lifecycle with trashed_at and trashed_by_command_id per §9.1. *(audit 2026-07-07: shipped — queries-lifecycle.ts + migrations)*
- [x] FR-2: Delete flows with impact summaries and aggregate preservation per §9.2–9.6. *(audit: shipped across EPIC-016 menus + lifecycle handlers)*
- [x] FR-3: Bare-node auto-trash with Keep in Project per §9.2. *(audit: shipped — gestures-ui/status/Toasts)*
- [x] FR-4: Trash view with retention setting (default Never) and Empty Trash per §9.1/§9.7. *(audit: shipped — TrashView + settings, AI-IMP-102)*
- [x] FR-5: Purge with undo invalidation and GC eligibility per §9.7. *(audit: satisfied by LAZY fail-safe invalidation — FKs ON, handlers refuse inverses onto missing records, stack drops entry with stale toast (unit-tested); live path exercised by §17 item 23 at EPIC-008 sign-off)*
- [x] FR-6: Mark-and-sweep GC and derivative eviction per §9.8. *(audit: shipped — gc.ts with derivative-job + export-lease roots, tested)*
- [ ] FR-7: Structural undo/redo per §10.2. *(audit: core shipped, AI-IMP-114; the cross-canvas fence RATIFIED into §10.2 at rev 0.58; REMAINS OPEN on the capture-breadth decision — the shipped eight-command gesture set vs §10.2's all-durable-commands reading, see DESIGN-QUEUE. The epic closes when breadth is decided and executed or ratified.)*
- [x] FR-8: Startup reconciliation of interrupted imports and orphans per §9.8/§11.4. *(audit: shipped — recovery.ts reconcilePendingImports)*

### Non-Functional Requirements

- Ordinary queries exclude trashed records by default everywhere.
- GC runs incrementally without blocking the Project API.

## Implementation Breakdown

IMPs to be cut when this epic activates.
