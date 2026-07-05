---
node_id: AI-IMP-047
tags:
  - IMP-LIST
  - Implementation
  - notes
  - wiki-links
kanban_status: planned
depends_on: [AI-IMP-045]
parent_epic: [[AI-EPIC-005-notes-links-phantoms]]
confidence_score: 0.8
date_created: 2026-07-05
date_completed:
---

# AI-IMP-047-rename-and-title-collisions

## Summary of Issue #1

RenameNote's transactional rewrite and NOTE_TITLE_CONFLICT errors
exist in persistence, but no UI drives them. This ticket adds the
rename surface (editable title field), the §10.2 dirty-buffer flush
before any body-rewriting command, external-change folding into
CodeMirror's local undo, and the §7.7 collision flows. Done when §17
item 15 passes: renaming a linked note while an editor holds
uncommitted edits to a source note flushes the buffer, rewrites
inbound tokens transactionally, binds matching unresolved tokens, and
folds the rewritten text into the open editor's local undo history.

### Out of Scope

Rename entry points beyond the pane title field and node menu.
Homoglyph/confusable folding (out of scope for Phase 1 per §4.2).
Trash/restore UI (EPIC-007) beyond the §7.7 Restore Existing Note
offer.

### Design/Approach

Title field commits on Enter/blur via RenameNote after awaiting
`flushPending()` (the AI-IMP-044 seam) so the rewrite never races a
dirty buffer — same seam is called before trash/export later.
External-change folding: on project-changed events touching the open
note's body outside the editor's own commits, fetch the new body and
apply it as a CM **transaction computing a minimal diff** (not
setState), so local undo history survives and travels through the
rewrite (§10.2). Collision handling: command failures with code
NOTE_TITLE_CONFLICT open a dialog offering, per flow — creation
(phantom/Create Pin): Use Existing Note | Choose Different Title;
rename: Open Conflicting Note | Choose Different Title; conflicting
note trashed: additionally Restore Existing Note (RestoreRecord).
The draft title/body is always retained (MUST, §7.7). An aliased
inbound token `[[Old|label]]` must display unchanged post-rename —
covered by existing persistence tests; the e2e asserts the editor
shows the rewritten source.

### Files to Touch

`apps/desktop/src/renderer/NotePane.svelte`: title field + rename commit.
`apps/desktop/src/renderer/note/note-editor.ts`: external-change diff
fold; flush-before-rename ordering.
`apps/desktop/src/renderer/note/TitleConflictDialog.svelte`: new dialog.
`apps/desktop/src/renderer/canvas/node-menu.ts`: rename entry (if trivial).
`apps/desktop/e2e/notes.spec.ts`: slice item 15 scenario + collision flows.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and
**think**. Have you validated all aspects are **implemented** and
**tested**?
</CRITICAL_RULE>

- [ ] Title field renames via RenameNote on Enter/blur, preceded by
      flushPending(); no-op titles and linkability-violating titles
      (`[`,`]`,`|`, newline) surface the structured error, draft kept.
- [ ] External changes to the open note's body apply as a
      diff-computed CM transaction; local undo steps back through the
      rewrite (test: type, rename elsewhere, undo restores pre-typed
      text without losing the rewrite's other lines).
- [ ] NOTE_TITLE_CONFLICT dialog with per-flow actions (Use Existing /
      Choose Different / Open Conflicting / Restore Existing when
      trashed); draft retained in every path.
- [ ] Slice item 15 e2e: dirty source-note buffer + rename of the
      linked target → flush, transactional token rewrite, unresolved
      tokens matching the new title bind, editor undo history intact.
- [ ] Gates: full build/test/lint/e2e green.

### Acceptance Criteria

**GIVEN** note A's editor holds uncommitted text linking `[[Old]]`
**WHEN** the user renames note Old to New from another surface
**THEN** A's buffer flushes before the rewrite
**AND** A's editor shows `[[New]]` folded in as an external change
**AND** Cmd+Z in A's editor steps through local history across the
rewrite without corrupting it.

**GIVEN** a rename to a title whose title_key belongs to a trashed note
**WHEN** the command returns NOTE_TITLE_CONFLICT
**THEN** the dialog offers Open Conflicting Note, Choose Different
Title, and Restore Existing Note, and the user's draft is retained.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->
