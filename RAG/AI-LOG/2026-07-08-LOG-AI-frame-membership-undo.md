---
node_id: 2026-07-08-LOG-AI-frame-membership-undo
tags:
  - AI-log
  - development-summary
  - frames
  - undo
  - lifecycle
closed_tickets: [AI-IMP-180]
created_date: 2026-07-08
related_files:
  - packages/commands/src/payloads/lifecycle.ts
  - packages/persistence/src/handlers/lifecycle.ts
  - packages/persistence/src/handlers/frames.test.ts
  - apps/desktop/e2e/frames.spec.ts
  - RAG/HUMAN-TESTING.md
confidence_score: 0.9
---

# 2026-07-08-LOG-AI-frame-membership-undo

## Work Completed

AI-IMP-180 (P1, FAMILY 5): closed the frame-membership undo gap.
Deleting a frame member's placement — or the frame's own placement —
followed by undo silently lost `frame_member` rows: migration 0007's
ON DELETE CASCADE wiped them and `RestorePlacementPayload` carried no
membership, so restore revived the placement permanently ungrouped.

Fix mirrors the existing connector-anchor capture/restore pair in the
same file: on delete, snapshot every `frame_member` row keyed on the
placement (one `WHERE member = ?1 OR frame = ?1` covers both
directions — the placement-as-member row and every placement-as-frame
row) into a new optional `capturedFrameMembers` field; on restore,
re-insert them. Absence tolerated for pre-AI-IMP-180 command-log
records, exactly as `releasedAnchors` documents. No schema change.

All gates green: `pnpm -r build && pnpm -r test && pnpm lint`
(537 persistence unit tests, 201 desktop e2e, eslint clean).

## Session Commits

Single ticket branch `worktree-agent-adc36def1e4f9903f`; one coherent
commit staged for lead review (agent does not push). Touches the four
source/test files plus HUMAN-TESTING and the ticket.

## Issues Encountered

FK ordering was the one real subtlety, and it was NOT visible from the
design — the first draft re-inserted membership INSIDE
`restorePlacementRow` (verbatim mirror of the anchor rebind) and passed
every test except the batch DeleteContent-of-a-frame-with-members case.
Root cause: a `frame_member` row cascades the instant EITHER endpoint's
placement is deleted, so only the first-deleted endpoint's payload
captures it. A batch that deletes the frame first puts ALL rows in the
frame's payload, and `RestoreContent` revives the frame's placement
before its members exist — so a both-endpoints-live guard skipped every
row and undo restored zero membership. Resolution: re-insert membership
as its OWN pass, AFTER every placement in the restore is live (second
loop in RestoreContent; trailing call in RestorePlacement), never
per-placement. Extracted `reinsertCapturedFrameMembers`. The
both-endpoints-live count guard + `ON CONFLICT DO NOTHING` are now
redundant but retained as defensive belt, matching the anchor code's
`if (!current) continue` posture.

Chose a purpose-specific `CapturedFrameMember` type over reusing
`FrameMembershipTarget` (its nullable `framePlacementId` is meaningless
for a NOT-NULL schema row).

## Tests Added

Unit (`frames.test.ts`, new describe block): member-delete→undo restores
membership; frame-delete→undo returns all members; nested-frame delete
captures BOTH directions (rejoins parent AND regains own members); batch
DeleteContent of frame+members→undo (the FK-ordering guard); legacy
payload without the field restores ungrouped without error.

E2e (`frames.spec.ts`): both flows through the real command seam — draw
a frame, capture two items, delete a member via the board Delete key and
Mod+Z (membership intact), then delete the frame and Mod+Z (all members
return). Capture issued directly (not what the ticket fixes); delete +
undo run through the gateway/undo stack.

## Next Steps

AI-IMP-180 is complete and ready for lead merge review. Sibling
frame-integrity items remain out of scope and open: M-23/P2
(SetNodeAppearance flipping a frame away from 'frame' while it holds
members) and AI-IMP-182 (frame appearance-charm undo gap, M-07). Lead
runs generate-index and closes on merge.
