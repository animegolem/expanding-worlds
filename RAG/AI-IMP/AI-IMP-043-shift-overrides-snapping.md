---
node_id: AI-IMP-043
tags:
  - IMP-LIST
  - Implementation
  - canvas
  - gestures
kanban_status: completed
depends_on: [AI-IMP-042]
parent_epic: [[AI-EPIC-010-hands-on-hardening]]
confidence_score: 0.9
date_created: 2026-07-05
date_completed: 2026-07-05
---

# AI-IMP-043-shift-overrides-snapping

## Summary of Issue #1

Owner finding: Shift-constrained drags work but content snapping
pulls the result off the enforced axis. Shift promises EXACT
geometry, so it must silence snapping wherever it enforces a
constraint — snapping never fights the Shift key.

### Out of Scope

Snapping along the constrained axis only (rejected for
predictability — owner asked for full disable); Alt semantics
(unchanged, still the explicit snap bypass).

### Design/Approach

move.ts passes `disabled: alt || shift` to the SnapProvider (resize,
rotate, and draw never consult snapping, so move is the only seam).
RFC §6.9 gains the precedence sentence (rev 0.15). Unit test with a
recording snap provider asserts the disable flag and the exact
on-axis result.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and
**think**. Have you validated all aspects are **implemented** and
**tested**?
</CRITICAL_RULE>

- [x] Move driver disables snapping under Shift; unit test proves
      the flag and the exact axis-constrained delta.
- [x] RFC rev 0.15 precedence sentence; pandoc; full gates.

### Acceptance Criteria

**GIVEN** an item dragged horizontally with Shift near another
item's edge
**THEN** it stays exactly on the horizontal axis with no snap pull
and no guides.

### Issues Encountered

<!-- Filled out post-work. -->
As scoped; the recording-snap-provider test pins both the disable
flag and the exact on-axis result. Note the disable also clears any
engaged snap state (AI-IMP-026's provider resets on disabled), so
guides vanish the moment Shift goes down. Left on the table,
unnumbered: the silent PROJECT_LOCKED boot (main-process retry +
visible status) — the owner attributed the morning's black canvases
to user error for now; the proposal stands when it recurs.
