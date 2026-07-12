---
node_id: 2026-07-06-LOG-AI-five-revs-and-the-linux-hunt
tags:
  - AI-log
  - development-summary
  - design-ratification
  - backup
  - ci
closed_tickets: [AI-IMP-116, AI-IMP-118, AI-IMP-119]
created_date: 2026-07-06
related_files: [RAG/RFC-0001-Core-Note-Node-and-Canvas-Model.md, RAG/design/Design-letter-3.md, packages/canvas-engine/src/stage-extent.ts, packages/domain/src/note-metadata.ts, apps/desktop/e2e/undo.spec.ts, RAG/AI-IMP/AI-IMP-120-git-snapshot-engine.md]
confidence_score: 0.9
---

# 2026-07-06-LOG-AI-five-revs-and-the-linux-hunt

## Work Completed

The late-evening continuation of the ratification sprint. Five RFC
revisions landed: 0.50 content-defined stage (PureRef-inspired lit
extent over void, ratchet semantics, welded onto the existing rev
0.11 image-stage/void convention); 0.51 system metadata block
(§7.8 — notes self-document in export: placements tree +
provenance persisted at the body tail, lazy refresh, prose-only
editor seam); 0.52 backup shape (rev 0.24 session snapshots
graduate to accepted with four amendments — in-place idle
checkpoint, always-readable notes tree, in-app restore-to-copy,
keep-all + size readout; EPIC-008's backup half activated,
AI-IMP-120/121/122 cut); 0.53 two quick calls (embed syntax is
Obsidian-style `![[...]]`; URL sources are a first-class field +
domain tag-offer, superseding rev 0.35); 0.54 frames ratified
(frames subsume group machinery, single-parent nesting, geometry
immunity both directions — EPIC-017 unblocked). Three build
tickets closed via Opus agents with lead review/merge: 116
(tethered panels scale with the world, fade floor, pinned stays
fixed), 118 (lit stage: pure ratchet module, void tone derived at
runtime from the effective fill — RFC wording updated to match),
119 (metadata block: grammar in @ew/domain for the renderer import
boundary, refresh rides the RenameNote transaction, no migration).
The owner installed Clawd-on-Desk; its hooks appended cleanly
beside the bell (visual layer + triage-gated audio, no conflict).
A Codex review was ingested: its P0 (persistence tests) was
environmental (stale dist, no build), its ticket findings predated
the landings; the live items became AI-IMP-123 (undo/redo join the
keymap registry; panels.ts disposer leak), the Design-letter-3
authority ladder, and IMP-093's reparent under EPIC-008. Design
letter grew items 15 (stage look) and 16 (metadata card).

## Session Commits

b0cb854 rev 0.50 + 118 cut; a810f56 rev 0.51 + 119 cut; ff10024
rev 0.52 + EPIC-008 activation + 120/121/122 cut; 4418bbe/3ea0f23/
934c138 merges (CI round 1, 116, 118); df1ceac closes + rev 0.53;
80c209a rev 0.54 frames; 860ae74/a9b47f4 119 merge + close;
2c6aab8 Codex ingestion; 6736d08 the Linux harden merge.

## Issues Encountered

- **The Linux CI hunt (two rounds).** Main went red when 114/117
  landed. Round 1: settings.spec asserted mac glyphs (fixed
  platform-aware — now green) and undo.spec's defocus click
  spawned a fresh pin-phantom (fixed with a `v` keypress) — but
  the materialization spec STILL failed on Linux. Round 2 found
  the true mechanism: the Dock's tool-shortcut handler no-ops
  while any text field holds focus, and the phantom textarea's
  DOM removal lags the command commit the test polls — so `v` was
  swallowed, a second phantom spawned, and Mod+Z deferred to its
  editor; macOS passed only because its autofocus loses the race.
  The spec now clicks the Dock's Select button and PROVES
  activeTool + non-typing focus via expect.poll before pressing
  Mod+Z. CI on 6736d08 adjudicates. Flagged sharp edge (not
  changed): tool shortcuts silently dead while any text field has
  focus.
- **Fast-forwarding owner-view the wrong way**: `git branch -f`/
  `update-ref` on the checked-out branch moved the ref without the
  worktree, leaving staged reverse-diffs; verified byte-identity
  against the old commit and restored from origin/main. Procedure
  memorized: only `git merge --ff-only origin/main` run IN the
  primary tree. A wrong-directory commit attempt also recurred
  (cd state persisted into the primary tree) — harmless, caught by
  "nothing added".
- **Codex reviews need the build convention**: its P0 (293
  persistence failures) reproduced only against stale dist; full
  gates on main were green before and after (131/131 e2e on the
  final run). Triage Codex findings against CURRENT main, not its
  snapshot.
- 119 agent relocated the block grammar to @ew/domain (renderer
  cannot import persistence) — accepted as the correct boundary;
  ticket text updated by the agent.

## Tests Added

stage-extent units (22) + content-stage e2e (5 scenarios); panel
scale/fade units + panels e2e additions; note-metadata grammar
units (10) + db read-model units (10) + note-metadata e2e (2);
registry platform-contract units (19 in file); the hardened
materialization spec (18/18 at --repeat-each=3 --retries=0).

## Next Steps

First: check CI on 6736d08 (the Linux verdict on the hardened
spec). Build runway needing no design: AI-IMP-120→121/122 (backup
engine chain — 120 carries the system-git vs isomorphic-git
benchmark decision), AI-IMP-123 (registry + disposer hygiene),
EPIC-017 IMPs (frames — all calls ratified at rev 0.54). EPIC-016
menus still await the context-menu grammar from the owner's design
pass. The owner is switching billing accounts for the design
sessions; the untracked `RAG/Expanding Worlds Design System.zip`
is the closeout snapshot of the prior effort (~rev 0.48 baseline)
and will be updated from the new account — the authority ladder in
Design-letter-3 governs precedence. The only remaining
epic-blocking design call is the TipTap go/no-go (EPIC-018). The
HUMAN-TESTING flush list is heavily loaded (stage bloom, panel
scaling, metadata card, undo feel, trash, ☰); the owner flushes
intermittently — never check items for him.
