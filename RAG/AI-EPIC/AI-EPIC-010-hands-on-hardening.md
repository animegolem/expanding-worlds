---
node_id: AI-EPIC-010
tags:
  - EPIC
  - AI
  - canvas
  - feel
  - polish
date_created: 2026-07-05
date_completed:
kanban_status: in-progress
AI_IMP_spawned:
  - AI-IMP-030
  - AI-IMP-031
---

# AI-EPIC-010-hands-on-hardening

## Problem Statement/Feature Scope

The owner is now using the board daily and comparing it directly
against PureRef; each session surfaces small fidelity gaps that are
individually too small for a feature epic but collectively decide
whether the app honors "feels first like an excellent visual board"
(RFC §1). EPIC-009 fixed the first wave; this rolling epic is the
home for subsequent hands-on findings, batched and approved in
conversation before implementation (owner's working agreement).
First batch: text decorations are completely inert once placed
(cannot select, move, or re-edit), and rotation has one real bug
plus a visible fidelity gap against PureRef.

## Proposed Solution(s)

Fix findings in owner-approved batches. Batch one: text decorations
become first-class interactive objects (click to select, drag to
move, the existing double-click re-edit path actually reachable) by
storing measured bounds at write time; rotation gets three fixes —
shapes spin in place instead of orbiting the pivot (bug: the gesture
rotates the stored top-left but never the shape's own rotation
field), single-selection chrome rotates WITH the object PureRef-style
(outline and handles on the oriented box, resize in the object's
local frame), and a corner-hover rotate affordance replaces reliance
on the lollipop handle alone.

## Path(s) Not Taken

No charm bar / click-and-double-click node semantics (owner explicitly
parked; RFC §19 open question 3 is the home when it ripens). No text
rotation (TextData has no rotation field; orbit-only under group
rotation is a recorded limitation). No new tools or panels.

## Success Metrics

- Text placed with the text tool can be selected, marquee-selected,
  moved, deleted, and double-click re-edited; covered by e2e.
- Rotating a shape spins it about its own center (single selection);
  covered by unit + e2e assertions on data.rotation.
- A rotated image's selection outline and handles track the oriented
  box (not the axis-aligned envelope) and resize works in the local
  frame; verified by the owner on hardware.
- All gates stay green: unit suites, desktop e2e, §12.1 perf suite,
  lint.

## Requirements

### Functional Requirements

- [ ] FR-1: Text decorations carry measured world bounds, refreshed
      on every create/edit; hit-testing falls back to a font-size
      estimate for legacy rows (AI-IMP-030).
- [ ] FR-2: Rotate gesture spins shapes about their own center and
      composes with multi-selection pivots; rotated shape bounds
      expand like rotated placements (AI-IMP-031).
- [ ] FR-3: Single-selection chrome (outline, resize handles, rotate
      handle) draws on the oriented box; resize of a rotated item
      scales in its local frame; multi-selection keeps the
      axis-aligned box (AI-IMP-031).
- [ ] FR-4: Corner-hover rotate affordance with a rotate cursor just
      outside each corner handle (AI-IMP-031).

### Non-Functional Requirements

- Renderer never touches persistence (RFC §11.1); all changes live
  in canvas-engine and the desktop renderer modules.
- Text FTS contract (string at data.text) unchanged.
- One durable command per completed gesture (invariant 25) unchanged.

## Implementation Breakdown

- AI-IMP-030 (lead): text interactivity via measured bounds.
- AI-IMP-031 (lead): rotation fidelity — shape spin bug, oriented
  chrome + local-frame resize, corner rotate affordance.
