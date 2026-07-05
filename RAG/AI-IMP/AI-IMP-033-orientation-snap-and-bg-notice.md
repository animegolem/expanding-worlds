---
node_id: AI-IMP-033
tags:
  - IMP-LIST
  - Implementation
  - canvas
  - gestures
  - feel
kanban_status: in-progress
depends_on: [AI-IMP-031, AI-IMP-032]
parent_epic: [[AI-EPIC-010-hands-on-hardening]]
confidence_score: 0.85
date_created: 2026-07-05
date_completed:
---

# AI-IMP-033-orientation-snap-and-bg-notice

## Summary of Issue #1

Two owner findings (RFC rev 0.12). (1) Once rotated, nothing brings
an item back to upright: Shift snaps the rotation DELTA to 15°, so
an item at 7° shift-rotates to 22°, 37° — never 0°/90°. Per §6.9,
rotation should snap by resulting ORIENTATION: gentle cardinal
magnetism during any single-item rotate, Shift quantizing the
absolute angle to 15° steps, Alt bypassing both — making a separate
reset-orientation control unnecessary. (2) Normalization can't mint
pixels: setting a background whose native width is under a smallness
threshold should raise a non-blocking "may look soft" notice while
still proceeding (§6.7).

### Out of Scope

Multi-selection orientation magnetism (the union has no single
orientation; delta-snap behavior stays); rotation snap guides
rendering; blocking dialogs or a setting for the threshold.

### Design/Approach

rotate.ts: after computing the raw delta, a single-item selection
with a known orientation (placement, or shape with rotation) resolves
the target angle = prior + delta, then: Alt → raw; Shift → round to
15° absolute; otherwise magnetize to the nearest multiple of 90° when
within ±5°. The applied delta becomes target − prior, so placements
and shapes reuse the existing application paths untouched.
Multi-select keeps today's delta-15° Shift behavior. Notice: the
CanvasHost board-notice gains an optional action (Keep in Project
button renders only when node ids are present); board-tooling
dispatches an `ew-board-notice` when set/replace-from-file decodes a
native width under BG_SMALL_WIDTH_PX (1024).

### Files to Touch

`packages/canvas-engine/src/gestures/rotate.ts`: orientation snap.
`packages/canvas-engine/src/gestures/rotate.test.ts`: magnetism,
absolute shift steps, alt bypass, multi unchanged.
`apps/desktop/src/renderer/canvas/board-tooling.ts`: smallness
notice dispatch.
`apps/desktop/src/renderer/CanvasHost.svelte`: optional-action
notice.
`apps/desktop/e2e/board-tooling.spec.ts`: notice assertion in the
stage test.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and
**think**. Have you validated all aspects are **implemented** and
**tested**?
</CRITICAL_RULE>

- [ ] rotate.ts single-item orientation resolution: cardinal
      magnetism ±5°, Shift = absolute 15° steps, Alt bypass; applied
      via delta so placement/shape paths are unchanged.
- [ ] Unit tests: item at 7° rotating near upright lands exactly 0;
      near 90° lands π/2; Shift from 7° lands absolute multiples of
      15°; Alt keeps raw angles; multi-select delta behavior
      unchanged.
- [ ] CanvasHost notice: Keep in Project button renders only with
      node ids; message-only notices dismiss/auto-dismiss.
- [ ] board-tooling: BG_SMALL_WIDTH_PX = 1024; set/replace from file
      under it dispatches the notice; e2e asserts it in the stage
      test (8px background).
- [ ] Full gates: `pnpm -r build`, unit suites, desktop e2e, lint.

### Acceptance Criteria

**Scenario:** Artist tidies a rotated board item.
**GIVEN** an image rotated to 47°
**WHEN** the artist rotates it toward upright
**THEN** within 5° of a cardinal it clicks to exactly 0/90/180/270.
**WHEN** the artist holds Shift while rotating
**THEN** the resulting orientation lands on 15° multiples regardless
of the starting angle.
**WHEN** the artist holds Alt
**THEN** rotation is raw.
**GIVEN** a 640px-wide image
**WHEN** it is set as background
**THEN** the stage is set AND a non-blocking notice warns it may
look soft.

### Issues Encountered

<!-- Filled out post-work. -->
