---
node_id: 2026-07-06-LOG-AI-ratification-sprint-and-the-wave
tags:
  - AI-log
  - development-summary
  - design-ratification
  - undo
  - fleet-friction
closed_tickets: [AI-IMP-097, AI-IMP-102, AI-IMP-106, AI-IMP-107, AI-IMP-108, AI-IMP-109, AI-IMP-110, AI-IMP-111, AI-IMP-112, AI-IMP-113, AI-IMP-114, AI-IMP-115, AI-IMP-117]
created_date: 2026-07-06
related_files: [RAG/RFC-0001-Core-Note-Node-and-Canvas-Model.md, RAG/design/Design-letter-3.md, RAG/design/surface-coverage.html, packages/canvas-engine/src/command-gateway.ts, apps/desktop/src/renderer/undo/, apps/desktop/src/renderer/keys/registry.ts, scripts/repair-electron.sh]
confidence_score: 0.9
---

# 2026-07-06-LOG-AI-ratification-sprint-and-the-wave

## Work Completed

The evening after the documentation review became a ratification
sprint and a thirteen-ticket close. The session survived a total
context outage mid-day (auto-compact was off; the tail was
reconstructed from the transcript JSONL, including three unread
Discord screenshots). The owner adopted a one-ticket-at-a-time PM
flow (now a memory) that emptied AI-IMP-107's ten-item design
agenda in one evening: RFC revs 0.45–0.49 ratified the tag-add
surface, appearance charm, ☰ inventory, trash browser shape,
materialization-undo rule, swap bucket + verb pair
("Replace image…"/"Swap for…", "file" banned, impact confirm on
multi-placement), everything-scope pull (ends as a place cursor),
background-color row, Mod+D, tethered-panel world-scaling, the
keymap registry, and shaped video + the plugin-containment ladder
(declarative manifests → WASM host; Firecracker ruled out).
Captures from the artist conversation landed throughout (swap-node
flow, fold-cycle grammar, first-run ask-intent guide,
composability principle). A meta-analysis agent read all 16 logs +
73 Issues Encountered sections and found four root-cause clusters;
EPIC-022 remediated three as tickets and two as CLAUDE.md
conventions. Three agent waves built and the lead merged: 097
close, 106 (+boot-deafness fix), 108, 109, 110, 111, 112, 113,
102, 114, 115, 117. Deliverables for the design pass:
RAG/design/ (Design-letter-3.md, surface-coverage.html, the v1.0
zip). The primary tree now rides `owner-view` pinned to
origin/main; duplicate unpacked design files were discarded after
byte-compare (old letter stashed in scratchpad).

## Session Commits

~30 on main, one per ticket or reviewed merge: rev 0.45 batch
(536cbe7), 097 close (bc29fac), 106 merge + lead transport half
(5ab8c0f, 3cc48a7 — retain-and-pull for cold-boot service events),
106 close + surface tickets cut (d6d23a6), EPIC-022 (af64d10),
merges/closes for 112/110/111 (d44d384, 310b352, febbc49), rev
0.46 trash ratification, 108 merge, rev 0.47 (swap/pull/video/
panel-scale), rev 0.48 + 107 close, 109/113/102 merges and closes
(5dd091d, fce0350), design letter + coverage map, RAG/design/
move, 114 merge + rev 0.49 close, 117 merge + close (4826332).

## Issues Encountered

- Context hit 100% with auto-compact off; recovery via transcript
  tail + image cache. The owner's queued reply (approving three
  design calls) was recovered from screenshots.
- The renderer gates App mount on initSettings, so EVERY cold-boot
  service event fired before any listener — the status surface was
  boot-deaf (init failures console-only, repair summaries lost).
  Fixed pull-then-subscribe (project:service-current); found
  because the new repairs e2e failed honestly three times.
- AI-IMP-109's brief assumed a canonical dot palette and icon set;
  neither existed — the agent coined both. Standing gap: the
  renderer draws ONE diamond for all six icon ids (design letter
  item #3).
- AI-IMP-114 needed the committed-hook hoisted to MODULE scope in
  canvas-engine (the note pane's own gateway commits place-on-board,
  invisible to instance hooks) and a persistence fix so
  un-materializing reverts bound tokens to unresolved in the same
  step. Flagged smell for EPIC-007.
- Two worktrees cannot share `main`: the primary tree now rides
  `owner-view` (lead fast-forwards after pushes).
- 117 agent friction worth remembering: `cd` from an agent
  worktree into the main checkout silently runs gates against
  unmodified main — false greens until caught.

## Tests Added

Guard test proving five parallel executes commit under the
optimistic check (fails against the old gateway — verified by
revert); 8 UndoStack units + 6 undo e2e (move/redo, batch,
materialization round-trip, typing defers, cross-gateway
place-on-board, live ☰ rows); materialization inverse unit;
schema-ahead refusal unit; two-launch startup-repairs e2e; tag
find-or-create units (8) + board/panel tag e2e; appearance charm
e2e (4); menu inventory e2e; trash browser e2e; pull place-cursor
e2e; keymap registry units + settings-section e2e; repair-script
idempotence proof. Navigation suites now run at --retries=0.

## Next Steps

The owner is starting design chats on another account, working
down Design-letter-3's fourteen items against
surface-coverage.html; decisions return via DESIGN-QUEUE → RFC
ratification → tickets. Build runway that needs no design: 116
(tethered panel world-scale), IMP-093/EPIC-008 when its shape
lands, Mod+Z joining the keymap registry (recorded debt, rides
EPIC-007's next touch), GalleryView keymap adoption, a
nodeByContentHash query to retire 115's gallery scan, EPIC-016
menus once the grammar call returns. The board queue after that:
EPIC-007 completion (undo surface exists; trash browser shipped),
EPIC-008 with its rescoped exports. Read first: RFC §20 tail
(revs 0.45–0.49), RAG/design/Design-letter-3.md, EPIC-022 for the
conventions now in CLAUDE.md (repair-electron script, scene-ready
primitive, migration-number reservation, no CHECK enums). The
flush list is heavily loaded — the owner validates intermittently;
never check items for him.
