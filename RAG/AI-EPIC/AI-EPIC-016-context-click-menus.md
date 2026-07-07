---
node_id: AI-EPIC-016
tags:
  - EPIC
  - AI
  - chrome
  - polish
date_created: 2026-07-06
date_completed:
kanban_status: in-progress
AI_IMP_spawned:
  - "[[AI-IMP-136-context-menu-core]]"
  - "[[AI-IMP-137-menus-second-wave-and-about]]"
---

# AI-EPIC-016-context-click-menus

> Stub cut 2026-07-06 at the owner's request (relayed mid-EPIC-015
> with screenshots the lead has not yet seen — the design discussion
> is PENDING and this stub holds the slot). Owner's framing: review
> context-click menus GLOBALLY, and land it before the end-UI
> tie-down / CSS-polish pass.

## Problem Statement/Feature Scope

Right-click surfaces have accreted per-feature rather than by
design: the node menu, board tooling, and new surfaces (gallery
cells, source-panel cells, note panels, cards) each decide
independently what a context click offers — or offer nothing. The
owner wants one global pass: a consistent context-menu grammar
(what every kind of thing offers on right-click, in what order,
with what separators and phrasing), covering the board, panels,
gallery, outline, and chrome, plus the recently agreed operations
that naturally live there (replace file, rev 0.35; open-as-source;
place-on-board). To be scoped properly in a design conversation
over the owner's screenshots before any IMPs are cut.

## Proposed Solution(s)

To be filled at the design turn. Expected shape: an inventory of
every right-clickable kind → a shared menu grammar and component →
per-surface adoption tickets. Sequencing constraint from the owner:
this epic lands BEFORE the end-UI tie-down/CSS-polish pass.

**Reference material (2026-07-06 design session — capture, not
commitment; adopt selectively):** PureRef's right-click depth is
the bar the artist knows. Its menu: Undo/Redo · Copy/Paste ·
Note · Draw · Mode/Window/Canvas submenus · **Images →** Select
all · Selection · **Arrange** (Optimal Ctrl+P · By name · By
path · By order · By addition · Randomly) · **Align** ·
**Normalize** (From-first/Average × Height · Width · Size · Area ·
Scale, each with accelerators) · Manage images · Replace image ·
Relink missing. Notables for our grammar: every verb carries its
accelerator inline (self-teaching, like our bookmark menu), and
selection-scoped verbs live under one submenu rather than
top-level sprawl. Frame verbs (auto-sort-in-frame,
load-from-library, save composite — AI-EPIC-017) and replace-file
(rev 0.35) are natural context-menu citizens.

**Opening infrastructure: the §8.8 occlusion contract (rev 0.41,
audited 2026-07-06).** This epic's first IMP builds the ladder the
menus need. Audit condensate:
- NO z-scale exists; the only writeup is a stale TakeoverLayer
  comment. Outer tier: canvas 0 · charms 6 · pin dot 7 · panels 8
  · takeover/tag/search 9 · chrome/text-entry/strip 10 · source
  panel 11 · rename input 25 · node menu 30 · attach picker 35 ·
  tooltip 1000 (body-mounted, the only true global).
- TRAPPED tiers: everything inside ChromeLayer (toasts 20, mirror
  ask 21, chips 21, perch 30) ranks at outer 10; everything inside
  the panels layer (big editor 40/41, conflict dialog 40) ranks at
  outer 8 — the two "modals" are covered by chrome (AI-IMP-101
  frees them ahead of this epic).
- Clamping: content panels (tag/search/location/note/mirror/chip)
  clamp; canvas affordances (charm bar, per-item charms, node
  menu, label-rename) do NOT; flip-side logic exists only in the
  tooltip.
- Unguarded pairs (the mechanical checklist): charm bar vs dock;
  charm bar/tag chips/rename off-viewport; node menu off-edge;
  item charms vs rail; toasts vs source panel; toasts vs import
  strip (opposite corners, no arbitration); condition panel growth
  vs toasts; mirror ask vs recognition chip (same anchor, mutually
  blind); path bar vs origin label (hard-coded offsets).

## Path(s) Not Taken

To be determined at scoping.

## Success Metrics

To be determined at scoping (candidate: every content kind answers
right-click with the shared grammar; no surface ships a bespoke
menu).

## Requirements

### Functional Requirements

Activated 2026-07-07 at rev 0.55 — the grammar and per-kind verb
inventories are ratified (§8.4; Menus Document is the design
source). The §8.8 occlusion audit above predates AI-IMP-101/143;
the z-ladder is now AI-IMP-143's scope, not this epic's first IMP.

- [x] FR-1: The context-menu surface + item and board inventories
      per the ratified grammar; keyboard model; registry-printed
      shortcuts. (AI-IMP-136)
- [x] FR-2: Decoration, multi-select, and frame inventories;
      Help/About final copy; trash archive-tone pass. (AI-IMP-137)

### Non-Functional Requirements

- Menus obey the theme system and the §8 chrome legibility rules.

## Implementation Breakdown

136 (surface + grammar module, interface-defining) → 137 (the
remaining inventories + chrome tone riders).
