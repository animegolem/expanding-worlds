---
node_id: AI-EPIC-006
tags:
  - EPIC
  - AI
  - shell
  - navigation
  - notes
date_created: 2026-07-03
date_completed:
kanban_status: backlog
AI_IMP_spawned:
---

# AI-EPIC-006-shell-and-local-scope

> Rewritten 2026-07-05 for RFC rev 0.17: the July 2026 design cycle
> replaced the tabbed-workspace plan this epic was originally cut
> against. Global takeover views moved to AI-EPIC-013.

## Problem Statement/Feature Scope

RFC §8.2's shell model — the window is the board, floating chrome,
panels anchored to what summoned them — exists only on paper. The
running app still has a docked note pane (EPIC-005), drawn selection
handles, a persistent status strip, no charms, no navigation chrome,
and no way to move between boards without losing your place. This
epic builds the shell's local scope: everything that floats over the
canvas, and the navigation chrome that makes multi-board work
first-class.

## Proposed Solution(s)

Per RFC §8.1–8.6 and §6.9 (rev 0.17):

- **Chrome frame**: mode charm rail (project · ⌕ · ⊛ · ▤ · ☰),
  bottom dock (tools · zoom cluster; z-order joins on selection),
  hover-revealed title strip, engagement cadence on one shared fade
  clock, and the tooltip rule (every control names itself and prints
  its shortcut).
- **Navigation chrome**: the path as rendered back-stack with
  viewport-restoring crumbs, ⌂ Home, gesture-first Back/Forward with
  hover ‹ ›, and the bookmark menu whose drag order IS the Mod+1–n
  binding, with §8.1 stale-target degradation in the menu.
- **Node charms and click grammar**: page/frame hint charms with
  scrim chips and screen-size visibility; single-click select +
  charm bar (crop, flips, make-canvas, note, tags, lock);
  charm-click opens exactly that facet; double-click opens
  everything.
- **Cursor-zone selection**: thin accent outline only, hot zones for
  move/resize/rotate, Option-drag duplicate, lock refusal cursor;
  drawn handles removed.
- **Note panels**: the EPIC-005 editor rehosted in tethered panels
  (one at a time) with pin-to-screen (accumulating), the escalating
  indicator rule (tail → halo → edge chip → origin label), the
  canvas-note corner charm, the in-panel Uses list behind the places
  header, and the link-anchored location chooser.
- **Toasts and the ⚠ perch**: transitions toast; ongoing conditions
  wear a rail charm that exists only while they hold. The status
  strip retires in the same ticket that ships the perch, not before.

The CM6 editor controller, autosave gestures, flush seams, link
plugin, and conflict dialogs port unchanged; only their container
changes.

## Path(s) Not Taken

Global takeover views (tree, tag panel, search/quick-open, settings,
themes) are AI-EPIC-013; the graph takeover is a later epic. The
switcher HUD, New Window side-by-side, multi-tag queries, and
note-attached tags are RFC questions 22–25. The Create Pin dialog
stays until a standalone dot/icon creation surface exists (Q20).
Final feel numbers (fade delay, zone widths) ship as provisional
constants, tuned later.

## Success Metrics

- RFC §17 slice items 12 (path, Back/Forward/Home, bookmark) and 16
  (zero/one/many with the anchored chooser) pass end to end.
- The full EPIC-005 note e2e suite passes against the panel host
  with no editor-controller changes.
- A board at rest with the cursor outside the window shows zero
  chrome; engagement restores it on one clock.

## Requirements

### Functional Requirements

- [ ] FR-1: Mode charm rail, bottom dock with shape flyout and selection-conditional z-order, hover title strip per §8.2.
- [ ] FR-2: Engagement cadence — one shared fade clock, charm-hover highlight, screen-size charm visibility per §8.2/§8.4.
- [ ] FR-3: Tooltip rule: name + shortcut chip on every control per §8.2.
- [ ] FR-4: Path as rendered back-stack with viewport-restoring crumbs, ⌂ Home, gestures + Mod+[/] with hover ‹ › per §8.1.
- [ ] FR-5: Bookmark menu — jump/reorder/remove/add, row order = Mod+1–n with printed shortcuts, stale-target grey-out per §8.1.
- [ ] FR-6: Page/frame hint charms with scrim chips, excluded from crop/flip previews and export, per §8.4.
- [ ] FR-7: Click grammar and charm bar per §8.4 table.
- [ ] FR-8: Cursor-zone selection replacing drawn handles; Option-drag duplicate; lock cursor per §6.9.
- [ ] FR-9: Tethered note panels (one at a time) with pin, escalating indicator, cross-board origin label as navigation event per §8.5.
- [ ] FR-10: Canvas-note corner charm with ghost/solid states per §8.5.
- [ ] FR-11: In-panel Uses list behind the places header; link-anchored location chooser; zero/one/many per §7.3–7.4.
- [ ] FR-12: Toast system plus the ⚠ ongoing-state perch; status strip retired in the perch ticket per §8.6.

### Non-Functional Requirements

- Chrome never causes canvas reflow; panels float (§8.2).
- Every cross-canvas jump enters §8.1 history.
- All e2e runs stay hidden-window; charm/panel interactions get
  stable testids.

## Implementation Breakdown

IMPs to be cut when this epic activates.
