---
node_id: AI-IMP-180
tags:
  - IMP-LIST
  - Implementation
  - frames
  - undo
  - lifecycle
  - bug
kanban_status: planned
depends_on: []
parent_epic:
confidence_score: 0.85
date_created: 2026-07-08
---


# AI-IMP-180-frame-membership-undo

## Summary of Issue #1

Severity **P1** (M-05, lead-verified) from the AI-IMP-173 audit
(FAMILY 5, frame-membership integrity). Deleting a frame member's
placement (or the frame's own placement) followed by undo silently
loses frame membership: `frame_member` rows are FK-cascade-deleted on
delete but never captured into the restore payload, so restore revives
the placement permanently ungrouped, with no record it was ever a
member.

Mechanism: `deletePlacementRow` hard-deletes; migration 0007's
`ON DELETE CASCADE` on both `frame_member` FKs silently wipes the
membership rows (`grep frame_member` in `handlers/lifecycle.ts` = zero
hits). `RestorePlacementPayload` carries `releasedAnchors` (connector
anchors) but has NO field for `frame_member`, so RestorePlacement/
RestoreContent revives the placement + its connector anchors and leaves
it ungrouped. Deleting the frame's own placement releases every
member's row at once, none restored. Violates invariants 13/24 and
§9.7. Cites:
`packages/persistence/src/handlers/lifecycle.ts:118-187`
(delete/restorePlacementRow — no frame_member), `:232-275` (the
connector-anchor capture/restore pair that IS present — the
reference-good contrast);
`packages/persistence/src/migrations/0007-frame-membership.ts:78-86`
(ON DELETE CASCADE both FKs);
`packages/commands/src/payloads/lifecycle.ts:46-71`
(RestorePlacementPayload has releasedAnchors, nothing for frame_member);
`packages/persistence/src/handlers/frames.test.ts:463-476`.

Done means: deleting a frame member and undoing restores its
membership; deleting a frame and undoing restores all its members;
both directions (placement-as-member and placement-as-frame-with-members)
are captured and rebound, and pre-existing command-log records without
the new field still restore cleanly.

### Out of Scope

- SetNodeAppearance flipping a frame away from 'frame' while it holds
  members (M-23, P2) — a sibling frame-integrity bug, separate ticket.
- The frame appearance-charm undo gap (M-07) — AI-IMP-182.
- Any change to Capture/Release semantics themselves (frames.ts owns
  those; only the delete/restore payload changes here).

### Design/Approach

Copy the connector-anchor capture/restore pair that already lives in
the same file (`lifecycle.ts:232-275`) — that pair is the exact house
pattern for "capture rows a cascade would destroy, restore them on
undo." Apply it to `frame_member`:

- On delete: snapshot the placement's `frame_member` rows into the
  restore payload BEFORE the cascade fires, in BOTH directions:
  (a) rows where this placement is a member of some frame, and
  (b) rows where this placement IS the frame and other placements are
  its members.
- Add a `capturedFrameMembers` (name to match the `releasedAnchors`
  convention) field to `RestorePlacementPayload`.
- On RestorePlacement/RestoreContent: re-insert the captured
  `frame_member` rows after the placement is revived, exactly as
  connector anchors are rebound.
- Tolerate absence: pre-existing command-log records predate the field,
  so treat a missing `capturedFrameMembers` as an empty set — precisely
  how `releasedAnchors` already tolerates absence for old records.

### Files to Touch

`packages/commands/src/payloads/lifecycle.ts`: add `capturedFrameMembers`
to `RestorePlacementPayload` (mirror `releasedAnchors`, `:46-71`).
`packages/persistence/src/handlers/lifecycle.ts`: capture `frame_member`
rows (both directions) on delete; rebind on restore
(mirror the anchor pair `:232-275`); tolerate absence.
`packages/persistence/src/handlers/frames.test.ts`: unit coverage for
member-delete-undo and frame-delete-undo.
`apps/desktop/tests/e2e/*` (frames spec): e2e for both.
LOC: ~70–110.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [ ] `RestorePlacementPayload` gains `capturedFrameMembers`, mirroring
      `releasedAnchors`.
- [ ] Delete captures `frame_member` rows in both directions (as
      member; as frame with members) before the cascade.
- [ ] RestorePlacement/RestoreContent re-inserts captured membership
      rows (mirror the connector-anchor restore, `lifecycle.ts:232-275`).
- [ ] Missing `capturedFrameMembers` (old command-log records) is
      treated as empty, matching `releasedAnchors` tolerance.
- [ ] Unit: delete a member → undo → membership intact; delete the
      frame → undo → all members returned.
- [ ] E2e: same two flows through the real command seam.
- [ ] Gates: `pnpm -r build && pnpm -r test && pnpm lint` + hidden
      e2e (`EW_TEST_HIDDEN_WINDOWS=1`).
- [ ] Append an `RAG/HUMAN-TESTING.md` entry: capture placements in a
      frame, delete a member then undo; delete the frame then undo;
      confirm grouping returns.

### Acceptance Criteria

**Scenario: undoing a member delete restores membership.**
**GIVEN** frame F holds placements A and B
**WHEN** the user deletes A's placement and presses undo
**THEN** A's placement returns AND A is again a member of F.

**Scenario: undoing a frame delete restores all members.**
**GIVEN** frame F holds placements A and B
**WHEN** the user deletes F's placement and presses undo
**THEN** F returns AND both A and B are again its members.

**Scenario: old command-log records still restore.**
**GIVEN** a RestorePlacement record captured before this field existed
**WHEN** it is restored
**THEN** it restores without error (membership treated as empty).

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->
