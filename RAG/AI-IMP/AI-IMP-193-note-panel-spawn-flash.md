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

- [x] No paint before position: first visible frame is at the
      final spawn point.
- [x] Spawn anchored to pointer/placement with the house §8.8
      clamp.
- [x] Root cause(s) of the double flash documented in Issues
      Encountered.
- [x] Gates: `pnpm -r build && pnpm -r test && pnpm lint` + hidden
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

**Root cause (single, not two).** The double-flash is ONE cause, not a
second re-render: the panel's `pos` is `$state({x:0,y:0})` at mount and
only earns a real value in `layout()`, which runs inside a
`requestAnimationFrame` (and, on a fresh open, after the async port +
note load). The `<section>` was fully visible during that gap, so it
painted at the window's upper-left — and because the load kicked several
schedule()→layout() passes, it flashed there more than once before
jumping to the anchor. There is no separate scene-applied re-render
flash; gating the first paint removes every corner paint at once.

**Fix.** Added a `positioned` guard (false until the first `layout()`).
Until then the panel is `visibility:hidden` and `pointer-events:none`;
`layout()` flips `positioned` true in the SAME synchronous pass that
sets the real `pos`, so the first reveal is already placed. `onMount`
now calls `schedule()` synchronously (independent of the async
port/note load) so the hold window is ~1 frame, not the ~250ms the flash
used to last. The spawn position already anchors to the placement/pointer
through the existing §8.8 in-window clamp (`Math.min/max` into the
viewport in `layout()` / `layoutBoundPage`) — no hand-rolled clamp added.

**Verified** by a per-frame e2e sampler (`AI-IMP-193` in panels.spec):
pre-fix it recorded a `{left:0, top:0, visible:true}` frame (the flash);
post-fix NO visible frame ever sits in the upper-left, and the first
placed paint is beside the node.

**199 coupling verdict:** NOT the same cause as 199. This gate is the
unpositioned first paint (the "opens…and closes" visual); 199's
"can't-open-anymore" half is the AI-IMP-116 world-scale fade, shared
with AI-IMP-200. Both were fixed. See AI-IMP-199 Issues for the full
braid.
