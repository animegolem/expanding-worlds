---
node_id: 2026-07-07-LOG-AI-twelve-closes-and-two-epics-worth
tags:
  - AI-log
  - development-summary
  - frames
  - backup
  - codex-channel
closed_tickets: [AI-IMP-108, AI-IMP-120, AI-IMP-121, AI-IMP-122, AI-IMP-123, AI-IMP-124, AI-IMP-125, AI-IMP-126, AI-IMP-127, AI-IMP-128, AI-IMP-129, AI-EPIC-017]
created_date: 2026-07-07
related_files: [apps/desktop/src/main/snapshot.ts, packages/persistence/src/migrations/0007-frame-membership.ts, apps/desktop/src/renderer/canvas/host.ts, RAG/AI-EPIC/AI-EPIC-017-frames.md, RAG/AI-EPIC/AI-EPIC-008-export-import-signoff.md]
confidence_score: 0.9
---

# 2026-07-07-LOG-AI-twelve-closes-and-two-epics-worth

## Work Completed

The new billing week opened with the whole unblocked runway and
closed it: eleven IMPs + one epic in one continuous fan-out, all
Opus-agent-built, lead-reviewed, merged, and gated on main. The
Codex channel matured first: the round-2 review was triaged (its
stale-dist P1 disproved again — the PROTOCOL now orders `pnpm -r
build` before any test claim; two real finds became IMP-124/125),
and the `.codex/` drop-box grew the full envelope — `inbox/<id>.md`
submissions hash-watched by the ci-watch hook, `outbox/<id>.md`
verdicts (accepted | amend | declined, round-matched) that the
Codex watcher polls. Then the closes, in order: 125 (trashed-owner
boards degrade per §8.1/§9.6; bookmark Restore revives the node
aggregate), 124 (SSRF redirect guard — Electron's net.fetch cannot
expose Location, so a per-hop re-issue loop over net.request guards
every target before any request), 123 (undo keys DERIVE from the
keymap registry; panels disposer race-guarded; 'card' in
AppearanceKind; `[[` neutralized in generated metadata), 108
(retroactive — shipped in 8103b17, frontmatter never flipped), 120
(session snapshots: system git chosen by a benchmark that measured
the paths that matter — incremental/empty-diff, where iso-git
re-hashes the whole tree), EPIC-017 activation (126–129 cut with
interface decisions at cut time), 128 (arrange sort keys +
normalize-to-median; the "existing packer" turned out not to exist
— agent built the shelf packer rather than false-greening), 126
(frame model: migration 0007 whose member-PK IS the single-parent
invariant, and the LAST node rebuild — the appearance CHECK is
gone), 121 (restore-to-copy via read-tree into a throwaway index;
stale index.lock sweep from the 120 review), 127 (frames on the
board: renderer-side undo GROUPS, drag-end innermost capture,
geometry immunity), 122 (remote push on a chain the ritual never
awaits; dedicated ew-snapshots remote; once-per-episode toast +
perch debt), 129 (the drop moment: deferred-import compound undo,
per-frame sort-on-drop, load-into-frame). EPIC-008's backup half
(FR-7/8/9) is fully shipped; EPIC-017 closed whole and tagged
v0.9.0 (release workflow building). Main ended at 145/145 e2e,
ZERO known flakes: the trash.spec strict-mode collision (toast
surface shadowing the empty-state testid) and the perf
memory-release flake (see below) were both root-caused and killed,
not retried.

## Session Commits

Channel/triage: 67e4355 gitignore .codex/, 5c8ac99 round-2
ingestion. Closes/merges: 9e3691c+b6d885c (125), db429f2 (124),
bfae60f (123), f06e773 (123+124 close), db639a9 (EPIC-017
activation), e90b54d (108), 5d0f73c+03f954b (120), 3f2290e (128 +
trash flake fix in 1105282-adjacent commit), 12a04a5 (126),
1105282+fdcafbd (127), 91539b8+1b5f17f (121), 7d689e2+8693348
(122), f254a7d (122 test follow-up), f621923 (129), a26ea54
(zombie-refresh fix), cc63dbd (epic close + v0.9.0 tag).

## Issues Encountered

- **The zombie-refresh texture leak (§12.2)**: the perf
  memory-release spec went 1-in-3 flaky after 127. Mechanism: a
  refresh suspended at its scene query when openCanvas swaps
  resumed with the OLD canvas's scene, re-acquiring just-released
  textures into the idle pool, which nothing purges until the next
  swap. Fix: epoch guard (capture canvasId before the await, drop
  stale results). 6/6 isolated repeats post-fix, 145/145 full gate.
- **A killed agent isn't dead**: the first 127 agent kept executing
  after the owner's kill (until an API limit), wrote partial work
  into lead-docs via absolute paths, AND had flipped lead-docs onto
  a branch name the retry agent then couldn't use — three of my
  commits landed on that branch before the close-commit output
  exposed it. Recovery: stash the strays (never reset), `branch -f
  main HEAD` (main was checked out nowhere), delete the stray
  branch. Memorized: git-toplevel guard now opens every agent
  brief; after ANY kill, `git status` both trees.
- **/tmp writes are sandboxed away** (post-account-swap): gate logs
  written to /tmp vanished; use the scratchpad path. Cost one
  confusing GATES_RED diagnosis.
- **Codex stale-dist P1, round two**: 471/471 persistence after a
  clean build. The drop-box PROTOCOL now instructs Codex to build
  first; stop re-litigating this class.
- 122's agent amended an already-merged commit, caught the rewrite
  itself, and unwound to a clean follow-up — the honesty the
  delegation model wants; the follow-up (13 toast-episode units)
  was taken as a fast-forward.
- 129's SettingsView conflict with 122 (both append script members
  sharing a closing brace) — resolved as the union; the "another
  agent is editing Settings" warnings in both briefs kept it to
  one trivial hunk.

## Tests Added

Persistence: frames handlers/queries + migration 0007 (25),
notes-tree writer (11), queries-structure owner-trash units.
Canvas-engine: frames containment/index (21), arrange/normalize
(12→20 file total). Desktop: net-guard redirect units (16),
snapshot engine + index.lock sweep (154-line file), undo-keys
registry-consistency (3), panels teardown (2), undo-stack groups
(3 new), status push-episode (13). E2E: navigation trashed-owner,
frames.spec (2), frames-drop.spec (3), board-tooling arrange (2),
snapshots (2), restore, snapshot-push, settings undo/redo rows.
Final suite: 145 e2e + 107 desktop vitest + 510 persistence + 335
canvas-engine + 50 domain.

## Next Steps

- **v0.9.0 release workflow** was in_progress at close — verify the
  installers attached; CI on cc63dbd likewise.
- **The owner's flush list is HEAVY** (drop moment, frames feel,
  snapshots, restore, push, arrange, plus everything carried) — and
  load-into-frame has NO automated e2e; it needs his hands.
- Charm-bar member-drag intercept: known edge, wants a charm-surface
  ticket after the feel pass.
- EPIC-008's export half (FR-1–6) re-cuts against current §16 at
  activation; save-composite-from-frame rides it.
- Design-blocked remainder: EPIC-016 menus (context-menu grammar),
  EPIC-018 TipTap go/no-go, undo capture breadth (DESIGN-QUEUE
  tabled). The owner's design pass runs against Design-letter-3
  (16 items + authority ladder + the new input-primitive registry
  lead).
- The Codex watcher now has the full inbox/outbox envelope — first
  real submission will exercise the verdict loop.
