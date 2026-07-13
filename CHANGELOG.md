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

## [0.25.0] - 2026-07-13

### For testers (paper, plaques, and one lens)
- New: opening a bound note is a FLIGHT — the camera eases out until
  image and page fill your view; Escape flies back to exactly where
  you were, to the pixel. The page keeps the image's height at any
  window size.
- New: captions are little museum plaques now — a cream card in a
  slim frame, centered under its print, with a small pop when one is
  born. In the outline, a placement's row shows its caption text so
  you can tell two copies of the same image apart.
- Changed: the tag lens is ONE system — engage it from a node's tag
  chip, the tag panel, or a note page's chips and the board answers
  the same way everywhere: matches ringed, everything else dimmed,
  an ✕ chip to drop it. Escape drops the lens first, panels second.
  Flying to a place gives the landing a brief ring.
- Changed: the gallery's controls are the app's own everywhere; a
  name-sorted grid past ~24 items gets letter sections (unnamed
  things share a # section — never raw ids).
- Changed: Settings is the kit sheet — folding sections, this-world
  chips, honest rows only (placeholders that did nothing are gone),
  and a density setting (compact / comfortable) that resizes the
  whole chrome live.

### Under the hood (content wave, EPIC-029 phase D — the epic closes)
- AI-IMP-296 — reading flight via one flyCameraTo host seam;
  whisper/origin treatment; rebind where durable verbs exist;
  renderer pin/tape stays deliberately non-undoable.
- AI-IMP-297 — plaque in the engine label pipeline; pop on
  null→non-null SetPlacementCaption only; outline row meta via a
  caption column on the existing getOutlineTree child row.
- AI-IMP-298 — session tag-lens coordinator + three doors + active
  chip; transient arrival ring separate from lens state; wiki-hover
  door deferred by ruling.
- AI-IMP-299 — Segmented/FacetChip shared; NAME_GROUP_THRESHOLD 24;
  gallery index gains nullable noteTitle (read projection only);
  bare-variant consumer contract pinned.
- AI-IMP-300 — kit settings sheet; two-state density persisted
  app-tier; menuPlacement codec removed; every inert row retired.

### For testers (the chrome finds its places)
- Changed: the board's menu lives on its name now — click the ❖ on
  the board's crumb in the path bar. Right-click (or long-press)
  empty board gets a HERE menu: paste, text, pin, shape, frame — all
  landing exactly where you clicked — with "board…" underneath.
  The ☰ Export row works now (it takes you to Settings' live
  export).
- Changed: search is a centered palette on Ctrl/⌘K — the board stays
  visible behind it and is exactly as you left it when you close.
  Type fragments and they fuzzy-match names, boards, tags, and
  filenames ("chi lif" finds #chieftain #life-debt); Tab pins a
  suggestion into a pill when you want it, but plain typing keeps
  matching live. Image results drag straight onto the board.
- New: the ◎ button in the lower-left opens the world's own face —
  drop an image on its profile slot to give the world a cover, read
  its note, and fly to every place it lives.
- Changed: the right rail is now just ways of seeing — gallery,
  outline, graph (coming), search — with the warning perch at its
  foot. ☰ sits alone in the top-right and stays reachable even
  inside takeovers. Switching worlds and opening a folder as a
  source both go through proper system pickers now.

### Under the hood (nav wave, EPIC-029 phase C)
- AI-IMP-292 — one board/ground menu inventory; ❖ on the crumb; HERE
  section; strip reveal pure; native color input retired.
- AI-IMP-294 — SearchPalette + fzf-match module; Mod+K; renderer
  transport type fixed at source; node-only drag-out; bare TextInput
  variant.
- AI-IMP-295 — IdentityCorner + fail-stop profile helper; §7.4
  canvas-owner deferral (RFC rev 0.72).
- AI-IMP-293 — four-rung rail; perch at foot; ☰ persistent across
  takeovers; main-validated one-use capabilities for switch/source
  doors; rail hit-testing opt-in.

## [0.24.1] - 2026-07-13

### For testers (the dock grows up)
- Changed: the dock is now just tools. Arm a tool and ONE row appears
  above it with that tool's defaults — font, size, ink for text;
  stroke, weight, fill for shapes — all app-drawn controls (the OS
  color dialog and system dropdowns are gone from the dock). Ink rows
  remember your recent colors, and an eyedropper can sample any color
  on the board.
- New: the shape tool is one slot — quick-click draws your last shape,
  hold ~300ms (or re-press) for a small flyout: rectangle, ellipse,
  triangle, diamond (new), and arrow.
- Changed: the long strip of word-buttons is gone. Select two or more
  things and the selection's own toolbar grows a ⌗ button — align,
  spread, pack, and equalize live in a grouped panel there. Restyle a
  drawn shape or text via the ◧ button on its toolbar; one ⌘Z undoes
  a whole restyle. Reorder, group, lock, and hide live in the
  right-click menu, and anything that can't apply to a mixed
  selection says why instead of graying out silently.
- Fixed: "align centers" was never collapsing your spread — the labels
  were just ambiguous about which axis they meant. They aren't now.

### Under the hood (dock wave, EPIC-029 phase B)
- AI-IMP-289 — dock rebuild: kit controls, session-local tool
  defaults, 3/6/9 recents, eyedropper (inert-with-why sans API).
- AI-IMP-290 — remembered five-shape hold flyout; diamond as an
  engine JSON variant (no schema); 190's comparison table authored.
- AI-IMP-291 — ⌗/◧ charm panels, union-bounds selection furniture,
  all-or-inert eligibility with reasons, one-group fail-stop restyle;
  25+3 dock rows retired; align-center exonerated with a named
  regression; native-control guard down to one tuple.

### For testers (the chrome learns its edges)
- Changed: floating menus, tooltips, and pop-up panels now respect a
  shared frame — nothing opens under the title strip, the right rail,
  or the dock anymore, and pop-ups near a selected image keep clear of
  its buttons instead of grazing them. You shouldn't notice anything —
  that's the point; if a menu ever covers chrome, that's now a bug.

### Under the hood (frame wave, EPIC-029 phase A)
- AI-IMP-286 — reservation-frame band tokens + frame provider; all
  anchored surfaces and takeovers clamp inside frame + gutter; density
  switch scaffolding; release-present dev inspector; literal-band guard.
- AI-IMP-287 — measured bottom-only selection halo; avoid-rect
  placement (frame-first on degeneracy) on the four raw-node paths.
- AI-IMP-288 — kit input primitives (ColorPicker, SwatchRow,
  PickerList, Stepper) with pure state modules; exact 12-tuple
  no-native-inputs guard (natives retire in phases B–C).

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

### For testers (undo that matches your hand)
- Changed: bulk gestures — dropping a stack of images, deleting a
  multi-selection — now undo as ONE ⌘Z step instead of many. Sending a
  single item to Trash stays out of undo (Trash itself is the recovery
  home); restoring from Trash is undoable like any other move.

### For testers (the app finds its voice)
- New: when a view has nothing to show, it now says why — loading,
  empty, and trouble each get their own calm sentence in the gallery,
  Trash, search, and outline, with a "try again" where it helps. No
  spinners, no programmer-speak.
- New: every floating card, ask, and chip can be dismissed the way you
  expect — Esc, clicking away, or its ✕. The welcome guide's Esc counts
  as Skip. An unanswered drop-ask just dissolves; it may ask again on a
  later drop, and it says so on the card.
- Changed: the pin tool completes its arc — the ghost pin rides your
  cursor at true size, seats with a soft settle, Esc (or re-clicking
  the tool) returns you to select, and a failed pin keeps your draft
  instead of eating it.

### For testers (the world holds its shape)
- Fixed (your report family): removing a tag from an image now exists —
  hover any tag chip on a note's meta strip or in the tag panel and
  click its ✕. And it STAYS removed: closing and reopening the project
  no longer brings back a tag you took off, even when the library still
  carries it. Re-adding it by hand tells sync it's welcome again.
- New: a broken link whose note sits in Trash now offers "Restore it
  and relink" — one click, and one ⌘Z takes it all back. Phantom notes
  keep your half-written draft if you close the panel; Escape discards
  it and says so first.
- New: making a board is one gesture now — name it, carry the ⊡ to
  where it belongs, click to seat it, and you're standing inside via
  the same dive both doors share. Escape mid-carry leaves no trace.
  ⌘Z right after a birth flies you home first, then unmakes it.

### Under the hood
- AI-IMP-285: migration 0011 `tag_unassign_suppression` (STRICT,
  node-scoped); unassign writes / assign lifts in the dispatcher
  transaction; planner excludes exact triples; UnassignTagFromNode
  exempt→captured (the one sanctioned policy flip).
- AI-IMP-284: RestoreRecord→RelinkBrokenLinks as one token group;
  233's compound inverse preserved with evidence; session-scoped
  phantom drafts; bound-token open failure speaks class 5.
- AI-IMP-283: delay-all birth carry through a place-mode variant
  (nothing durable until seat); guarded rollback on refused seats;
  typed birth metadata drives the sole §10.2 navigating undo;
  make-canvas shares the door-1 dive, inert with a why-tooltip.
- AI-IMP-231: renderer-local undo group tokens; group order reserves at
  gesture start; ⌘Z on a still-open group declines by name.
- AI-IMP-221: undo policy classes split solo-exempt vs bulk-captured
  trash; RestoreRecord captured; purge clears redo and stays exempt.
- AI-IMP-264: lock holder reads are discriminated dispositions; never
  unlink after observing absence (the CI-caught split-brain fix);
  guard removal is evidence-based and loud on exhaustion.
- AI-IMP-244: lock-probe workers await stream close, not process exit —
  the child-output lifecycle race is shut.
- AI-IMP-280: transient chrome gains complete exits (Escape ladder
  rungs, scrim clicks, chip ✕/outside-dismiss, ask dissolution).
- AI-IMP-281: nine silent outcomes gain their ratified voices; losable
  quit-timeout fact voiced from the next-open perch; shared
  failure→perch producer.
- AI-IMP-279: finding surfaces get exclusive loading/error/empty states
  through one presentational FindingState; transport text never
  reaches the user.
- AI-IMP-282: kit-canonical pin ghost, atomic provisional pair, generic
  tool-leave seam in canvas-engine, sticky-exit tooltips, failed
  CreatePin retains draft.
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
