---
node_id: AI-IMP-201
tags:
  - IMP-LIST
  - Implementation
  - notes
  - panels
  - canvas
kanban_status: planned
depends_on: []
parent_epic:
confidence_score: 0.7
date_created: 2026-07-08
---


# AI-IMP-201-wheel-over-panel-passthrough

## Summary of Issue #1

Owner review FAIL (2026-07-08): "notes block canvas scroll if the
cursor is over them" — a wheel/trackpad gesture over any note
panel is swallowed even when the note has nothing to scroll,
dead-zoning the board under every open panel. Done means one
documented wheel rule over panels: a scrollable, overflowing note
consumes plain wheel for its own scroll; a non-overflowing panel
passes wheel through to the canvas (pan); and ZOOM gestures
(pinch, Cmd+wheel) ALWAYS reach the canvas regardless of hover —
zoom is a camera verb, never a text verb.

### Out of Scope

- Editor-internal scroll behavior while focused/typing (focused
  editing may legitimately own the wheel — define the boundary in
  the ticket's rule table, don't change typing feel).
- Panel sizing (200).

### Design/Approach

Find where the panel swallows wheel (likely the panel container's
wheel handler or plain DOM default). Rule implementation: wheel
handler checks overflow (scrollHeight > clientHeight) and modifier
state — Cmd+wheel/pinch (ctrlKey wheel) forwarded to the host's
zoom path unconditionally; plain wheel forwarded when no overflow
(synthesize/forward to the canvas handler — mind the passive
listener constraints host.ts documents). Write the rule table
(hover state × overflow × modifier → who scrolls) into the ticket
and pin each row with a test.

### Files to Touch

`note/NotePanel.svelte` (wheel seam), host wheel path only if
forwarding needs a hook. E2e: zoom over an open panel zooms the
board; wheel over a short note pans the board; wheel over a long
note scrolls the note.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [ ] Rule table written and pinned row-by-row.
- [ ] Pinch/Cmd+wheel zoom always reaches the canvas over panels.
- [ ] Plain wheel passes through non-overflowing panels; long
      notes still scroll.
- [ ] Gates: `pnpm -r build && pnpm -r test && pnpm lint` + hidden
      e2e.
- [ ] HUMAN-TESTING entry appended at merge by the lead.

### Acceptance Criteria

**GIVEN** the cursor over an open short note
**WHEN** the user wheels or pinches
**THEN** the board pans/zooms — and over a long note, plain wheel
scrolls the text while pinch still zooms the board.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->
