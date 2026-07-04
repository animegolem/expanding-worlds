---
node_id: AI-EPIC-007
tags:
  - EPIC
  - AI
  - trash
  - undo
date_created: 2026-07-03
date_completed:
kanban_status: backlog
AI_IMP_spawned:
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

- [ ] FR-1: Trash lifecycle with trashed_at and trashed_by_command_id per §9.1.
- [ ] FR-2: Delete flows with impact summaries and aggregate preservation per §9.2–9.6.
- [ ] FR-3: Bare-node auto-trash with Keep in Project per §9.2.
- [ ] FR-4: Trash view with retention setting (default Never) and Empty Trash per §9.1/§9.7.
- [ ] FR-5: Purge with undo invalidation and GC eligibility per §9.7.
- [ ] FR-6: Mark-and-sweep GC and derivative eviction per §9.8.
- [ ] FR-7: Structural undo/redo with cross-canvas navigation per §10.2.
- [ ] FR-8: Startup reconciliation of interrupted imports and orphans per §9.8/§11.4.

### Non-Functional Requirements

- Ordinary queries exclude trashed records by default everywhere.
- GC runs incrementally without blocking the Project API.

## Implementation Breakdown

IMPs to be cut when this epic activates.
