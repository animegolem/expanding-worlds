---
node_id: AI-IMP-185
tags:
  - IMP-LIST
  - Implementation
  - canvas
  - gestures
  - bug
kanban_status: planned
depends_on: []
parent_epic:
confidence_score: 0.7
date_created: 2026-07-08
---


# AI-IMP-185-gesture-pipeline-hardening

## Summary of Issue #1

FAMILY 7 from the AI-IMP-173 audit (MASTER-FINDINGS M-14/M-15/M-16/
M-31/M-32, P2/P3, agent-claimed — lead-verify each before fixing).
Four hardening gaps in the pointer/gesture pipeline: (1) M-14 the
wheel/pinch handler (host.ts) is never gated on `controller.state`,
and a zoom mid-drag corrupts the gesture's start-point math — the
corrupted transform COMMITS (translation cancels algebraically,
zoom does not); (2) M-15 gestures-ui's locked-placement refusal
fires `stopImmediatePropagation` even in background-edit mode,
breaking board-tooling's capture set for presses over locked items;
(3) M-16 keyboard commands (delete, lock-toggle) run mid-gesture
against the session's stale snapshot, shipping a TransformContent
for a just-deleted id whose result is discarded unchecked; (4)
M-31/M-32 module-local drags (alt-duplicate ghost, crop-editor
handles; controller gesture/marquee/panning too) have no
`pointercancel`/`lostpointercapture` recovery, so an interrupted
capture leaves a stuck drag until Escape. Done means: mid-gesture
zoom is either consumed by the gesture or cancels it cleanly;
background-edit presses reach their owner; mid-gesture keyboard
mutations either defer or cancel the gesture; every drag path has a
pointercancel fallback (the BookmarkMenu pattern).

### Out of Scope

- Any §6.9 semantic change — gesture MEANINGS are ratified; this is
  robustness only.
- The hand rules themselves (audited conformant in AI-IMP-152).
- Design-gated same-canvas bookmark history (M-27).

### Design/Approach

Lead-verify each member first (they are agent-claimed; the wheel
math claim cites controller.ts:212-219 recomputing
screenToWorld(startScreen) per move). Likely shapes: wheel handler
checks `controller.state.kind !== 'idle'` and either forwards to
the gesture or cancels it (pick per feel — flag if ambiguous);
gestures-ui's locked check learns the background-edit mode flag;
keydown mutations while a gesture is active cancel it first
(`tools.escape()`-equivalent) so the session never outlives its
targets; add pointercancel/lostpointercapture handlers mirroring
pointerup on every drag path (BookmarkMenu.svelte is the in-house
pattern). Check the `void gateway.execute` at host.ts:889/892 —
give it the status handling every other call site has.

### Files to Touch

`packages/canvas-engine/src/controller.ts`,
`apps/desktop/src/renderer/canvas/host.ts` (wheel gate),
`gestures-ui.ts`, `crop-editor.ts` (+ units, e2e where
deterministic — no timing-interleave e2e).

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [ ] Each member lead-verified (or re-verified) against current
      code before its fix.
- [ ] Wheel/pinch mid-gesture: consumed or clean-cancel; committed
      geometry always matches what the user saw.
- [ ] Background-edit presses over locked items reach
      board-tooling.
- [ ] Mid-gesture delete/lock cancels the gesture; no stale-id
      commits; execute results checked.
- [ ] pointercancel/lostpointercapture on every drag path.
- [ ] Gates: `pnpm -r build && pnpm -r test && pnpm lint` + hidden
      e2e.
- [ ] HUMAN-TESTING entry appended at merge by the lead.

### Acceptance Criteria

**GIVEN** a drag in progress
**WHEN** the user pinch-zooms, presses Delete, or the OS interrupts
the pointer capture
**THEN** the gesture either incorporates the input or cancels
cleanly — never commits geometry the user didn't see, never strands
a stuck drag, never ships a command for a deleted target.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->
