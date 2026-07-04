---
node_id: AI-EPIC-006
tags:
  - EPIC
  - AI
  - navigation
  - workspace
date_created: 2026-07-03
date_completed:
kanban_status: backlog
AI_IMP_spawned:
---

# AI-EPIC-006-navigation-discovery

## Problem Statement/Feature Scope

RFC §8 and §14 define how users move through and find things in a
project — tabs, history, bookmarks, quick-open, search, the node
library, tag views, and spatial link resolution — none of which exists
once canvases (EPIC-004) and notes (EPIC-005) do.

## Proposed Solution(s)

Build the workspace composition of §8.2 (persistent note pane, tabbed
main workspace hosting canvas / library / search / tag / graph
projections) and per-tab navigation per §8.1: Back/Forward history,
Home, viewport restoration, bookmarks with In-Trash/broken degradation
per §8.1. Add §8.3 quick-open (notes + canvas-owning nodes) and
full-text search over the EPIC-003 FTS indexes with kind-appropriate
result navigation. Deliver discovery surfaces: the §14.1 node library
with Unplaced filter and drag-to-canvas placement per §6.10, tag
result views per §4.8, the Uses sidebar and location chooser per §7.4,
zero/one/many spatial resolution per §7.3, and highlighted-placement
mode per §7.5. A minimal §14.2 graph view ships as stretch.

## Path(s) Not Taken

Final visual design of chooser, phantom view, and tab docking stays
open per RFC open questions 1–6; this epic ships functional layouts,
not polished ones. Multi-facet library sorting deferred (open
question 15). Graph view remains a MAY.

## Success Metrics

- RFC §17 slice items 1, 9 (library drag), 12, 15-chooser behaviors,
  21, 24 pass end to end.
- Wiki-link activation always updates the note pane immediately;
  zero/one/many spatial behaviors match the §7.3 table.
- Quick-open and search return correct targets across all four
  indexed corpora.

## Requirements

### Functional Requirements

- [ ] FR-1: Tabbed workspace hosting canvas, library, search, and tag projections per §8.2.
- [ ] FR-2: Per-tab Back/Forward/Home with viewport and origin restoration per §8.1.
- [ ] FR-3: Bookmarks with stale-target degradation per §8.1.
- [ ] FR-4: Quick-open over notes and canvas-owning nodes per §8.3.
- [ ] FR-5: Search tab with kind-grouped results and navigation per §8.3.
- [ ] FR-6: Node library with Unplaced filter, drag and Place on Current Canvas per §14.1/§6.10.
- [ ] FR-7: Tag result views with Unplaced group per §4.8/§7.4.
- [ ] FR-8: Uses sidebar, location chooser, highlight mode per §7.4–7.5.
- [ ] FR-9: Zero/one/many spatial link resolution per §7.3.

### Non-Functional Requirements

- Every workspace record scoped to one project ID (§8.2).
- Return navigation to a recently visited canvas feels instant
  (§12.1 target).

## Implementation Breakdown

IMPs to be cut when this epic activates.
