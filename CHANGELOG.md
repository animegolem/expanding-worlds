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

### Under the hood
- EPIC-027 opened: the two 2026-07-10 audits (control-flow
  correctness + helper consolidation) tracked as one
  hardening-and-consolidation epic; wave 1 tickets cut
  (AI-IMP-250–254).

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
