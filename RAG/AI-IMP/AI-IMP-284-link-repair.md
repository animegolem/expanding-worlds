---
node_id: AI-IMP-284
tags:
  - IMP-LIST
  - Implementation
  - renderer
  - persistence
  - lifecycle-push
kanban_status: planned
depends_on: [AI-IMP-270]
parent_epic:
confidence_score: 0.8
date_created: 2026-07-11
---

# AI-IMP-284-link-repair

## Summary of Issue #1

N4 (ratified 11 Jul, lifecycles-1.1 → "N4+T2 Link and Tag Repair",
the N4 half — THE NORMATIVE SPEC): every broken-link branch ends
in a verb, and undo unmakes what the verb made — all of it. Three
deltas against the shipped broken-link panel (NotePanel
~:1404-1419): (1) THE DEAD END GETS ITS VERB — the trashed-match
branch's advice text ("Restore it from Trash first") becomes
**Restore it and relink**: one verb, one undo group
(RestoreNote/RestoreRecord + RelinkBrokenLinks); restore failure
speaks inline in the panel (GR-3 class 4: "couldn't restore it —
the note is still in trash, the link still broken"). (2) THE
INVERSE BECOMES HONEST — undoing relink-CREATE unmakes what it
made: the created note goes (with its bindings) and the link
returns to broken-red; the current inverse (BreakNoteLinks,
stranding an orphan note — CA-008/AI-IMP-233's family) violates
GR-4. Undoing plain relink just re-breaks. (3) TWO ADJACENT
SILENCES close: the phantom keeps a DRAFT on close like any note
surface (its Escape follows rung 2, discard-per-surface stated in
the panel); a bound token that fails to open speaks a class-5
toast ("that note didn't open — try again"). Depends on AI-IMP-270
(the CreateNoteAndAttach redo repair) landing first: the honest
inverse here is the same RestoreAndAttachNote-shaped family, and
270's regression tests must be preserved, not forked. Line numbers
drift; round 1 verifies.

### Out of Scope

- The T2 tag-remove half (AI-IMP-285).
- Link habitats / caption-tier presentation (N1 owns).
- Wiki-link suggestion ranking (§19, still open).

### Design/Approach

Restore-and-relink: a composed group through the shipped
runAsUndoGroup seam (after the trust wave, group identity is
token-scoped — compose under one token). Honest inverse for
relink-create: the create-branch commits (CreateNote +
RelinkBrokenLinks) group so ⌘Z removes the note AND restores
broken state — follow 270's repaired inverse pattern for
title-reservation collisions on redo. Phantom draft: the phantom
panel adopts the note-surface draft-keeping the bundle names
(round 1 verifies what the shipped phantom already persists post-
EPIC-018). The class-5 toast rides the existing toast channel.

### Files to Touch

- `apps/desktop/src/renderer/note/NotePanel.svelte` (branch UI,
  inline failure sentence)
- `packages/persistence/src/handlers/notes.ts` (relink-create
  inverse; preserve 270's tests — the audit defers this file's
  split until after this family settles)
- phantom draft path (round 1 locates)
- e2e: trashed-match → one-click restore-and-relink → one ⌘Z
  returns to trashed+broken; relink-create ⌘Z leaves no orphan
  note; phantom close keeps draft; failed bound-token open
  toasts.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [ ] Restore-and-relink verb: one click, one undo group, inline
      failure sentence on restore refusal.
- [ ] Relink-create inverse unmakes the created note and restores
      broken state; redo replays cleanly (270's seam honored).
- [ ] Plain relink undo re-breaks the link; nothing else moves.
- [ ] Phantom keeps its draft on close; Escape follows rung 2
      with the surface's stated discard behavior.
- [ ] Bound-token open failure speaks class 5.
- [ ] Full `CI=true pnpm check` green (pipefail, counts read);
      CHANGELOG [Unreleased]; HUMAN-TESTING entry (the repair
      flow end-to-end with a trashed target).

### Acceptance Criteria

**GIVEN** a broken link whose title matches a trashed note
**WHEN** the user clicks "Restore it and relink"
**THEN** the note returns from trash and the link binds, as one
undoable entry — and one ⌘Z returns the world exactly to
trashed + broken

**GIVEN** a relink that created a new note
**WHEN** the user presses ⌘Z
**THEN** the created note is unmade (no orphan) and the link
reads broken again.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->
