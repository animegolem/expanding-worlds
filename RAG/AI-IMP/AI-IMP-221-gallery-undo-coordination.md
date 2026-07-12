---
node_id: AI-IMP-221
tags:
  - IMP-LIST
  - Implementation
  - gallery
  - undo
kanban_status: completed
depends_on: []
parent_epic:
confidence_score: 0.6
date_created: 2026-07-09
date_completed: 2026-07-12
---


# AI-IMP-221-gallery-undo-coordination

## Summary of Issue #1

Terra audit (2026-07-09, P2, lead-verified): GalleryActionBar
issues command envelopes DIRECTLY ("no canvas gateway inside the
takeover" — a deliberate seam), so its verbs (bulk tag, pull into
world, place, trash) are invisible to the undo stack: not
capturable by Mod+Z, and their revisions can strand the stack's
redo entries stale. This collides with the owner's 2026-07-08
undo-breadth ruling (every deliberate verb joins Mod+Z, node-trash
excepted). Done means the gallery's verbs are RECONCILED with the
undo stack — either routed through the gateway/undo capture where
the ruling wants them (tag assign/unassign, place), or explicitly
exempted with the stack correctly INVALIDATED on their revisions
(no stale redo) — per-verb dispositions recorded in this ticket,
with the redo-staleness repro pinned by a test either way.

### Out of Scope

- The gallery tag-add affordance design (DESIGN-QUEUE tag
  cluster).
- Trash verbs (the ruling's stated exception).
- Undo stack internals (114/181/182 shipped semantics).

### Design/Approach

Verify-first: repro the staleness — board action → gallery bulk
tag → Mod+Shift+Z: what happens today? Then per verb: place-onto-
board is a board mutation and belongs in capture; tag ops per the
ruling's "tag edits" line; pull-into-world is an import-family
append (probably exempt like imports are — check how import
handles the stack). The mechanical piece: either thread the
gateway into the takeover (respecting why it was excluded — find
that reason in 129/134 history first) or add a revision-bump
listener that truncates redo. STOP and report if the original
exclusion reason turns out load-bearing.

Pre-implementation correction (2026-07-11): the current gallery has
three distinct command seams, not one. Bulk tag/trash still bypassed the
gateway, while ordinary and frame-target placement delegated to mounted
board listeners. The exclusion was component ownership, not a domain
capability fence: a takeover cannot borrow a canvas host's gateway. The
repair therefore uses a narrow renderer/project gateway over the public
preload port and preserves board-owned placement execution.

Ratified per-verb disposition:

- bulk tag: captured as one explicit group;
- bulk place, including frame capture/arrange: captured as one awaited
  explicit group through the receiving board gateway;
- bulk trash: captured only inside its explicit gesture group; solo and
  system trash remain outside the undo ledger;
- Trash restore: captured standalone; Purge remains irreversible/exempt,
  but crosses the gateway so its durable write invalidates redo.

### Files to Touch

`views/GalleryActionBar.svelte`, undo store seam, gallery e2e.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [x] Staleness reproduced and documented; original gateway-
      exclusion reason found and stated.
- [x] Per-verb disposition table (captured vs exempt-with-
      invalidation) recorded and implemented.
- [x] Redo never stale after gallery verbs; e2e pins it.
- [x] Gates: build, per-package units, lint, e2e in 4+ foreground
      shards.
- [x] HUMAN-TESTING entry appended at merge by the lead.

### Acceptance Criteria

**GIVEN** a board edit followed by a gallery bulk action
**WHEN** the user presses Mod+Z / Mod+Shift+Z
**THEN** undo/redo behave per the breadth ruling with no stale
redo — nothing silently replays over the gallery's changes.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->
Codex wave. Verdict AMENDED the round-1 proposal: solo trash
verbs KEEP the Trash recovery home (owner ruling 182 stands);
bulk gestures capture as one group via the group-only policy
class — the surface defines the contract. Review also found bulk
PLACE was N fire-and-forget commits (now one awaited group) and
that re-selection needed a receipt seam (gallery-reselect.ts,
scoped to bulk trash). Two integration defects self-convicted
pre-submission: frame-load's broadcast resolved from non-target
boards; live selectedIds mutated mid-gesture (now snapshotted).
Purge clears redo and stays exempt. Flag standing for the owner:
solo-exempt vs bulk-captured is the faithful reading of 182 +
G2+G5 — unify later if wanted.
