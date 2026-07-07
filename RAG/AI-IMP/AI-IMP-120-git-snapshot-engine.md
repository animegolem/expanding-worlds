---
node_id: AI-IMP-120
tags:
  - IMP-LIST
  - Implementation
  - backup
  - persistence
  - main-process
kanban_status: planned
depends_on: [AI-IMP-096]
parent_epic: [[AI-EPIC-008-export-import-signoff]]
confidence_score: 0.7
date_created: 2026-07-06
date_completed:
---


# AI-IMP-120-git-snapshot-engine

## Summary of Issue #1

Rev 0.52 §11.4 ratifies session snapshots as the accepted backup
mechanism; nothing is built. Required: project directories become
git-ready regardless of the setting (lock/heartbeat, WAL/journal,
cache/ and derivatives/ gitignored); a per-project setting
(off · git commit · commit + push — push wiring itself is
AI-IMP-122) initializes the repo on first enable; snapshots fire at
End Session, quit, and an in-place idle checkpoint (~10 min without
commands, tunable): flush editor buffers, checkpoint + truncate the
WAL so project.db is a clean single artifact, regenerate the
readable notes tree, commit with a generated message — idle
snapshots never close the project or release the lock. A snapshot
ALWAYS includes the notes tree (vault mirror when that setting is
on, else a minimal Markdown notes export). Settings shows the
backup's disk size beside the setting. Done means: enabling the
setting on a project yields a repo whose history gains one commit
per checkpoint moment containing project.db, assets, and readable
notes, with the size readout live.

### Out of Scope

- Remote push execution (AI-IMP-122) — this ticket stores the mode
  enum only.
- Restore surface (AI-IMP-121).
- The full escape-hatch export / vault mirror features (§16); only
  the minimal notes/ Markdown writer ships here, reused later.
- Retention/compaction UI (keep-all per rev 0.52).
- History browsing UI.

### Design/Approach

Snapshot work runs in the main/utility process beside the project
service (single-writer discipline: the service itself performs the
WAL checkpoint between commands). Git mechanics: prefer shelling
out to system git when present (feature-detected once, surfaced in
Settings) with a bundled pure-JS fallback (isomorphic-git) for
machines without git — DECIDE during implementation against a
multi-GB asset dir benchmark and record the choice in Issues
Encountered; the artist's machine cannot be assumed to have
developer tooling. Idle detection rides the command gateway's
commit stream + a timer; AI-IMP-096's checkpoint-on-suspend moments
gain the commit step. Notes tree: minimal writer emitting
title-named .md files (collision policy from §16) including §7.8
metadata blocks via the AI-IMP-119 refresh function when that has
landed (soft dependency — degrade to prose-only bodies if 119 is
unmerged). Generated commit message: timestamp + counts (n notes,
n assets, trigger kind). Size readout: du of .git + working copy
delta, computed lazily when Settings opens.

### Files to Touch

`apps/desktop/src/main/` snapshot service module (new): git
detection, init, gitignore seeding, commit, idle timer.
`packages/persistence/src/` checkpoint/truncate entry point (or
reuse 096's), notes-tree writer (new module + test).
`packages/protocol/src/index.ts`: setting enum, snapshot status,
size query.
`apps/desktop/src/preload/index.ts`: bridge additions.
`apps/desktop/src/renderer/views/SettingsView.svelte`: setting row
+ size readout.
`apps/desktop/e2e/snapshots.spec.ts` (new).

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [x] Git-ready projects: gitignore seeded on project create AND
      on first snapshot enable for existing projects (lock,
      heartbeat, WAL/journal, cache/, derivatives/).
- [x] Git mechanics decision: benchmark system-git vs
      isomorphic-git on a project with a multi-hundred-MB assets
      dir; record numbers and the pick in Issues Encountered;
      feature-detect at runtime with a visible Settings note when
      degraded.
- [x] Snapshot engine: init-on-enable, commit (project.db after
      WAL checkpoint+truncate, assets/, notes/), generated
      message; unit/integration test against a temp project.
- [x] Notes-tree writer: title-named .md files with §16 collision
      policy; includes §7.8 metadata blocks when the 119 refresh
      function exists; test covers collision and round-trip
      stability (unchanged notes produce no diff).
- [x] Cadence wiring: End Session and quit ride the existing
      ritual; idle checkpoint (tunable ~10 min constant) flushes
      buffers, checkpoints WAL, commits WITHOUT closing the
      project or releasing the lock; no idle commit when nothing
      changed since the last snapshot (empty-diff guard).
- [x] Settings: off · commit · commit+push enum persisted
      per-project; disk-size readout computed lazily on Settings
      open.
- [x] E2E: enable → end session → repo exists with one commit
      containing db + notes; second end-session with no changes
      adds no commit; idle path covered at integration level with
      a shortened threshold.
- [x] Gates: `pnpm -r build`, `pnpm -r test`, `pnpm -r lint`,
      desktop e2e hidden.
- [ ] HUMAN-TESTING entry appended (does End Session feel
      instant with snapshots on; size readout sanity on a real
      project). — DEFERRED to the lead: this agent is fenced out of
      RAG/HUMAN-TESTING.md; the lead appends on merge.

### Acceptance Criteria

**Scenario:** Snapshots on a real project.
**GIVEN** a project with images and notes and snapshots set to
"git commit"
**WHEN** the user ends the session
**THEN** the project directory is a git repo whose new commit
contains a clean project.db, the assets, and a readable notes/
tree, with lock/WAL/cache paths ignored.
**WHEN** the user works for the idle threshold without commands
**THEN** a snapshot commits in place and the project stays open,
locked, and responsive.
**WHEN** a second checkpoint fires with no changes
**THEN** no empty commit is created.
**WHEN** the user opens Settings
**THEN** the backup's disk size shows beside the setting.
**GIVEN** a machine without system git
**THEN** snapshots still function via the bundled fallback (or the
setting visibly explains the limitation, per the recorded
decision).

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->

### Git engine benchmark (system git vs isomorphic-git)

Synthetic project of random bytes (NOT a real project): one 30 MB
`project.sqlite`-like binary, ~150 `assets/blobs/*.bin` of 1.3–4 MB,
and 40 small `notes/*.md` — ~430 MB total per run. Two runs each,
Node v26.4, git 2.55, isomorphic-git 1.38.6, M-series macOS.

| engine        | init  | first add+commit | incremental (few files) | empty-diff check |
|---------------|-------|------------------|-------------------------|------------------|
| system git    | 0.02s | 11–12s           | ~0.9s                   | ~0.02s           |
| isomorphic-git| 0.00s | 3.5–4.1s         | ~3.3–4.0s               | ~3.5s            |

Both produce byte-equivalent `.git` sizes (~460 MB) — no data loss
either way. isomorphic-git's *first* commit is faster only because
git spends longer zlib-compressing incompressible RANDOM bytes; real
assets (already-compressed PNG/JPG) commit fast on both, so that
column is a benchmark artifact, not a real-world win.

**The decisive metric is the common path, not the first commit.**
Almost every snapshot is incremental (a few notes/db changed) or
empty (an idle pause with nothing new → the empty-diff guard). There
system git wins by ~4–170×: its index tracks mtime+size so it never
re-hashes the unchanged 400 MB, and an empty-diff check is 20 ms.
isomorphic-git re-hashes the ENTIRE working tree on every
`add`/`status` — so its per-checkpoint cost scales with PROJECT size,
not CHANGE size. For a multi-GB reference board an idle checkpoint
that touched nothing would still stall for tens of seconds — exactly
the invisible-background case that must stay cheap.

**Decision: system git, feature-detected once at runtime.** When git
is absent the setting degrades with a visible Settings note ("install
git to enable snapshots") rather than shipping isomorphic-git as a
fallback that becomes unusable at the scale backups matter — and it
keeps the utility bundle lean (no extra dep). The engine boundary
(`createSnapshotEngine`, `src/main/snapshot.ts`) isolates git mechanics
so a JS fallback stays a drop-in if the lead revisits this for
git-less machines. On the artist's macOS target git ships with the
Xcode Command Line Tools, so absence is the rare case.

### Notes / deviations

- **Single-writer discipline honored.** Main owns only git (filesystem
  + shell-out) and the idle timer; every DB touch — WAL checkpoint and
  the notes-tree write (which refreshes §7.8 blocks) — is delegated
  back to the utility's project service through `callUtility`. Main
  never opens a second SQLite handle.
- **Order within a snapshot:** flush editor buffers → (enabled)
  `snapshot-write-notes` (regenerate `notes/`, refresh §7.8 blocks in
  the DB) → `checkpoint-wal` (truncate WAL, sealing the block refresh
  into `project.sqlite`) → `git add -A` → empty-diff guard → commit.
  When the mode is `off` only the flush+checkpoint runs — the exact
  AI-IMP-096 rest-point behavior is preserved unchanged.
- **Cadence surfaces:** the AI-IMP-096 rest points (suspend,
  lock-screen, sustained blur) now call `runSnapshot('rest')`; quit
  (`window-all-closed`) takes `runSnapshot('end-session')` BEFORE
  closing the project (the snapshot needs the live utility), bounded by
  a 15 s race so a backup hiccup never traps quit; the idle timer
  (`EW_SNAPSHOT_IDLE_MS`, default 10 min) rides the commit-event stream
  and fires once per idle period without closing the project or
  releasing the lock. The wired "End Session" ☰ menu item stays
  deferred (RFC: "arrives with sync and the vault mirror"); quit is the
  existing full ritual this ticket hooks.
- **commit+push** stores the enum only; the engine treats it as
  `commit` (no push) — push execution is AI-IMP-122, as scoped.
- **§16 collision policy:** notes are title-named; `title_key`
  uniqueness already forbids two active notes sharing a key, so
  collisions arise only from filesystem sanitization (e.g. `A:B` and
  `A/B` → `A B`). Resolved with a deterministic case-insensitive
  ` (n)` suffix over a stable `title_key, id` ordering, so an unchanged
  note keeps its filename and produces no git diff (round-trip stable,
  tested). Orphan `.md` files (renamed/trashed notes) are swept.
- **No schema migration.** The mode enum is an ordinary project-tier
  setting (`snapshot_mode`) written through the existing non-undoable
  `set-setting` verb — same pattern as `note_metadata_defaults`.
- **HUMAN-TESTING** entry left for the lead (agent is fenced out of
  that file). Suggested: does End Session feel instant with snapshots
  on; size-readout sanity on a real multi-GB project.
- **Protocol edits** kept minimal/additive (another agent appends to
  the same file in parallel): one `SnapshotMode` type + key constant,
  one `snapshot-write-notes` verb, one `SnapshotStatus` type.
