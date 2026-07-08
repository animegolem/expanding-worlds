---
node_id: AI-IMP-196
tags:
  - IMP-LIST
  - Implementation
  - gallery
  - frames
  - bug
kanban_status: planned
depends_on: []
parent_epic:
confidence_score: 0.7
date_created: 2026-07-08
---


# AI-IMP-196-library-picker-instant-dismiss

## Summary of Issue #1

Owner review FAIL (2026-07-08, AI-IMP-129's untested-by-machine
path): "Add from library" on a selected frame opens the gallery
picker, but "nothing is actually selectable within the picker — it
immediately closes." Owner's read: the window/UI isn't focused at
that moment (macOS), so the first click (or the focus state itself)
dismisses the picker before a pick can land — step 1 is impassable.
This is the exact defect class of the audit's async-open/dismissal
family: a dismissal listener armed before the surface is
interactable, or a blur/engagement-fade path firing on open. Done
means the picker opens focused and interactable, a click selects a
work (never dismisses), and the pick lands captured+arranged in the
frame — with an e2e driving the FULL path (it had none; that's how
this shipped broken).

### Out of Scope

- Picker visual design (mechanics only).
- The general gallery click-away ticket (AI-IMP-188 — coordinate:
  its free-space deselect must not re-break this).

### Design/Approach

Reproduce first (the e2e IS the repro): selected frame → Add from
library → takeover opens → click a tile. Then find the dismisser:
suspects are a window-blur/focus guard, the engagement fade
(§8.2 disengage — the drop-ask queue fix had the same fade-eats-
pending shape), or an outside-pointerdown listener armed at open
(pre-render guard family, AI-IMP-184's patterns apply). Fix at the
cause, not with a timer. Ensure the takeover grabs focus on open
(the input-blocker/takeover machinery already exists — AI-IMP-183
wired notify()).

### Files to Touch

Whichever of `views/GalleryView.svelte` / takeover wiring /
`frame-load.ts` the trace convicts. New e2e: the full
add-from-library round-trip (frame → picker → pick → captured +
arranged).

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [ ] Root cause identified and documented (not timer-papered).
- [ ] Picker opens focused; first click selects; pick lands
      captured+arranged.
- [ ] Full-path e2e (the missing one).
- [ ] Gates: `pnpm -r build && pnpm -r test && pnpm lint` + hidden
      e2e.
- [ ] HUMAN-TESTING entry appended at merge by the lead.

### Acceptance Criteria

**GIVEN** a selected frame's "Add from library"
**WHEN** the picker opens and the user clicks a work
**THEN** the work lands in the frame captured and arranged — the
picker never self-dismisses before a pick.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->
