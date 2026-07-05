---
node_id: 2026-07-05-LOG-AI-epic-005-note-editor
tags:
  - AI-log
  - development-summary
  - notes
  - wiki-links
  - editor
closed_tickets:
  - AI-IMP-044
  - AI-IMP-045
  - AI-IMP-046
  - AI-IMP-047
  - AI-IMP-048
  - AI-IMP-049
  - AI-EPIC-005
created_date: 2026-07-05
related_files:
  - apps/desktop/src/renderer/NotePane.svelte
  - apps/desktop/src/renderer/note/note-editor.ts
  - apps/desktop/src/renderer/note/wiki-link-plugin.ts
  - apps/desktop/src/renderer/note/link-resolution.ts
  - apps/desktop/src/renderer/note/suggestions.ts
  - apps/desktop/src/renderer/note/open-note.ts
  - apps/desktop/src/renderer/note/AttachNotePicker.svelte
  - apps/desktop/src/renderer/note/UsesSidebar.svelte
  - apps/desktop/src/renderer/note/TitleConflictDialog.svelte
  - apps/desktop/src/renderer/Workspace.svelte
  - apps/desktop/src/main/index.ts
  - packages/persistence/src/queries-notes.ts
  - packages/persistence/src/handlers/notes.ts
  - packages/persistence/src/links.ts
  - packages/domain/src/wiki-links.ts
  - apps/desktop/e2e/notes.spec.ts
confidence_score: 0.9
---

# 2026-07-05-LOG-AI-epic-005-note-editor

## Work Completed

AI-EPIC-005 (notes, links, phantoms) went from activation to closed
in one session. Review found EPIC-003 had already built the entire
command side (rename rewrite, re-resolution sweep,
CreatePin-as-Create-and-Place, lifecycle), so the epic was cut as six
lead-built renderer tickets plus two read models. Delivered: the
CodeMirror 6 note pane with the §10.2 autosave gesture model (one
UpdateNote per burst; idle debounce 1500 ms, blur, note switch, and a
main-process quit-flush handshake), live four-state wiki-link
decoration derived from the same inputs refreshNoteLinks persists
from, `[[` title suggestions with phantom indicators, the phantom
view with all three materialization paths, rename with
external-change folding into CM local undo and §7.7 collision
dialogs, §7.3 activation (immediate note load; space resolved by
location count with flight-and-select for one active-canvas
location), In Trash read-only + Restore, broken-link recovery via a
new RelinkBrokenLinks command, the attach picker, and the §7.4 Uses
sidebar with §6.10 placement flows. New queries: getNoteLinks,
getNoteUses, listNoteTitles. All epic FRs and success metrics
verified; owner feel findings route to EPIC-010.

## Session Commits

- 6d82f7b Activate AI-EPIC-005; cut AI-IMP-044..049 (owner-approved
  decisions folded in: chooser stays EPIC-006, docked pane layout,
  1500 ms debounce, dblclick + node-menu entry points).
- 530eba3 AI-IMP-044: CM6 note pane, autosave gestures, quit flush,
  getNoteLinks/getNoteUses; test-results gitignored.
- 7e6a85e AI-IMP-045: live link states + suggestions;
  linkDisplayState in @ew/domain; listNoteTitles; 10k-note latency
  test.
- 8772fbd AI-IMP-046: phantom view + materialization (Mod+Click
  activation, event-based Create and Place).
- f6a09b2 AI-IMP-047: rename surface, ew-rename-note flush routing,
  minimal-diff external-change folding, conflict dialog.
- 54b288e AI-IMP-048: activation + degraded links; RelinkBrokenLinks
  / BreakNoteLinks commands.
- eb069bf AI-IMP-049: attach picker + Uses sidebar; hidden-window e2e
  mode; DecorationToolbar stale-snapshot fix; epic closed.

## Issues Encountered

Two load-bearing corrections. (1) IMP-048's planned relink-by-text-
rewrite was impossible: refreshNoteLinks deliberately keeps a
title_key broken across saves (invariant 27), so recovery must flip
the records — hence the new RelinkBrokenLinks user command (relink or
recreate in one transaction) with internal BreakNoteLinks inverse.
(2) The recurring "decorations load flake" was a REAL bug:
DecorationToolbar composed text edits from its 120 ms-stale snapshot,
so fast size→bold sequences silently reverted the size; it now
composes from freshly queried data.

Owner-critical infrastructure finding: full e2e runs (~19 sequential
visible Electron launches) stole macOS focus once a second and
thrashed Stage Manager — severe enough to cause the owner motion
nausea, and their in-flight message to Claude landed inside a test
editor and surfaced as a "flake" with their text embedded in the
failure diff. Fixed with EW_TEST_HIDDEN_WINDOWS=1 (playwright.config
sets it; main honors show:false + app.dock.hide() +
backgroundThrottling:false). CDP input, rendering, and the perf
suite all work against invisible windows; the first zero-flake 34/34
run of the session followed, faster than visible runs. Set
EW_TEST_HIDDEN_WINDOWS=0 to watch a run.

Smaller notes: quit flush can't use beforeunload in a sandboxed
renderer — main intercepts window close and waits for an ack
(2 s bound); UpdateNote alone skips the optimistic revision check
(the editor buffer is the prose authority); renames from non-editor
surfaces route through the pane (ew-rename-note) so the §10.2 flush
always precedes the rewrite; create-flow Use Existing conflict is
only reachable via a race and has no deterministic e2e; attach's
create+attach path remains two commands (AI-IMP-020 parity).

## Tests Added

Persistence: getNoteLinks (states, target lifecycle, broken-as-
stored), getNoteUses (grouping, cross-canvas split, trashed
exclusions), listNoteTitles, suggestTitles latency at 10k notes
(<50 ms), RelinkBrokenLinks (relink, recreate-in-one-revision +
sweep, validation rejections, inverse round-trip) — 350 total.
Domain: linkDisplayState (bind active/trashed, broken-beats-active) —
38 total. Desktop e2e: new notes.spec.ts with 12 tests covering slice
items 6–7, 13–15, 22, §7.2 phantom flows (three source notes), §7.3
zero/one/many, §7.7 collisions, §6.10 placement, quit flush via a
real relaunch (first in the suite), and editor-local undo isolation —
suite now 34 tests.

## Next Steps

EPIC-006 (navigation & discovery) is the natural next phase:
workspace tabs, node library, quick-open, bookmarks/history, the
grouped location chooser (§7.4) that IMP-048's many-locations notice
explicitly defers to, and cross-canvas navigation (the Uses sidebar
disables non-active-canvas rows awaiting it). Before cutting it,
re-read RFC §8, §14.1 and the EPIC-006 ticket, and note the pane
currently derives "active canvas" as the root canvas — that
assumption is the first thing tabs will break. Owner hands-on pass
over the note editor is pending; findings go to EPIC-010 (rolling).
The parked PROJECT_LOCKED visible-status proposal still stands.
Discuss-then-batch protocol per memory remains in force.
