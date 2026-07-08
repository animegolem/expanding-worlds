---
node_id: 2026-07-08-LOG-AI-the-swarm-audit-worked-to-completion
tags:
  - AI-log
  - development-summary
  - audit
  - stability
  - releases
  - process
closed_tickets: [AI-IMP-134, AI-IMP-138, AI-IMP-152, AI-IMP-170, AI-IMP-171, AI-IMP-173, AI-IMP-175, AI-IMP-176, AI-IMP-177, AI-IMP-178, AI-IMP-179, AI-IMP-180, AI-IMP-181, AI-IMP-182, AI-IMP-183, AI-IMP-184, AI-EPIC-008]
created_date: 2026-07-08
related_files:
  - RAG/AI-IMP/AI-IMP-173-swarm-stability-audit.md
  - RAG/DESIGN-QUEUE.md
  - RAG/HUMAN-TESTING.md
  - apps/desktop/src/renderer/chrome/navigation.ts
  - apps/desktop/src/renderer/undo/undo-stack.ts
  - apps/desktop/src/renderer/canvas/host.ts
  - packages/persistence/src/export/project-export.ts
  - packages/persistence/src/handlers/lifecycle.ts
  - apps/desktop/build/icon.png
confidence_score: 0.9
---

# 2026-07-08-LOG-AI-the-swarm-audit-worked-to-completion

## Work Completed

The AI-IMP-173 stability audit ran end to end and its findings were
WORKED, not shelved: ten Sonnet control-flow reviewers (per-domain
briefs, mandatory anchor-coverage tables) + one Opus aggregator
produced MASTER-FINDINGS (46 findings; 6 P1, all lead-verified
before ticketing). An Opus drafter turned lead triage into ten fix
tickets (175–184), built by Opus agents in four collision-fenced
waves, each lead-reviewed, union-gated, and closed. Suite grew
195 → 213 e2e. Releases: v0.14.0 (EPIC-008 close + the owner-crowned
5a app icon, rendered from the App Icon Document master into
electron-builder's buildResources) and v0.15.0 (the stability wave —
the testing-week build). Also closed: 134 (was merged, needed its
feel entry), 152 (hand rules six-for-six conformant), 138 (frame
furniture, sort chip in the charm bar per same-day owner ruling),
170 (URL cluster; `[text]([[Note]])` ruled link-wins), 171 (tag
rename pencil). Owner rulings recorded: frame sort → charm bar;
macOS chord GO (174 cut); undo breadth → every deliberate verb but
node-trash (shipped in 182, feel-trimmable); icon 5a. V2 sketch
(iPad/Tauri/PencilKit/git-sync, sell-iOS/free-desktop, 2020 iPad
Pro floor) captured in DESIGN-QUEUE. Codex reviewed two heads
(50ed3ebe, 8404ea0d): six findings, all triaged into the same
families the swarm named, none P1.

## Session Commits

f5cc608c→50ed3ebe (pre-dawn, prior log's arc: 169/172/166/CI/
sign-off). This session: 4d90f5ae v0.14.0 (EPIC-008 close + icon);
1fdee44a rulings (138 revision, 174 cut); 36a71cc5/42339c9d 152
merge+close; 1c6f7a4b/17e9b571 138+170+171 merges and closes;
308be9a1 fix wave cut (175–184); 3197f0dc/0f9849a8/62f16225/
64e429bf wave A (176/180/179/178); 4a203325/8f8f5fad + f37bc5f2
waves B (181/183); 26f15cd4 wave C close (177/184); a551d4ab 175
merge; 1eb872ff 182 merge; 77418c39 173 close (+185/186 cut,
DESIGN-QUEUE tag-remove entry); 1065f3e9 v0.15.0. Tags v0.14.0,
v0.15.0 pushed; owner tree fast-forwarded after every push.

## Issues Encountered

- Agents park FOREVER when their >10-min validation run is
  auto-backgrounded by the harness (three cases: 178, 179, 175) —
  the completion event never re-invokes a stopped subagent. Fix
  institutionalized: briefs mandate SHARDED foreground gates
  (build / package units / desktop vitest / playwright in halves /
  lint); recovery = SendMessage into the intact worktree + scoped
  pkill of orphans. In delegation memory.
- import-batch.spec.ts flaked twice (retried green both times) —
  the suite's worst actor; harden if it recurs. One wave-C close
  commit misattributes the flake to decorations; the gate log is
  authoritative.
- The 180 agent wrote its own AI-LOG entry
  (2026-07-08-LOG-AI-frame-membership-undo.md) — AI-LOG wasn't in
  its do-not-touch list and the lead's --stat review missed it.
  Harmless (accurate content), left in place; add AI-LOG to agent
  fences going forward.
- cwd drift caused a doubled apps/desktop/apps path (cleaned) and
  one failed close batch (rerun from root) — recurring hazard,
  use absolute paths.
- 182 found tag-REMOVE has no renderer gesture at all
  (UnassignTagFromNode issued nowhere) — in DESIGN-QUEUE with the
  uncaptured gallery/mirror tag-add copies.
- 175 needs owner eyeballs: settings swatch names ("Flat canvas
  color 1–6"), tag-lens three-state copy.

## Tests Added

+18 e2e (195→213): 152's Option-split/move-snap pin; 138's
furniture round-trip; 170's no-fetch URL cluster; 171's UI rename +
conflict; 176's camera race + key-repeat Home guard; 178's
overlapping-drop queue; 180's member/frame delete-undo; 181's held
Cmd+Z; 183's escape-routing trio; 177's stale read-model pair;
182's appearance/detach/trash-exclusion. Units: 179's
revert-proven mid-export corruption test (hooks seam), 180's batch
restore-order matrix, 181's hand-released overlap race, 184's
reveal-generation guard, 175's tooltip helper, 182's capture-verb
matrix. All deterministic; interleave-timing e2e deliberately
declined per house doctrine.

## Next Steps

Testing week: owner + alph on v0.15.0; work their lists in batches
(Opus builders, Fable triage/review). Owner-pending: PHASE-1-SIGNOFF
counter-signature, HUMAN-TESTING flush (now ~12 entries), 175's two
copy calls, tag-remove placement ruling, frame charm-crowding
conversation. Build queue: 174 (chord), 185/186 (verify-first
families), EPIC-025 palette picker (alph's ask) then EPIC-020/021.
Reserved: end-of-weekend Fable solo audit of cross-shard boundaries
(delegation memory) before the extension lapses 2026-07-12. Read
MASTER-FINDINGS in the session scratchpad for the P3 backlog;
DESIGN-QUEUE for open rulings. Codex should review the v0.15.0 head
(1065f3e9fb9c83b175d5a396277e0e71ceb0715d) when the owner fires it.
