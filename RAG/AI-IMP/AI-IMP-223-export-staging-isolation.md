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

- [x] Per-request staging; finally-cleanup; orphan sweep.
- [x] Snapshot allowlist replaces `git add -A`; gitignore v2 migration.
- [x] Concurrent-export unit test: both archives valid.
- [x] Gates: build, per-package units, lint, e2e in 4 foreground
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

**Snapshot allowlist derived (cited).** The canonical committed set is
snapshot.ts's own `GITIGNORE_BODY` comment ("a snapshot commits
project.sqlite (checkpointed), assets/, and notes/ only") crossed with
RFC-0001 §11.2 (the `project.sqlite` / `assets/` / `derivatives/` /
`cache/` layout, RFC lines 2743-2751) and §16 (RFC lines 3504-3505:
"Caches, search indexes, thumbnails, and map tiles are regenerable and
need not be canonical export content"). The allowlist is therefore
`['project.sqlite', 'notes', 'assets', '.gitignore']` — the three §16
canonical contents plus the managed ignore file itself (it was already
tracked under `git add -A`; keeping it in the allowlist preserves that
so restored/pushed repos carry the exclusions). Deliberately EXCLUDED
and treated as "expected uncommitted" (never flagged as strays):
`.git`, `project.lock`, the three SQLite sidecars
(`project.sqlite-wal/-shm/-journal`), `derivatives/`, `cache/` — the
exact set the gitignore excludes. Anything else at top level is logged
(`[snapshot] unexpected project entries left uncommitted: …`) and never
committed.

**Deviations / findings.**
- Staging prefix is `ew-export-stage-`, not the ticket's bare
  `ew-export-`, because the persistence suite creates its own
  `ew-export-` / `ew-export-out-` fixture dirs in the same OS tmp; a
  bare-prefix orphan sweep could confuse a fixture (or, in principle, a
  project) for staging. The distinct prefix scopes the sweep to exactly
  what this module creates. Sweep age gate is 24h — far above any
  concurrent export's fresh staging, so concurrency is never swept.
- The empty-diff guard moved from `git status --porcelain` to
  `git diff --cached --name-only`: with an allowlist add, an untracked
  stray makes `status --porcelain` non-empty, which would drive a
  `git commit` with nothing staged (exits non-zero → a spurious logged
  failure). Measuring the STAGED set is the correct guard and stays
  empty-diff-clean.
- `git add -- <pathspec>` still records deletions of tracked files under
  each allowlisted path (a removed note/asset commits), so dropping
  `-A` loses no delete-tracking.
- VACUUM INTO and the notes `cp` are real SQLite/filesystem writes (no
  rename), so cross-filesystem staging in OS temp is safe; assets stream
  from the LIVE project dir (never staged), and the `.partial` atomic
  finalization (AI-IMP-229) still lands beside destPath — the staging
  move composes with it untouched.
- Gitignore v2 migration wraps the managed block in versioned
  BEGIN/END sentinels; `seedGitignore` rewrites an old v1 block in place
  (user-authored lines outside it preserved) and is idempotent on a v2
  file. Existing projects thus gain the versioned exclusions — the old
  seed early-returned on the marker and left them stale (the CA-010
  hazard).
- Updated the existing restore e2e/unit fixtures that committed a
  top-level `marker.txt` to use `notes/marker.md` (an allowlisted path),
  since a top-level stray is now correctly NOT committed.

**Validation.** `pnpm -r build` clean; persistence units 555 passed
(incl. new concurrent-export test); desktop units 338 passed (incl. new
allowlist + v2-migration tests); `pnpm lint` clean; e2e all four shards
green except one PRE-EXISTING, environment-only failure
(`decorations.spec.ts` font-family enumeration expects >3 installed
system fonts — unrelated to export/snapshot; fails identically on
retry, zero overlap with the diff).
