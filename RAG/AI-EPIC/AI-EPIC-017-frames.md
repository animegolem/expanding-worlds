---
node_id: AI-EPIC-017
tags:
  - EPIC
  - AI
  - canvas
  - frames
date_created: 2026-07-06
date_completed:
kanban_status: backlog
AI_IMP_spawned:
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

- [ ] To be cut at activation from the rev 0.38 shape.

### Non-Functional Requirements

- §12.1 perf targets hold with frames on the board (frames render
  in the normal content plane).

## Implementation Breakdown

IMPs to be cut when this epic activates.
