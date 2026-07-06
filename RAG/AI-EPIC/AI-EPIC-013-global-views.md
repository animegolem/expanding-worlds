---
node_id: AI-EPIC-013
tags:
  - EPIC
  - AI
  - discovery
  - settings
  - theming
date_created: 2026-07-05
date_completed:
kanban_status: in-progress
AI_IMP_spawned:
  - AI-IMP-068
  - AI-IMP-069
  - AI-IMP-070
  - AI-IMP-071
  - AI-IMP-072
  - AI-IMP-073
  - AI-IMP-074
  - AI-IMP-075
---

# AI-EPIC-013-global-views

## Problem Statement/Feature Scope

The shell's second physics — project-global views that take over the
window (RFC §8.2) — has no implementation, and neither do the
discovery surfaces that make the app's "act against the database"
mode real: the outline that realizes the node-library MUST (§14.1), the
tag panel and lens (§4.8), search and quick-open in the ⌕ charm
(§8.3), and the settings takeover with theming (§11.5). Without
them, unplaced material is invisible and tags have no surface at
all.

## Proposed Solution(s)

Per RFC rev 0.17, build the takeover framework once (enter from a
rail charm, Esc or the charm returns, canvas camera untouched), then
the views on it:

- **Outline (▤)**: the world as an outline with charm glyphs, cycle-safe alias
  rows, root-level loose bin, inline tag chips, and the shared
  filter chips (hide content-less · disconnected per §14.1's
  orphan/loose vocabulary · one tag). Realizes the node-library
  requirement including the Unplaced filter and §6.10 placement
  sources (drag to canvas, Place on Current Canvas).
- **Tag panel and lens (§4.8)**: name-completing field, project-wide
  rows in the shared row grammar, per-row open-note and fly-to
  actions, and the lens as a pan/zoom-surviving dim-to-hits view
  state sharing §7.5's highlight implementation. Three doors: charm
  bar chips, ⌕ tag mode, note-panel chips.
- **Search and quick-open (⌕)**: FTS over the four corpora with
  kind-grouped results and kind-appropriate navigation; quick-open
  by title over notes and canvas-owning nodes; leading # switches
  to tag mode.
- **Settings takeover (§11.5)**: translucent inset live-applying
  sheet, commit-on-click, the sixteen-decision inventory; theme
  tokens as CSS custom properties; dark/light themes shipping,
  glass Mac-only with dark fallback.

## Path(s) Not Taken

The graph takeover (⊛, §14.2) is deliberately its own later epic —
it is a second renderer (force layout, image-node LOD) and should
not gate discovery. Multi-tag queries, note-attached tags, and the
switcher HUD stay in RFC questions 22–24. No flat node-list view
ships beside the outline. No theme engine is built.

## Success Metrics

- RFC §17 slice items 8 (tag panel), 9 (library drag + note
  placement), 21 (Unplaced recovery), and 24 (outline takeover
  exclusions) pass end to end.
- Quick-open and search return correct targets across all four
  indexed corpora (§8.3).
- Theme switching repaints the live board behind the settings sheet
  with no restart.

## Requirements

### Functional Requirements

- [ ] FR-1: Takeover framework — rail-charm entry, Esc/charm return, camera untouched per §8.2.
- [ ] FR-2: Outline view with alias-row cycle handling, loose bin, filter chips per §14.1.
- [ ] FR-3: Outline realizes library placement flows: drag-to-canvas and Place on Current Canvas per §6.10.
- [ ] FR-4: Tag panel with completion, shared row grammar, cross-canvas fly-to as history events per §4.8 (tags are flat, rev 0.20).
- [ ] FR-5: Lens view state sharing the §7.5 highlight implementation per §4.8.
- [ ] FR-6: Three tag doors landing on one panel per §4.8.
- [ ] FR-7: ⌕ search with kind-grouped results and navigation per §8.3.
- [ ] FR-8: Quick-open over notes and canvas-owning nodes, excluding phantoms, per §8.3.
- [ ] FR-9: Settings takeover with live apply and the §11.5 inventory.
- [ ] FR-10: Theme tokens as CSS custom properties; dark/light; glass Mac-only fallback per §11.5.

### Non-Functional Requirements

- Takeovers scope to one project ID like every view (§8.2).
- Outline and tag queries stay read-model projections; no new domain
  records (§14.1).
- Disconnection filters use the §14.1 orphan/loose vocabulary
  consistently across outline, tag panel, and the future graph.

## Implementation Breakdown

Cut 2026-07-05: AI-IMP-068 takeover framework (FR-1) →
AI-IMP-069 outline view (FR-2) → AI-IMP-070 outline placement
flows (FR-3) · AI-IMP-071 tag panel (FR-4, FR-6) · AI-IMP-072 lens
(FR-5) · AI-IMP-073 search and quick-open (FR-7, FR-8) ·
AI-IMP-074 settings takeover (FR-9, depends on 075) · AI-IMP-075
theme tokens (FR-10). 072 and 075 are framework-independent and
fan out first; 070/071/073 parallelize after 069.
