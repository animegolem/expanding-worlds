---
node_id: AI-IMP-009
tags:
  - IMP-LIST
  - Implementation
  - persistence
  - sqlite
  - schema
kanban_status: completed
depends_on:
parent_epic: [[AI-EPIC-003-domain-persistence-core]]
confidence_score: 0.85
date_created: 2026-07-04
date_completed: 2026-07-04
---

# AI-IMP-009-sqlite-foundation-and-schema

## Summary of Issue #1

Nothing persists. RFC-0001 §11.1 mandates SQLite as the authoritative
store with WAL, foreign keys, migrations, and UUIDv7 identities, and §4
defines the record types every later ticket writes to. This ticket is
interface-defining (lead-built): it decides the SQLite binding, builds
the migration runner, creates the full Phase 1 schema (project, note,
node, canvas, placement, asset, tag, tag_assignment, decoration,
decoration_group, link, bookmark, command_log, settings), implements
UUIDv7 and short-code fingerprints per §4.11, project create with the
atomic protected root (§4.10), and single-writer lock acquisition on
open (§11.1). Done means: `@ew/persistence` opens/creates a project
directory, schema-level invariant tests pass, and `pnpm check` stays
green.

### Out of Scope

Command pipeline and Project API (AI-IMP-010); all domain command
handlers (011–013); staged import beyond the assets table (014); FTS5
population (015); startup recovery beyond lock semantics (016);
export/import.

### Design/Approach

Binding decision: try `better-sqlite3` first (battle-tested, sync API
suits a single-writer service). It is a native module, so verify it
loads inside the Electron 39 utility process (electron-rebuild or
prebuilds) as the FIRST checklist item; fallback is `node:sqlite` if
its SQLite build ships FTS5 (verify with `SELECT fts5(?1)` probe).
Record the outcome here. Schema in numbered SQL migrations applied by
a small runner recording schema_version in the project row (§4.10).
All lifecycle-capable records get lifecycle_state
('active'|'trashed'), trashed_at, trashed_by_command_id (§9.1).
Notes store title + title_key with a partial unique index on
(project_id, title_key) — uniqueness holds across trashed notes
(invariant 5). Placements and decorations share canvas-scoped
render_order (REAL keys, UUID tiebreak; §4.4). Links store state
bound/unresolved/broken with per-state columns (§7.1). Lock: exclusive
lock file with pid/hostname/heartbeat beside project.sqlite; stale
detection by heartbeat age. title_key normalization (trim, collapse
whitespace, NFC, casefold) lives in `@ew/domain` as pure code with
table-driven tests. UUIDv7 + random-tail short codes in `@ew/domain`.

### Files to Touch

`packages/domain/src/ids.ts`: UUIDv7, short-code fingerprint.
`packages/domain/src/title-key.ts`: normalization per §4.2.
`packages/domain/src/records.ts`: TS types for all §4 records.
`packages/domain/src/*.test.ts`: unit tests for the above.
`packages/persistence/src/db.ts`: open/create, WAL, FK pragma.
`packages/persistence/src/migrations/*.sql` + `migrate.ts`: runner.
`packages/persistence/src/lock.ts`: single-writer lock.
`packages/persistence/src/project.ts`: createProject (atomic root
node + root canvas), openProject.
`packages/persistence/src/*.test.ts`: schema + invariant tests.
`packages/persistence/package.json`: sqlite dependency.
`pnpm-workspace.yaml`: allowBuilds for better-sqlite3 if chosen.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and
**think**. Have you validated all aspects are **implemented** and
**tested**?
</CRITICAL_RULE>

- [x] Spike: probed the binding inside the Electron 39 utility process; node:sqlite passed in both ABIs and was chosen (decision + evidence in Issues Encountered).
- [x] `@ew/domain`: ids.ts with uuidv7() (RFC 9562: 48-bit ms timestamp, version/variant bits, random tail) and shortCode(uuid) using random-tail bytes, never the timestamp prefix (§4.11); tests assert version nibble, strict in-process ordering, short-code source bytes.
- [x] `@ew/domain`: title-key.ts implementing the four §4.2 steps; table-driven tests including Unicode NFC and case-fold cases.
- [x] `@ew/domain`: records.ts typing all §4 records including lifecycle fields and Asset.kind discriminator.
- [x] `@ew/persistence`: db.ts opening SQLite with WAL, foreign_keys ON, busy_timeout; migrate.ts applying numbered migrations transactionally and stamping schema_version.
- [x] Migration 0001: all tables per §4 with FK constraints, link table per §7.1 three-state model, command_log per §10.2, settings (project tier, includes trash retention default Never per §9.1/§11.5), bookmark table.
- [x] Unique index enforcing title_key uniqueness regardless of lifecycle_state (invariant 5); tests prove a trashed note still blocks the title and purge frees it.
- [x] lock.ts: acquire exclusive project lock on open (lock file, pid + heartbeat timestamps, refresh interval); second acquire in-process fails with structured error; stale lock (old heartbeat) is reclaimable; tests.
- [x] project.ts: createProject builds project row, root node, root canvas in one transaction; invariant 2 enforced by schema triggers (root node/canvas can be neither trashed nor deleted), tested.
- [x] FK integrity tests: placement→node/canvas, tag_assignment→tag/node; no ON DELETE CASCADE anywhere (soft-delete aggregates per §9.5; purge handled in AI-IMP-013).
- [x] `pnpm check` green; commit.

### Acceptance Criteria

**Scenario:** Creating and reopening a project.
**GIVEN** an empty directory.
**WHEN** createProject runs.
**THEN** project.sqlite exists in WAL mode with foreign keys on, one
project row with schema_version, exactly one root node owning one root
canvas, all created in a single transaction.
**AND** reopening acquires the lock and runs zero pending migrations.
**WHEN** a second handle attempts to open the same directory while the
lock is held.
**THEN** it receives a structured lock error, not a second writer.
**WHEN** a note titled "  Foo  Bar " exists (any lifecycle state) and
another note is inserted with title_key of "foo bar".
**THEN** the insert fails with a uniqueness violation.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only
comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the
sprint.
You MUST document any failed implementations, blockers or missing
tests.
-->

- **Binding decision: node:sqlite, not better-sqlite3.** Probes ran
  in both runtimes: system Node 26.4 (vitest) and the Electron 39
  utility process (Node 22.22.1, SQLite 3.51.2) — WAL on disk and
  FTS5 both pass. better-sqlite3 was not even attempted because the
  mismatch is structural, not a build issue: it binds V8 APIs
  directly (not N-API), so one node_modules build cannot serve both
  the system-Node test runner and Electron's ABI. node:sqlite is
  built in on both sides, needs no rebuild, and is isolated behind
  the Db class in db.ts so a swap stays one file. Its experimental
  warning is accepted; the API surface used (DatabaseSync,
  prepare/get/all/run/exec) is stable across Node 22–26.
- vitest 2's bundled vite predates the node:sqlite builtin and tried
  to resolve it as a package. Upgraded vitest to ^4.1.9 across all
  packages (kept versions uniform) — all suites pass unchanged.
- Deviation: migrations are TS modules exporting SQL strings, not
  .sql files — tsc emits no assets, so raw .sql would need a copy
  step and runtime file resolution in both dev and bundled utility
  contexts. String modules travel through every bundler for free.
- title_key case folding uses the default Unicode lowercase mapping,
  not full case folding (ß stays ß). Deterministic and
  locale-independent per §4.2's intent; noted in code. Moving to
  full folding later requires a migration that re-keys notes.
- Note for AI-IMP-010: apps/desktop's rollup `external` override
  currently lists only 'electron'. When the utility bundle starts
  importing @ew/persistence, `/^node:/` must be added or rollup will
  try to bundle node:sqlite.
