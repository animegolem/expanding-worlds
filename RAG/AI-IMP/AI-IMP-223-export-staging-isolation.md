---
node_id: AI-IMP-223
tags:
  - IMP-LIST
  - Implementation
  - persistence
  - export
kanban_status: planned
depends_on: []
parent_epic:
confidence_score: 0.85
date_created: 2026-07-09
---


# AI-IMP-223-export-staging-isolation

## Summary of Issue #1

Terra audit (2026-07-09, P3, lead-verified): every export
recreates the SHARED `.tmp-export` staging dir
(project-export.ts ~139, `rmSync` then `mkdirSync`), so re-entrant
exports delete each other's staging mid-write — a truncated
archive from the loser. Low likelihood (UI mostly serializes) but
the 179 export-race family taught us "mostly" isn't a guard.

**EXPANDED by Sol audit CA-010 (P2, 2026-07-09):** the staging dir
lives INSIDE the project, snapshot's managed .gitignore doesn't
exclude it, and snapshot stages with `git add -A` — an overlapping
snapshot can COMMIT the frozen database/notes copy, duplicating
the whole project inside its own backup (disk exhaustion, slow
shutdown, remote-push cost). Removing staging after `git add`
doesn't unstage it; `seedGitignore` early-returns on its marker so
a template edit alone won't fix existing projects; saving the
final .ewproj inside the project has the same hazard (229 refuses
that destination).

Done means: staging moves to per-request dirs in OS TEMP (outside
the project entirely — kills both the clobber and the snapshot
capture), cleaned in the finally + an orphan sweep; snapshot
stages an explicit ALLOWLIST instead of `git add -A`; and the
managed .gitignore block gains a migration path (marker version
bump) so existing projects get the new exclusions.

### Out of Scope

- Export content/manifest semantics (179's freeze-the-copy,
  correct).
- UI-level serialization (belt, not the fix).

### Design/Approach

Staging: `mkdtemp(join(tmpdir(), 'ew-export-'))` per request; the
existing try/finally owns cleanup — point it at the per-request
dir; sweep orphaned `ew-export-*` older than a day at export
start. VACUUM INTO works across filesystems (it's a SQLite write,
not a rename) — verify; if the notes-tree copy relied on same-
volume rename anywhere, switch to copy. Snapshot allowlist:
enumerate what a project legitimately contains (db, notes/,
assets/, derivatives/, settings — read the snapshot ticket/RFC
§11 for the canonical list) and `git add` exactly that set;
anything unexpected is logged, never committed. Gitignore
migration: version the managed marker (`ew-managed v2`), rewrite
the block when the version is old. Unit: two concurrent exports
both valid; a snapshot during a (simulated) export commits no
staging or archive.

### Files to Touch

`packages/persistence/src/export/project-export.ts` + spec,
`apps/desktop/src/main/snapshot.ts` (allowlist + gitignore
migration) + its spec.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [ ] Per-request staging; finally-cleanup; orphan sweep.
- [ ] Concurrent-export unit test: both archives valid.
- [ ] Gates: build, per-package units, lint, e2e in 4+ foreground
      shards.
- [ ] HUMAN-TESTING entry appended at merge by the lead.

### Acceptance Criteria

**GIVEN** two exports triggered concurrently
**THEN** both complete with valid, hash-verified archives — no
shared staging to clobber.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->
