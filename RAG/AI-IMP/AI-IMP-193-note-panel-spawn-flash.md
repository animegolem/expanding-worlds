---
node_id: AI-IMP-193
tags:
  - IMP-LIST
  - Implementation
  - notes
  - panels
  - bug
kanban_status: planned
depends_on: []
parent_epic:
confidence_score: 0.75
date_created: 2026-07-08
---


# AI-IMP-193-note-panel-spawn-flash

## Summary of Issue #1

Owner testing note (2026-07-08, v0.15.0): when placing a pin (and
its note panel opens), the panel first paints for ~200-250ms in
the window's UPPER-LEFT corner, flashes there (twice), then
renders at its correct position — a classic unpositioned-first-
paint: the element mounts and becomes visible before its position
style lands (likely position computed after an await — anchor
rect/query — while the panel is already in the DOM at default
0,0). Done means the panel NEVER paints at a wrong position: it is
invisible (or unmounted) until its first real position is known,
and its spawn position follows the owner's stated expectation — a
fixed offset/ratio relative to the pointer (or the anchor
placement) rather than window-relative.

### Out of Scope

- The paper folds/shape (AI-IMP-194).
- Panel lifecycle semantics (§8.5 unchanged).

### Design/Approach

Trace the open path for a pin-placed note (pin-tool → note panel
open). Find where position is computed vs when the element becomes
visible; hold `visibility:hidden`/skip-mount until the position is
set in the same frame (the async-open guard family's discipline —
no flash window). Then the spawn rule: anchor the initial position
to the pointer/placement with a fixed offset per §8.8 free-region
clamping (the house clamp already exists — use it, don't hand-roll).
Verify the double-flash is one cause (unpositioned paint) and not
two (e.g., a re-render on scene-applied) — if two causes, fix both
or STOP and report the second.

### Files to Touch

`apps/desktop/src/renderer/note/` (panel open/positioning),
`canvas/pin-tool.ts` seam if the anchor rect comes from there.
E2e: open via pin place → assert the panel's FIRST visible
bounding box is already at the clamped anchor position (poll
paints, no 0,0 frame).

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [ ] No paint before position: first visible frame is at the
      final spawn point.
- [ ] Spawn anchored to pointer/placement with the house §8.8
      clamp.
- [ ] Root cause(s) of the double flash documented in Issues
      Encountered.
- [ ] Gates: `pnpm -r build && pnpm -r test && pnpm lint` + hidden
      e2e.
- [ ] HUMAN-TESTING entry appended at merge by the lead.

### Acceptance Criteria

**GIVEN** placing a pin that opens its note panel
**THEN** the panel appears exactly once, already at its correct
position near the pin — never in the window corner.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->
