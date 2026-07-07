---
node_id: AI-EPIC-017
tags:
  - EPIC
  - AI
  - canvas
  - frames
date_created: 2026-07-06
date_completed:
kanban_status: in-progress
AI_IMP_spawned:
  - "[[AI-IMP-126-frame-model-and-membership]]"
  - "[[AI-IMP-127-frame-renderer-and-interactions]]"
  - "[[AI-IMP-128-arrange-and-normalize]]"
  - "[[AI-IMP-129-drop-behavior-and-frame-sort]]"
---

# AI-EPIC-017-frames

> Stub cut 2026-07-06 from the artist design session (RFC rev 0.38,
> §4.9 — the "deferred pending artist feedback" sentence activated).
> Arrange/normalize and the drop-behavior modal RIDE THIS EPIC (lead
> decision: they compose — "group and sort" needs frames).

## Problem Statement/Feature Scope

Groups are select-and-move aids; the artist's real workflow
(clustering by purpose, moodboard density, overview boards like the
production-design/story/characters/world mockup) wants an
addressable container: the FRAME — a drawn region that is an
ordinary node (note, tags, optional canvas, reusable across
canvases) with recorded membership edited by clean drag in and out.
Alongside it, the import-arrangement gap: a hundred-image drop
lands as an untiled heap, and PureRef-style arrange/normalize plus
the on-drop behavior setting (ask / sort / group / group-and-sort,
remember-choice modal) turn that into one decision.

## Proposed Solution(s)

Per RFC §4.9 rev 0.38 (self-contained there; read it first): frame
node with drawn-region presence; recorded membership (drag in/out,
frame move carries members, data views group by frame); acceptance
visualization (hovered frame focuses, canvas dims); per-frame
sort-on-drop defaulting on; auto-sort and load-from-library-into-
frame actions; arrange sort keys + normalize verbs; big-paste
images-or-frame ask; save-composite-from-frame (never into the
library as a composite). Groups grow up into frames — whether the
§4.9 group machinery is subsumed or kept beside decides at the
design turn.

## Path(s) Not Taken

No relational overlay, no parent-child image hierarchies, no
library composites. PureRef's menu specs are reference material
(captured in AI-EPIC-016's notes) — adopted selectively.

## Success Metrics

To be firmed at activation; candidates: the artist's Pinterest-
board drop lands sorted in one modal decision; his four-cluster
mockup reproduces in-app in under a minute; frame members appear
grouped in the outline.

## Requirements

### Functional Requirements

Activated 2026-07-06 at rev 0.54 (frames are THE grouping;
single-parent nesting; geometry immunity both directions — §4.9).

- [ ] FR-1: Frame model — 'frame' appearance kind, recorded
      membership (migration 0007), capture/release commands with
      exact inverses, cycle rejection, frame-tree query, §9.6
      aggregate lifecycle. (AI-IMP-126)
- [ ] FR-2: Board presence — frame tool, drawn-region rendering,
      drag-end capture to innermost frame, hover focus + canvas
      dim, frame move carries members (one undo), resize edits
      membership never. (AI-IMP-127)
- [ ] FR-3: Vocabulary — §6.9 arrange gains sort keys; normalize
      equalizes height/width/size/area on any selection; one undo
      entry per invocation. (AI-IMP-128)
- [ ] FR-4: The drop moment — multi-drop ask/sort/group/
      group-and-sort modal with remember-choice (§14.4 idiom),
      per-frame sort-on-drop default ON, auto-sort-in-frame,
      load-from-library-into-frame; composites never enter the
      library. (AI-IMP-129)
- Save-composite-from-frame rides EPIC-008's export machinery and
  is cut when that activates (recorded, not an FR here).

### Non-Functional Requirements

- §12.1 perf targets hold with frames on the board (frames render
  in the normal content plane).
- Frame chrome is placeholder-on-theme-tokens; the visual pass is
  Design-letter-3 item 14.

## Implementation Breakdown

126 (model, interface-defining) → 127 (renderer) and, in parallel
with either, 128 (arrange/normalize, independent) → 129 (drop
behavior, needs all three). Migration 0007 is reserved to 126.
