---
node_id: AI-IMP-041
tags:
  - IMP-LIST
  - Implementation
  - canvas
  - gestures
kanban_status: completed
depends_on: [AI-IMP-035]
parent_epic: [[AI-EPIC-010-hands-on-hardening]]
confidence_score: 0.9
date_created: 2026-07-05
date_completed: 2026-07-05
---

# AI-IMP-041-shift-resize-aspect

## Summary of Issue #1

Shift constrains proportions while DRAWING (AI-IMP-035) but resize
handles ignore it: shapes resize free-aspect with no way to hold
their proportions. Convention: Shift on a corner handle locks
aspect for any selection — images keep their default lock (Alt
frees), Shift forces the lock everywhere and wins over Alt.

### Out of Scope

Shift-axis constraint on MOVE drags (candidate follow-up, not
asked); edge-handle behavior (stays single-axis).

### Design/Approach

resize.ts: both the world path and the single-rotated-item local
path compute `aspect = corner && ((hasImage && !alt) || shift)`.
One expression change per path + unit tests.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and
**think**. Have you validated all aspects are **implemented** and
**tested**?
</CRITICAL_RULE>

- [x] Both resize paths honor Shift; Shift wins over Alt; unit
      tests: shape corner + shift → uniform; image + alt + shift →
      still uniform; rotated local path + shift → uniform.
- [x] Full gates.

### Acceptance Criteria

**GIVEN** a selected rect shape
**WHEN** its corner is dragged with Shift held
**THEN** width and height scale by one factor.

### Issues Encountered

<!-- Filled out post-work. -->
Trivial wiring as scoped; 233 engine tests, 22 e2e green (one
known-class load flake absorbed by retry). Candidate follow-up
noted, not built: Shift-axis constraint on MOVE drags.
