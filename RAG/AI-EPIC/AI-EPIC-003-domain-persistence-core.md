---
node_id: AI-EPIC-003
tags:
  - EPIC
  - AI
  - domain
  - persistence
date_created: 2026-07-03
date_completed:
kanban_status: in-progress
AI_IMP_spawned:
  - AI-IMP-009
  - AI-IMP-010
  - AI-IMP-011
  - AI-IMP-012
  - AI-IMP-013
  - AI-IMP-014
  - AI-IMP-015
  - AI-IMP-016
---

# AI-EPIC-003-domain-persistence-core

## Problem Statement/Feature Scope

RFC-0001 §4 defines eight record types, §5 defines 31 invariants, and
§10–11 define the command envelope and persistence rules — none of it
implemented. Without the domain core, every UI feature would invent
its own data access and violate the command boundary the RFC makes
mandatory.

## Proposed Solution(s)

Implement the authoritative project service inside the Electron
utility process: SQLite schema for project, note, node, canvas,
placement, asset, tag, decoration, link, bookmark, and command-log
records with UUIDv7 identities and lifecycle_state columns; the
versioned command envelope with expected_project_revision conflict
handling; the narrow Project API (execute command, typed query,
subscribe, import asset, request derivatives) per §11.3; project
locking and startup recovery per §11.4; the staged asset import
pipeline per §11.2; FTS5 indexes per §8.3/§11.1; and the command
metadata log per §10.2. Ship an invariant test suite that exercises
all 31 rules of §5 directly against the service, since RFC §18 makes
them acceptance criteria.

## Path(s) Not Taken

No CRDTs, networking, PostgreSQL, or server mode (§15 seam preserved
through the Project API only). No event sourcing: the command log is
metadata, not a replayable store. Undo stacks stay in application
memory per invariant 31.

## Success Metrics

- Invariant suite covering §5 rules 1–31 passes.
- Representative command set from §10.1 executes with monotonic
  project_revision and structured conflicts on stale revisions.
- Two processes cannot acquire one project directory (lock test).
- Kill-during-import recovery test reconciles temp files per §11.4.

## Requirements

### Functional Requirements

- [ ] FR-1: SQLite schema + migrations for all §4 record types, WAL mode, foreign keys.
- [ ] FR-2: UUIDv7 generation and short-code fingerprints per §4.11.
- [ ] FR-3: Command envelope, per-type versions, upcaster hook, revision conflicts per §10.1–10.2.
- [ ] FR-4: Project API surface per §11.3 exposed over utility-process IPC.
- [ ] FR-5: Project locking, single-writer enforcement, startup recovery per §11.4.
- [ ] FR-6: Staged asset import (copy, sniff, hash, atomic move, dedupe) per §11.2 with Asset.kind per §4.7.
- [ ] FR-7: Link records with bound/unresolved/broken states and the re-resolution sweep per §7.1.
- [ ] FR-8: FTS5 indexes over notes, tags, filenames, canvas text per §8.3.
- [ ] FR-9: Command metadata log per §10.2.

### Non-Functional Requirements

- Renderer/Svelte never executes SQL (invariant enforced by boundary).
- All commands transactional; a failed command leaves no partial state.
- Import pipeline handles multi-hundred-MB originals without blocking
  the API thread.

## Implementation Breakdown

- AI-IMP-009 (lead): SQLite binding decision, migrations, full §4
  schema, UUIDv7/short codes, atomic project create, writer lock.
- AI-IMP-010 (lead): command envelope/dispatcher/versioning, metadata
  log, events, typed queries, Project API over utility IPC.
- AI-IMP-011 (agent): note commands, link records, re-resolution
  sweep, phantom projection, title conflicts.
- AI-IMP-012 (agent): node/canvas/placement/tag/decoration commands,
  render_order.
- AI-IMP-013 (agent): DeletePlacement + bare-node rule, trash/restore/
  purge aggregates, broken links, GC eligibility.
- AI-IMP-014 (agent): staged asset import, content-addressed store,
  dedupe, derivative queue.
- AI-IMP-015 (agent): FTS5 corpora, search + quick-open queries,
  index rebuild primitive.
- AI-IMP-016 (lead): startup recovery, cross-process lock and
  kill-during-import tests, consolidated §5 invariant suite, epic
  close.

Waves: 009→010 sequential (lead); then 011/012/014 in parallel
worktrees; then 013/015 in parallel; 016 closes on merged master.
