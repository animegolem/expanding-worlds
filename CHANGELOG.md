# Changelog

All notable changes to expanding-worlds, one entry per tagged
release. Versions are sequential minors per epic close (the
epic ↔ version mapping lives in the tag annotation; this file
mirrors it). From v0.20.0 onward each entry has two voices:
**For testers** — what you'll actually notice, in plain language —
and **Under the hood** — the closed tickets. Work lands under
[Unreleased] as tickets close and is renamed on tagging day.
Entries v0.5.0–v0.19.0 are a light backfill distilled from the tag
annotations.

## [Unreleased]

### For testers
- Changed (your field report): the outline preview no longer chases the
  mouse — hovering rows only highlights them. Selection is deliberate:
  click a row, or drive the cursor from the keyboard with arrows, HJKL,
  or WASD (all three work, no setting — WASD keeps your pen hand free).
  → unfolds a board, ← folds it or jumps to the parent.

### For testers (updates)
- New: the app now knows when it's stale. A tray icon (Windows tray /
  mac menu bar) sits quietly and marks itself when a newer build is
  out — its menu takes you straight to the download. Settings grew an
  Updates section with a "Check for updates" button; packaged builds
  also check once at launch, silently.

### Under the hood
- AI-IMP-219: End Session now ages and reclaims blobs only after a
  guarded 30-day grace, with a dry-run byte fact beside backup size.
- AI-IMP-220: optional Trash retention now runs at project open through
  ordinary purge semantics and reports completed cleanup from the perch.
- AI-IMP-270: create-and-attach note gestures now redo by restoring the
  same recoverable note, preserving its id, title, and later body edits.
- AI-IMP-278: launch/on-demand release check (public GitHub API, no
  electron-updater while unsigned), tray perch with template/badged
  glyphs, Settings Updates row, narrow open-download IPC door.
- AI-IMP-277: hover-follow removed for a deliberate selection cursor;
  twelve-key three-dialect navigation as outline navigation intents;
  org-standard fold keys; dialog gate fencing keys (incl. a live
  Enter-under-trash-confirm leak) while outline dialogs are open.

## [v0.24.0] — 2026-07-11 — the control-panel build

### For testers
- New: the outline (▤) is a two-pane control panel — tree on the left,
  a live preview following your cursor on the right. Boards preview as
  honest filmstrips, images full-bleed. Facet chips (including the new
  UNTAGGED) flatten the tree into a cleanup worklist with paths; your
  fold state survives. Type straight into an orphan row's "add a
  note…" and hit Enter — the badge clears. Right-click any row for the
  new menu; the keyboard matches (Enter, Space, Tab, #, N, Delete,
  Esc). Raw ids are gone: images show their filename, unnamed boards
  read "unnamed · N items."

### Under the hood
- AI-EPIC-028 (273-276, the Codex wave on Outliner Kit 1.1 + the
  invariant grammar): typed preview/facet/filmstrip read models with a
  revision-keyed LRU; the pure shell model (flatten, fold survival,
  calm badges); port-backed one-command note capture with the
  promotion-shaped conflict flow; ONE verb inventory enumerated
  through three doors with parity asserted by test; the outline-owned
  getNodeImpact trash confirmation; takeover right-click leak fixed.

## [v0.23.0] — 2026-07-11 — the one-universe build

### For testers
- New: tags on matching library and project images now meet at natural
  settle moments. Closing a project sends its tags to the library; opening
  pulls library tags back with one summary notice. Deleting a tag asks
  whether it should stay local or also leave the library.
- Fixed: the top title band finally shows its smoky gradient — it was
  rendering as a near-invisible sliver — and the home glyph, board
  name, pin, and the window's own buttons now sit on one shared
  centerline. (AI-IMP-272)

### Under the hood
- Mirror-edge tag synchronization (AI-IMP-271) is an additive content-hash
  union applied as utility-owned system writes, outside user undo. Local
  deletion tombstones prevent resurrection; narrow typed library operations
  preserve the renderer capability boundary, and close-time push shares the
  existing bounded quit budget.
- The title band becomes the prototype-exact 46px axis (AI-IMP-272):
  fixed-height gradient band with its hairline, traffic lights at the
  band center, PathBar banded instead of magic-offset, Windows overlay
  at 46 — the owner's "gradient doesn't fire" was geometry, not CSS.

## [v0.22.0] — 2026-07-10 — the caption build

### For testers
- New: placements can carry a short caption without creating a note or
  adding anything to the outline. Add or edit one from an item's menu,
  or use the caption charm on an image; captions travel with their
  placement and replace its ordinary title label.
- New: when a caption grows into an idea, Promote to note can turn it
  into the note title or body. The choice can be remembered, conflicts
  keep the caption safe, and one undo restores the caption.

### Under the hood
- Placement captions (AI-IMP-266) are handler-validated, independently
  undoable placement data. They use the existing world-scaled label
  renderer and crispness buckets, survive export/import and placement
  delete/restore, and stay deliberately absent from outline, gallery,
  and search projections.
- Caption promotion (AI-IMP-267) composes the existing atomic
  CreateNoteAndAttach and caption-clear commands into one undo group,
  with app-tier routing preferences and conflict-safe title handling.
- CI runtime rebalanced (AI-IMP-268): doc-only pushes skip the
  workflow, superseded runs cancel, and the 44-minute single-worker
  e2e step became four parallel shards — a code push gates in
  ~12-14 minutes instead of 45. No test changed.

## [v0.21.0] — 2026-07-10 — the field-report build

### For testers
- Fixed: board-pin names on Home (and every placement label) were a
  blurry smudge once you zoomed in — labels now re-sharpen as you
  zoom, so a board's name is readable at the zooms Home is actually
  used at.
- Fixed: a note with no placement (opened from the gallery) spawned
  its panel half-under the right-edge charm rail — its close button
  secretly clicked the search charm, and the panel could never be
  moved. It now spawns clear of the rail, close closes, and a new ⠿
  grip on the header drags it anywhere without pinning first.
- New: loose notes can finally be deleted — a red Trash action on
  the outline's loose-bin rows, and "Trash this note" inside an open
  loose note's "0 places" list. Recovery is the Trash view (Mod+Z
  deliberately doesn't undo a trash).

### Under the hood
- The Windows CI leg is standing and green (AI-IMP-242/249,
  three consecutive runs): full units + the 16-process lock probe
  + smoke e2e on every push. Six rounds of real Windows findings
  closed en route — fsync semantics, handle leaks, DELETE_PENDING
  on create and mkdir, the cross-platform pnpm electron husk.
- Placement labels re-raster at a quantized effective-zoom bucket in
  the cull pass instead of stretching one DPR-sized texture forever
  (AI-IMP-262) — convicted by a runtime repro: a New-board pin's
  label rasters at ~7 device px and Home zooms magnified it 8-20×.
- The loose-note panel becomes FREE-FLOATING (AI-IMP-258): the
  anchorless fallback honors the store's day-one `screen` contract,
  header drag accepts unpinned free-floating panels, the spawn
  default clears the charm-rail column, and a ⠿ grip marks the
  grab area. Review corrected the ticket: no regression existed —
  the collision and the grab-area gap shipped identically in v0.16.
- The loose-note exit (AI-IMP-260): TrashNote existed with zero
  dispatchers; the outline loose bin and the panel's empty uses list
  now dispatch it through the gateway-backed note project port (no
  new hand-rolled envelopes). Acceptance corrected at review to the
  ratified undo matrix: recovery is the Trash view, not Mod+Z.
- The Windows lock-probe zero-winner convicted as fixture PID reuse
  and fixed in the fixture (AI-IMP-263, Codex): the planted corpse
  pid was recycled into a live runner process and every worker
  honestly refused it — the lock protocol and release path are
  exonerated with cited run evidence; lock.ts untouched. Probe now
  plants a fresh ESRCH-verified pid per round with a one-shot
  recycled-corpse retry. Kills the intermittent main-push CI reds.

## [v0.20.0] — 2026-07-10 — the hardening build

### For testers
- Fixed: resting the cursor on the invisible top bar made ALL
  chrome vanish and never showed the dark title strip — the OS
  owns that band in the frameless window and the app read it as
  "cursor left." The strip now reveals there and chrome stays put.
  (AI-IMP-255)
- Anchored popups and panels (tag panel, search, menus, chooser
  chips) can no longer land partly off-screen in a narrow window —
  one shared placement rule now clamps and flips all of them.
- Settings changes that fail to save now say so and roll back,
  instead of pretending they saved; the backup "Test" button waits
  for the draft to actually save first.

### For testers (hardening — mostly invisible, deliberately)
- Notes can no longer lose text when a save fails during a
  board switch, close, or quit — the draft stays and retries.
- Failed saves, failed backups, and failed snapshots now say so
  honestly instead of pretending they worked.
- Importing two things at once can't collide anymore; interrupted
  undo of a grouped action no longer half-applies.

### Under the hood
- All 14 control-flow audit findings resolved (C10-001..014,
  merge c7c0b1a2, review record AI-IMP-256): capability-bound
  restore/import open, symlink-safe managed paths, IANA-complete
  net-guard, request-owned import staging, correlated flush acks,
  honest tx-depth recovery, atomic grouped undo repair state,
  checkpoint-gated snapshots, bounded background textures,
  latest-wins theme/background application.
- AI-IMP-255: the OS-owned title band no longer blanks chrome
  (see For testers above).
- EPIC-027 opened: the two 2026-07-10 audits (control-flow
  correctness + helper consolidation) tracked as one
  hardening-and-consolidation epic; wave 1 tickets cut
  (AI-IMP-250–254).
- EPIC-027 wave 1 landed (Sol): AI-IMP-250 §8.8 anchored-placement
  helper across nine surfaces + guard scan; AI-IMP-251
  corruption-contained project-setting codec with result-aware
  renderer writes (merges C10-011); AI-IMP-252 node-appearance
  codec closing the CreatePin/SetNodeAppearance validation drift.

## [v0.19.0] — 2026-07-09 — the closure wave

Thirteen tickets: the undo overhaul (universal redo invalidation,
the 64-command policy matrix, batch gestures as one undo, honest
relink inverse), fail-stop compound gestures, import resource
budgets, export staging isolation + snapshot allowlist, atomic
settings, source-slot races, anchor validation, the import-batch
race fix, the New-board verb, and the Windows fsync fix — export
was broken on Windows, caught by the new CI leg on day one.

## [v0.18.0] — 2026-07-09 — Sol's P1 quartet

All four data-safety P1s from the Codex 5.6 control-flow audit:
single-writer lock by kernel guarantee, construction-failure
guard, commit results immune to notification failure, export path
authority + atomic archive finalization. (AI-IMP-226–229)

## [v0.17.0] — 2026-07-09 — testing iteration two

Owner + alph field reports worked to completion: note charm
toggle, the creation palette, selection-aware fit, self-dismissing
recognition chip, title band trigger + nav arrows + board-menu
click-away, labels fade with their art, the WebKit spike harness.
(AI-IMP-210–217)

## [v0.16.0] — 2026-07-08 — the testing-iteration wave

Ten tickets from the first field reports: note-panel wedge cured,
spawn flash gone, hold-at-floor legibility, library picker first
click, gallery ground-click deselect, the mouse navigation scheme
+ middle-drag pan, and the live feel dial.

## [v0.15.0] — 2026-07-08 — AI-IMP-173 stability wave

The swarm audit worked to completion: navigation re-entrancy,
stale read-models, drop-ask queue, export/snapshot race, frame
membership undo, undo serialization, the Escape family, async-open
guards, undo capture breadth, tooltip sweep. The testing-week
build.

## [v0.14.0] — 2026-07-07 — EPIC-008: export/import + Phase 1 sign-off

.ewproj export/import roundtrip, active-only variant, the git
snapshot engine, PHASE-1-SIGNOFF.md, and the app icon.

## [v0.13.0] — 2026-07-07 — EPIC-016: context-click menus

The ratified menu grammar, decoration undo capture, the cascade;
plus wave 6: frameless shell, charm-bar adorned bounds, gallery
Quick Look + size slider, z-ladder port.

## [v0.12.0] — 2026-07-07 — EPIC-018: rich text notes

TipTap editor, source-preserving wiki tokens, folding, the format
bar, frozen dialect.

## [v0.11.0] — 2026-07-07 — EPIC-023: the paper note lifecycle

Open book, tear/tape/place/pull-pin transitions, the rotation
gate; plus the wave-4/5 front-end: format bar, folding, crop
editor, decoration undo, connector-anchor undo, owner-trashed leak
sweep, .ewproj export/import roundtrip.

## [v0.10.0] — 2026-07-07 — EPIC-022: fleet friction

Electron self-heal, gateway burst serialization, the scene-ready
primitive, fleet conventions.

## [v0.9.0] — 2026-07-07 — EPIC-017: frames

Frames are THE grouping: drawn regions as ordinary nodes, recorded
single-parent membership, drag-end capture with geometry immunity,
arrange sort keys + normalize, the multi-drop ask. Also aboard
from EPIC-008's backup half: session snapshots, restore-to-copy,
remote push.

## [v0.8.0] — 2026-07-06 — EPIC-015: the library ecosystem

Cross-project sourcing, scope toggle, source panels, inbox mirror,
first-open seed; plus the EPIC-010 feel wave: rotate cursor,
resize snapping, panel sizing/big editor, card appearance, zoom
chase, grid crossfade.

## [v0.7.0] — 2026-07-06 — EPIC-013 global views + EPIC-014 gallery

The takeover framework, outline, tag panel and lens, search and
quick-open, settings with live theming; the virtualized gallery
with facets, text posts, bulk selection, and the interruptible
import strip. First release under the sequential-minor convention.

## [v0.6.0] — 2026-07-05 — EPIC-006: shell and local scope

The pin tool ships and the Create Pin dialog retires — the window
is the board: floating chrome on one fade clock, navigation with a
real back-stack and bookmarks, charms and cursor language.

## [v0.5.0] — 2026-07-05 — first tagged build

Release plumbing: explicit Linux executableName; the first
artifacts built by the release workflow. (Everything before this
shipped untagged during EPIC-001–005 foundations.)
