---
node_id: AI-EPIC-016
tags:
  - EPIC
  - AI
  - chrome
  - polish
date_created: 2026-07-06
date_completed:
kanban_status: backlog
AI_IMP_spawned:
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

## Path(s) Not Taken

To be determined at scoping.

## Success Metrics

To be determined at scoping (candidate: every content kind answers
right-click with the shared grammar; no surface ships a bespoke
menu).

## Requirements

### Functional Requirements

- [ ] To be cut after the design discussion.

### Non-Functional Requirements

- Menus obey the theme system and the §8 chrome legibility rules.

## Implementation Breakdown

IMPs to be cut when this epic activates.
