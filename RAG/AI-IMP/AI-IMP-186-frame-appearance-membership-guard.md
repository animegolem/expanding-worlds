---
node_id: AI-IMP-186
tags:
  - IMP-LIST
  - Implementation
  - frames
  - domain
  - bug
kanban_status: planned
depends_on: []
parent_epic:
confidence_score: 0.8
date_created: 2026-07-08
---


# AI-IMP-186-frame-appearance-membership-guard

## Summary of Issue #1

M-23 from the AI-IMP-173 audit (P2, agent-claimed with strong
citations — lead-verify first). `CaptureInFrame` checks
`appearance_kind === 'frame'` at capture time only; nothing stops
`SetNodeAppearance` from flipping a frame's node to dot/icon/image/
card while `frame_member` rows still reference its placement. The
rows go dormant (frame-tree queries require the frame appearance)
and silently RESURRECT if the appearance ever flips back — members
the user believes released reunite without any CaptureInFrame
running. This breaks the "membership edited only by Capture/
Release" contract. Done means un-framing a node with captured
members has a DEFINED outcome enforced in the handler: release the
members within the same command (recommended — mirrors §9.2's
same-command cascade discipline), recorded in the command's
affected set and inverse so undo restores both appearance and
membership together.

### Out of Scope

- UI treatment of the un-frame verb (menus already offer appearance
  changes; no new UI).
- The frame sort-mode fact (138's flagged follow-on).
- Blocking the appearance change entirely (refusal) — worse UX than
  a clean release; if verification reveals a reason to prefer
  refusal, STOP and take it to the lead.

### Design/Approach

Verify the resurrection path first (unit: capture members, flip
appearance away and back, query the frame tree). Then:
`SetNodeAppearance`'s handler, when the PRIOR kind was 'frame' and
the new kind is not, deletes that node's placements' `frame_member`
rows (as frame side) in the same transaction, adds the memberships
to `affected`, and carries them in the inverse payload so undoing
the appearance change restores membership too (the AI-IMP-180
capture shape is the in-house pattern). Members' own memberships
(the node's placement AS member of another frame) are untouched —
only its role as a frame dissolves.

### Files to Touch

`packages/persistence/src/handlers/` (the SetNodeAppearance
handler; read AI-IMP-180's capturedFrameMembers shape first),
`packages/commands` payload if the inverse grows a field, units +
one e2e (flip a populated frame to dot → members released; undo →
frame and membership restored).

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [ ] Resurrection path verified (pinning unit red before fix).
- [ ] Un-framing releases members in the same command; affected +
      inverse carry them; undo restores both.
- [ ] Members' outbound memberships untouched.
- [ ] Gates: `pnpm -r build && pnpm -r test && pnpm lint` + hidden
      e2e.

### Acceptance Criteria

**GIVEN** a frame with captured members
**WHEN** its node's appearance changes to any non-frame kind
**THEN** the members are released within the same command
**AND** undoing restores the frame appearance with its membership
intact — and flipping appearance back WITHOUT undo resurrects
nothing.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->
