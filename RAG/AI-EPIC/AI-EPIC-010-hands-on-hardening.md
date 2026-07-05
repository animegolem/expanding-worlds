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
  - AI-IMP-032
  - AI-IMP-033
  - AI-IMP-034
  - AI-IMP-035
  - AI-IMP-036
  - AI-IMP-037
  - AI-IMP-038
  - AI-IMP-039
  - AI-IMP-040
  - AI-IMP-041
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

- [x] FR-1: Text decorations carry measured world bounds, refreshed
      on every create/edit; hit-testing falls back to a font-size
      estimate for legacy rows (AI-IMP-030).
- [x] FR-2: Rotate gesture spins shapes about their own center and
      composes with multi-selection pivots; rotated shape bounds
      expand like rotated placements (AI-IMP-031).
- [x] FR-3: Single-selection chrome (outline, resize handles, rotate
      handle) draws on the oriented box; resize of a rotated item
      scales in its local frame; multi-selection keeps the
      axis-aligned box (AI-IMP-031).
- [x] FR-4: Corner-hover rotate affordance with a rotate cursor just
      outside each corner handle (AI-IMP-031).

- [x] FR-5: Adaptive multi-scale grid on backgroundless canvases —
      display only, hidden when a background stage exists
      (AI-IMP-032).
- [x] FR-6: Background-as-stage per RFC §6.7 rev 0.11 — void beyond
      the extent, fit/home target, normalize-on-set with the
      from-selection exception, replace preserves the extent, eased
      camera framing (AI-IMP-032).

- [x] FR-7: Rotation snaps by orientation — cardinal magnetism,
      absolute 15° Shift steps, Alt bypass (AI-IMP-033).
- [x] FR-8: Sub-threshold background images raise a non-blocking
      softness notice (AI-IMP-033).
- [x] FR-9: Text scales via resize handles and carries whole-object
      styling (size/family/bold/italic/color); rich spans deferred
      (AI-IMP-034).
- [x] FR-10: Shift-canonical drawing (squares/circles/equilateral,
      45° segments); arrow thickness clamps to length and scales
      with resize (AI-IMP-035).

- [x] FR-11: Dev mode serves workspace packages live (no stale
      prebundle) and clears stale port listeners (AI-IMP-036).
- [x] FR-12: The type row enumerates installed system fonts with
      graceful stack fallbacks (AI-IMP-037).
- [x] FR-13: Two arrow constructs per RFC rev 0.13 — pen-model
      annotation arrow, box-model arrow shape (AI-IMP-038).

- [x] FR-14: Every stroke is born legible at the creating viewport;
      the toolbar width control is a weight multiplier on the
      screen-pixel baseline (AI-IMP-039, RFC rev 0.14).

- [x] FR-15: Strokes never render below 1 device pixel (render-only
      clamp); draw previews show the final result including fill and
      arrow silhouettes (AI-IMP-040).

- [x] FR-16: Shift on corner resize locks aspect for any selection;
      Shift wins over Alt (AI-IMP-041).

### Non-Functional Requirements

- Renderer never touches persistence (RFC §11.1); all changes live
  in canvas-engine and the desktop renderer modules.
- Text FTS contract (string at data.text) unchanged.
- One durable command per completed gesture (invariant 25) unchanged.

## Implementation Breakdown

- AI-IMP-030 (lead): text interactivity via measured bounds.
- AI-IMP-031 (lead): rotation fidelity — shape spin bug, oriented
  chrome + local-frame resize, corner rotate affordance.
- AI-IMP-032 (lead): adaptive grid + background-as-stage (RFC rev
  0.11) — void, extent framing, normalize-on-set, eased camera.
- AI-IMP-033 (lead): orientation snapping + small-background notice.
- AI-IMP-034 (lead): text sizing and whole-object styling.
- AI-IMP-035 (lead): shift-canonical drawing + arrow proportions.
- AI-IMP-036 (lead): dev-mode hardening (vite prebundle exclusion,
  port preflight).
- AI-IMP-037 (lead): system-font picker via Local Font Access.
- AI-IMP-038 (lead): two arrows — annotation pen vs shape variant
  (RFC rev 0.13).
- AI-IMP-039 (lead): legible-at-creation stroke weight; width
  control becomes a multiplier (RFC rev 0.14).
- AI-IMP-040 (lead): render fidelity — minimum stroke render width,
  WYSIWYG draw previews.
- AI-IMP-041 (lead): Shift aspect lock on resize handles.
