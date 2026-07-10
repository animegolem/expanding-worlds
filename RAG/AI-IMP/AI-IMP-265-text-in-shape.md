---
node_id: AI-IMP-265
tags:
  - IMP-LIST
  - Implementation
  - canvas-engine
  - decorations
  - design-gated
kanban_status: planned
depends_on: []
parent_epic:
confidence_score: 0.6
date_created: 2026-07-10
date_completed:
---


# AI-IMP-265-text-in-shape

## Summary of Issue #1

The shape tool draws shapes and the text tool writes text, but a
shape cannot CARRY text — the owner's standing ask (RFC §6.1 rev
0.36 musing, re-raised 2026-07-10): "type into a shape and the
text scales to fit it — shape and label move as one." The design
letters already shaped the mechanism: text-in-shape is THE SAME
SHAPE RECORD wearing a text property ("the same shape record with
an object style; text-in-shape rides the face"), not a grouped
text+shape pair — so move/resize/rotate/undo/delete are one
record's story and nothing can shear apart. The RFC gates the
defaults on comparison homework (Miro, Photoshop, PureRef: shape
defaults, text-in-shape entry/exit gestures, styling memory) that
has never been done. Done means: the homework is recorded, the
owner has signed the adopted gestures, and typing into a shape
renders fitted text that travels with it through every verb.

### Out of Scope

- Text styling memory / named style presets (the same rev 0.36
  musing's OTHER half — separate ticket when prioritized).
- Text-on-connector/arrow labels.
- Note-body embedding or any node/note semantics — decorations
  stay decorations (RFC §4.6: decorative marks carry no meaning).
- New shape kinds.

### Design/Approach

Homework first, recorded IN this ticket: how Miro/Photoshop/
PureRef handle (a) entering text on a shape (double-click? type
while selected?), (b) text overflow vs shape bounds (scale to
fit, wrap, grow the shape?), (c) exit/commit gestures, (d) what
travels on copy/duplicate. Proposal to the owner BEFORE code
(DESIGN-QUEUE if it needs a session; a short note if the adopted
gestures are obvious). Expected build shape: the shape decoration
record grows an optional `text` field (validated in the command
handler, NEVER a SQLite CHECK — growing domain); the
canvas-engine shape renderer draws it centered, font-size solved
from the shape's inner box (the RFC's "scales to fit"); entry
via double-click on a shape → inline editor overlay; the edit is
one undoable decoration-property command. Label raster resolution
rides AI-IMP-262's zoom-bucket machinery so fitted text stays
crisp.

### Files to Touch

(Census at build time; expected:)
- `packages/canvas-engine/src/` shape decoration renderer + the
  262 resolution helper.
- Decoration command handler + codec (text field validation).
- `apps/desktop/src/renderer/canvas/` shape tool entry gesture +
  inline text editor overlay.
- e2e: decorations spec extension (type into shape, verbs travel).
- RFC §6.1: promote the musing to shaped-and-built; record the
  homework verdicts in §20.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [ ] Comparison homework (Miro/Photoshop/PureRef) recorded here;
      adopted/refused gestures listed with reasons.
- [ ] Owner sign-off on the adopted gestures (design gate).
- [ ] Shape record carries optional text; handler-validated;
      codec round-trips; no schema CHECK constraint.
- [ ] Renderer: fitted text centered in the shape's inner box,
      crisp per the 262 resolution buckets, moves/scales/rotates
      with the shape as one item.
- [ ] Entry/exit gestures per the signed design; edit is ONE
      undoable command; Escape discards.
- [ ] Unit + e2e regressions green; RFC updated (musing →
      decided, §20 entry, revision bump).
- [ ] HUMAN-TESTING entry (owner + alph: does typing into a
      shape feel like the art-tool reflex?).

### Acceptance Criteria

**GIVEN** a drawn shape on the board
**WHEN** the user enters text on it via the signed gesture
**THEN** the text renders fitted inside the shape and stays crisp
at board zooms
**AND** moving, resizing, rotating, duplicating, deleting, or
undoing treats shape and text as one item
**AND** a shape with no text behaves exactly as today.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->
