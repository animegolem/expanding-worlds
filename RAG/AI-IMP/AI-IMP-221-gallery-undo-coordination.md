---
node_id: AI-IMP-221
tags:
  - IMP-LIST
  - Implementation
  - gallery
  - undo
kanban_status: planned
depends_on: []
parent_epic:
confidence_score: 0.6
date_created: 2026-07-09
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

### Files to Touch

`views/GalleryActionBar.svelte`, undo store seam, gallery e2e.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [ ] Staleness reproduced and documented; original gateway-
      exclusion reason found and stated.
- [ ] Per-verb disposition table (captured vs exempt-with-
      invalidation) recorded and implemented.
- [ ] Redo never stale after gallery verbs; e2e pins it.
- [ ] Gates: build, per-package units, lint, e2e in 4+ foreground
      shards.
- [ ] HUMAN-TESTING entry appended at merge by the lead.

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
