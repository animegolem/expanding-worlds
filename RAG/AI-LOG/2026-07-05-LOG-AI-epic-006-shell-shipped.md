---
node_id: 2026-07-05-LOG-AI-epic-006-shell-shipped
tags:
  - AI-log
  - development-summary
  - shell
  - release
closed_tickets:
  - AI-IMP-059
  - AI-IMP-060
  - AI-IMP-061
  - AI-IMP-062
  - AI-IMP-063
  - AI-IMP-064
  - AI-IMP-065
  - AI-IMP-066
  - AI-IMP-067
created_date: 2026-07-05
related_files:
  - RAG/AI-EPIC/AI-EPIC-006-shell-and-local-scope.md
  - RAG/RFC-0001-Core-Note-Node-and-Canvas-Model.md
confidence_score: 0.95
---

# 2026-07-05-LOG-AI-epic-006-shell-shipped

## Work Completed

EPIC-006 (shell-and-local-scope) went from IMP cutting to CLOSED in
one session; v0.6.0 is tagged and the release workflow is building.
The window is now the board: no docked pane, no tab bar, no status
strip.

Nine IMPs. Lead-built: 059 (chrome frame — rail, dock with shape
flyout and selection-conditional segment, hover title strip + Board
menu, one engagement fade clock, tooltip rule; tools gained
shortcuts V/T/S/D/L/A/C), 060 (navigation — the path renders the
back-stack, one navigateTo seam all flights use, viewport-restoring
crumbs, ⌂, Mod+[/], swipe/X-button IPC), 063 (hint charms + §8.4
click grammar + charm bar in a DOM adornment layer; scene read
model gained noteId/childCanvasId; listNodeTags), 064 (the 753-line
pane rehosted as §8.5 panels with the CM6 controller byte-identical
— the panel keeps the note-pane testids because it IS the pane's
realization; pin accumulation, the halo/edge-chip/origin-label
escalation ladder, the corner charm with first-committed-edit
materialization), 065 (uses list in-panel behind "⌖ n places",
link-anchored location chooser, §7.3 zero/one/many complete with
cross-canvas re-tethering — slice item 16 closed), 067 (◉ pin tool,
N; provisional dot whose existence derives from its phantom; the
Create Pin dialog deleted). Agent-built in worktrees, lead-reviewed
and merged: 062 (cursor zones replace drawn handles; placement lock
+ SetPlacementLock, migration 0004; ⌥-drag duplicate), 061
(bookmarks — migration 0005, three commands with undo round-trips,
drag-order-IS-Mod+1–9 with printed shortcuts, In-Trash/broken
degradation; also FIXED a pre-existing §8.1 violation where purge
hard-deleted bookmark rows), 066 (toasts + ⚠ perch; StatusStrip
deleted; recovery.spec retargeted; lead added condition-raise →
engagement wake for §11.4).

RFC rev 0.21 (ghost overlay mode §8.7 with the hard-confirm/
keybind-escape/reset-on-close rules; boards-as-JSON-Canvas in §16;
booru drop adapters §4.7; the ⌥ moment-split in §6.9) and rev 0.22
(gallery grouped-time buckets with the header-as-jump-control, kind
facet, count-ordered tags, and the world·everything scope toggle —
"everything" IS the library by construction of the mirror; Q26
marked shaped-not-closed) and rev 0.23 (the end-session surface —
☰ → End session: flush, optional vault regeneration, close, release
the lock, THEN cloud sync may take the directory; the vault becomes
a standing mirror with a body-and-title pull-back importer over our
own export format). Loose design-artifact extractions are now
gitignored after riding `git add RAG/` into two commits.

## Session Commits

ae12673 IMP cut → 84fc42e (059) → 771b323 (060) → 1e8bb3e/1853774
(062 merge+close) → 1978922 (RFC 0.21) → c4c66b4 (063) →
41095b9 (061 merge) → 4f8b4d9/c5b8601 (066 merge+close+wake) →
8177917/3ad9f4e (RFC 0.22 + artifact untrack) → 1ab3053 (064) →
e230d54 (gitignore) → 568e972 (065) → c066183 (067 + epic close +
v0.6.0) → 1c20dbd (RFC 0.23). Tag v0.6.0 pushed. All gates green at every close:
finally 51 desktop e2e, 8 desktop unit, 375 persistence, 244
canvas-engine, 18 commands, lint, spike.

## Issues Encountered

Real bugs caught by the process: the PathBar painted over the title
strip's Board button (only the FULL suite post-addition saw it —
run everything after ADDING chrome, not just after moving it); the
064 store-rename raced its own flush across gateways and died as a
silent conflict (id-targeted renames now skip the optimistic
check); TWO scene-apply races of one shape (anything reading
items() right after navigateTo must wait for the destination
scene — jumpToPlacement and onCenterPlacements both wait bounded);
the persistence dist-staleness lesson bit again (undefined !== null
grew frame charms on every node); a CM6 subtlety — content-sized
editors put center clicks ON the text line, so the panel editor
gets a definite height. Window-is-the-board fallout: import.spec's
"cursor off canvas" needs a synthesized pointerleave; screen-
coordinate specs need camera resets near background flights. Agent
notes: worktrees needed electron-binary and spike npm-install
repair (brief future agents); one agent stalled on the stream
watchdog and resumed cleanly with SendMessage.

## Tests Added

navigation.spec (4), charms.spec (2), panels.spec (4, incl. the
escalation ladder and cross-canvas activation), the pin-tool
rewrite of import.spec's dialog test, the chrome test in
shell.spec, status.test.ts (8 unit, first desktop vitest), zone
classification units (canvas-engine), bookmark/lock/scene units
(persistence). Suites migrated rather than weakened: notes.spec
passed against panels with one launch assertion changed and zero
editor-controller diffs.

## Next Steps

EPIC-013 (global views) activates next: cut IMPs from its ten FRs
(takeover framework first — outline, tag panel + lens, ⌕
search/quick-open, settings + themes). Follow-ups queued: a small
crop-editor ticket (the charm bar ships crop disabled — the app has
never had one); hand-verify trackpad swipe and mouse buttons 4/5
(machine-unverifiable); owner curates the seeded public-domain art;
design turns for Q26 (gallery keyboard) and Q27 (OS-drop dialogue). Release note:
v0.6.0 builds unsigned installers via the tag workflow; perf e2e
remains a local hardware gate.
