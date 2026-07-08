---
node_id: AI-IMP-197
tags:
  - IMP-LIST
  - Implementation
  - frames
  - feel
  - design-pass
kanban_status: planned
depends_on: []
parent_epic:
confidence_score: 0.6
date_created: 2026-07-08
---


# AI-IMP-197-frame-drop-feel-and-reflow

## Summary of Issue #1

Owner review FAIL on AI-IMP-127/129 frames (2026-07-08), three
connected findings: (1) **the drop target doesn't light up** —
dragging over a frame dims the whole screen but the receiving
frame is not brightened and the dragged items get no "will be
captured" indication; the drop works with no visual promise it
will. (2) **Partial-overlap sort is incoherent** — dropping a
spread multi-selection with the cursor inside the frame but only
one item overlapping captures that one item UNSORTED; when all
overlap, it sorts. One rule should decide membership+sorting, and
it should read from the cursor (the user's intent point), not from
per-item overlap accidents. (3) **Frame move/resize doesn't
reflow** — resizing a sort-on-drop frame leaves members where they
were (easy to end up "completely disconnected"); the owner expects
resize to re-arrange members into the new shape. Done means: the
hover frame BRIGHTENS (focus, not just others dimming) with a
capture affordance on the dragged ghost; one documented
cursor-based capture rule for multi-drops (all-or-none by cursor
intent, sorted per the frame's setting); and resize/move of a
sorted frame reflows its members — with the RFC §4.9 "geometry
never edits membership" invariant untouched (reflow repositions
members; it never adds/removes them).

### Out of Scope

- Sort-MODE facts (grid/rows — 138's flagged follow-on).
- The charm bar overlaying members (older known edge, separate).
- New commands: reflow rides the existing arrange machinery.

### Design/Approach

RFC first: §4.9 frames + the AI-IMP-129 ticket define sort-on-drop
semantics — verify what was RATIFIED for partial overlap before
changing behavior; if the cursor-intent rule contradicts ratified
text, STOP and take it to the owner (likely it was simply never
specified). Visuals: the hover-dim machinery exists (127) — add
the inverse: the focused frame's wash brightens (token-only) and
the drag ghost gains a small capture affordance. Reflow: on
frame resize commit (and member-count-changing drops), if
sort-on-drop is ON, dispatch the existing arrange action scoped to
the frame (one undo group with the resize). Move-without-resize
does NOT reflow (members travel rigidly — that ships and is right).

### Files to Touch

`canvas/frame-arrange.ts`, `gestures-ui.ts`/host drop path,
hover-dim seam, e2e: brighten-on-hover assert, the
partial-overlap rule, resize→reflow round-trip (one undo).

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [ ] §4.9/129 ratified semantics checked; deviations flagged
      before building.
- [ ] Receiving frame brightens; dragged ghost carries the capture
      affordance.
- [ ] One cursor-based multi-drop rule, documented + e2e'd.
- [ ] Sorted-frame resize reflows members (one undo with the
      resize); rigid move unchanged; membership never edited by
      geometry.
- [ ] Gates: `pnpm -r build && pnpm -r test && pnpm lint` + hidden
      e2e.
- [ ] HUMAN-TESTING entry appended at merge by the lead.

### Acceptance Criteria

**GIVEN** a multi-selection dragged over a sort-on-drop frame
**THEN** the frame visibly brightens and the drop captures + sorts
per the one cursor rule
**AND** resizing that frame reflows its members in the same undo.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->
