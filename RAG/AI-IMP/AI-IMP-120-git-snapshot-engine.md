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

- [ ] Git-ready projects: gitignore seeded on project create AND
      on first snapshot enable for existing projects (lock,
      heartbeat, WAL/journal, cache/, derivatives/).
- [ ] Git mechanics decision: benchmark system-git vs
      isomorphic-git on a project with a multi-hundred-MB assets
      dir; record numbers and the pick in Issues Encountered;
      feature-detect at runtime with a visible Settings note when
      degraded.
- [ ] Snapshot engine: init-on-enable, commit (project.db after
      WAL checkpoint+truncate, assets/, notes/), generated
      message; unit/integration test against a temp project.
- [ ] Notes-tree writer: title-named .md files with §16 collision
      policy; includes §7.8 metadata blocks when the 119 refresh
      function exists; test covers collision and round-trip
      stability (unchanged notes produce no diff).
- [ ] Cadence wiring: End Session and quit ride the existing
      ritual; idle checkpoint (tunable ~10 min constant) flushes
      buffers, checkpoints WAL, commits WITHOUT closing the
      project or releasing the lock; no idle commit when nothing
      changed since the last snapshot (empty-diff guard).
- [ ] Settings: off · commit · commit+push enum persisted
      per-project; disk-size readout computed lazily on Settings
      open.
- [ ] E2E: enable → end session → repo exists with one commit
      containing db + notes; second end-session with no changes
      adds no commit; idle path covered at integration level with
      a shortened threshold.
- [ ] Gates: `pnpm -r build`, `pnpm -r test`, `pnpm -r lint`,
      desktop e2e hidden.
- [ ] HUMAN-TESTING entry appended (does End Session feel
      instant with snapshots on; size readout sanity on a real
      project).

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
