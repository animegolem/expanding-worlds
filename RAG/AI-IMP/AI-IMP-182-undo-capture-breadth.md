---
node_id: AI-IMP-182
tags:
  - IMP-LIST
  - Implementation
  - undo
  - feel
  - bug
kanban_status: planned
depends_on: []
parent_epic:
confidence_score: 0.8
date_created: 2026-07-08
---


# AI-IMP-182-undo-capture-breadth

## Summary of Issue #1

Owner-RULED 2026-07-08 (DESIGN-QUEUE "Undo capture breadth", RESOLVED):
**every deliberate verb joins Mod+Z EXCEPT node-trash** — the Trash
stays the recovery home for a trashed node. The ruling is explicitly
feel-tested: trimming a verb back out is one line each if the week's
testing says so. This ticket both fixes a lead-verified inconsistency
bug (M-07, P2) and extends undo capture to the ruled-in verbs.

**The bug (M-07, P2, lead-verified) — lands regardless of the breadth
ruling.** The appearance charm/menu commits `SetNodeAppearance` with a
bare `execute()` (no `runAsUndoGroup`), so appearance changes are
silently NOT undoable, while every OTHER call site wraps it correctly.
`SetNodeAppearance` is GROUP_ONLY; fired with `pendingGroup===null` the
capture gate drops it, so Cmd+Z does nothing to it (or reverts an
unrelated earlier action). The doc comment above `commitAppearance`
even falsely claims "one undo." Cites:
`apps/desktop/src/renderer/canvas/charms-ui.ts:227-231` (commitAppearance),
`:301-321` (onImagePicked), `:522-524` (bare execute helper);
`apps/desktop/src/renderer/undo/undo-store.ts:58-64`
(SetNodeAppearance is GROUP_ONLY), `:215` (standalone-commit branch
drops it); correct siblings `host.ts:1225`, `crop-editor.ts:258`.

**The breadth extension (M-22 + owner ruling).** Per the ruling, add
undo capture to: note renames (note title), tag add/remove/rename,
DetachNoteFromNode (RFC §6.6/§9.3 "immediately undoable"), and bookmark
create/remove/reorder. All inverses already exist (DESIGN-QUEUE's
resolved entry confirms). NOT captured: TrashNode/purge. Cites for
detach: `apps/desktop/src/renderer/menus/ContextMenu.ts:520` (bare
`execute('DetachNoteFromNode',...)`), `:442` (bare execute helper);
`undo-store.ts:21-37,58-64,215` (absent from both allowlists);
RFC §6.6, §9.3.

Done means: the appearance charm/menu is undoable; renames, tag edits,
detach, and bookmark edits are undoable; and a node-trash does NOT
enter Mod+Z (Trash remains its recovery path).

### Out of Scope

- TrashNode / purge capture — explicitly EXCLUDED by the owner ruling;
  the Trash is the node's recovery home.
- The undo re-entrancy plumbing (M-06) + toast copy (M-38) — AI-IMP-181.
- SetNodeAppearance frame-away member orphaning (M-23) — separate
  frame-integrity ticket.
- Inventing new inverses — all required inverses already exist per the
  resolved DESIGN-QUEUE entry; if one is found missing, STOP and flag,
  do not fabricate.

### Design/Approach

The house pattern for "make a deliberate verb undoable" is
`runAsUndoGroup` around the `execute()` (see the correct sibling sites
`host.ts:1225`, `crop-editor.ts:258`), plus listing the command in
`undo-store.ts`'s CAPTURED/GROUP_ONLY allowlist as its capture class
requires.

1. **M-07 fix (do first, unblocked):** wrap both charms-ui commit sites
   (`commitAppearance` `:227-231`, `onImagePicked` `:301-321`) in
   `runAsUndoGroup`, matching every other SetNodeAppearance call site.
   Fix the false "one undo" doc comment.

2. **Renames:** wrap note-title rename commits in `runAsUndoGroup` and
   add the rename command to the allowlist.

3. **Tags:** wrap tag add/remove/rename commits; add to the allowlist.

4. **Detach:** replace ContextMenu's bare `execute('DetachNoteFromNode')`
   (`:520`) with the group-wrapped form; add DetachNoteFromNode to
   CAPTURED/GROUP_ONLY per its inverse (AttachNoteToNode).

5. **Bookmarks:** wrap create/remove/reorder commits; add to the
   allowlist.

Each is the SAME one-line-plus-allowlist shape; keep them small and
independently revertible so a feel-trim during testing week is one edit.

### Files to Touch

`apps/desktop/src/renderer/canvas/charms-ui.ts`: wrap commitAppearance +
onImagePicked in `runAsUndoGroup`; fix the doc comment.
`apps/desktop/src/renderer/menus/ContextMenu.ts`: group-wrap
DetachNoteFromNode (`:520`).
`apps/desktop/src/renderer/undo/undo-store.ts`: extend CAPTURED/
GROUP_ONLY allowlists (appearance already listed; add rename, tag ops,
DetachNoteFromNode, bookmark ops).
Rename / tag / bookmark commit call sites (note title rename handler,
`tags/*`, `chrome/bookmarks.ts`): wrap in `runAsUndoGroup`.
Tests: unit for each capture class; e2e for appearance flip, detach,
and the trash-not-captured guard.
LOC: ~90–140 (many small wraps + allowlist entries).

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [ ] charms-ui commitAppearance + onImagePicked wrapped in
      `runAsUndoGroup` (M-07); false "one undo" comment corrected.
- [ ] Note-title rename undoable; command in the allowlist.
- [ ] Tag add/remove/rename undoable; commands in the allowlist.
- [ ] DetachNoteFromNode group-wrapped and in the allowlist
      (ContextMenu `:520`).
- [ ] Bookmark create/remove/reorder undoable; commands in the
      allowlist.
- [ ] TrashNode/purge confirmed NOT captured (Trash is the recovery
      home) — assert it does not enter Mod+Z.
- [ ] Each capture is small and independently revertible (feel-trim
      friendly).
- [ ] Unit tests per capture class; e2e: appearance flip undoes;
      detach undoes; a node-trash does NOT enter Mod+Z.
- [ ] Gates: `pnpm -r build && pnpm -r test && pnpm lint` + hidden
      e2e (`EW_TEST_HIDDEN_WINDOWS=1`).
- [ ] Append an `RAG/HUMAN-TESTING.md` entry (feel pass): change an
      appearance, rename, edit tags, detach a note, add/reorder
      bookmarks — each Cmd+Z undoes cleanly; trash a node and confirm
      Cmd+Z does NOT resurrect it (Trash does). Note verbs that feel
      wrong to capture so they can be trimmed.

### Acceptance Criteria

**Scenario: appearance change is undoable.**
**GIVEN** a pin whose appearance the user changes via the charm/menu
**WHEN** the user presses Cmd+Z
**THEN** the appearance reverts to its prior value.

**Scenario: detach is undoable.**
**GIVEN** a note detached from a node via the context menu
**WHEN** the user presses Cmd+Z
**THEN** the note reattaches.

**Scenario: node-trash stays out of Mod+Z.**
**GIVEN** a node the user trashes
**WHEN** the user presses Cmd+Z
**THEN** the node is NOT resurrected by undo (recovery is via the Trash).

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->
