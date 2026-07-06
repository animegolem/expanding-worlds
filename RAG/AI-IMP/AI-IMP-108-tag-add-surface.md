---
node_id: AI-IMP-108
tags:
  - IMP-LIST
  - Implementation
  - tags
  - chrome
kanban_status: planned
depends_on:
parent_epic: [[AI-EPIC-016-context-click-menus]]
confidence_score: 0.85
date_created: 2026-07-06
date_completed:
---

# AI-IMP-108-tag-add-surface

## Summary of Issue #1

Tag assignment is gallery-only: the board's `#` charm popover and
the note panel's chip row DISPLAY tags but cannot add one, so
tagging at the natural moment — while arranging — has no surface
(doc-review headline finding; ratified rev 0.45 §4.8). Done = both
surfaces carry one shared completing add-field: type → existing
tags complete by name_key, Enter assigns; novel text
creates-and-assigns in one gesture; chips refresh in place.

### Out of Scope

- Tag rename/delete/merge surfaces (commands shipped in
  AI-IMP-105; their UI is a later ticket).
- The gallery action bar (already has assignment; untouched).
- Multi-tag queries, tag panel changes beyond reuse.

### Design/Approach

The find-or-create logic exists twice already (GalleryActionBar
`resolveTagId`/`assignTag`, chrome/mirror `applyMirrorChipTags`) —
extract it ONCE into `renderer/tags/tag-assign.ts`: an
`assignTagByName(execute, nodeId, name, allTags)` helper handling
CreateTag + AssignTagToNode with TAG_NAME_CONFLICT
(details.existingTagId) and TAG_ALREADY_ASSIGNED as benign.
Completion is the TagPanel idiom (custom list — NEVER `<datalist>`,
it segfaults hidden Electron windows): prefix-filter over
`listTags`, arrow/Enter selection. Surfaces: (1) charms-ui.ts
`charm-tag-chips` popover gains an input row above the chips —
imperative DOM is fine, reusing the shared logic module; (2)
NotePanel.svelte chip row (nodeId via `subjectNodeId()`) mounts the
same behavior; a small shared Svelte component is preferred there,
with GalleryActionBar left as-is this ticket. Dispatch: charm bar
via `host.gateway.execute`; NotePanel via its existing project
port. Refresh: re-query `listNodeTags` after commit (charm popover
rebuild + `refreshTagChips()`).

### Files to Touch

`apps/desktop/src/renderer/tags/tag-assign.ts`: new shared
find-or-create + completion-filter logic (unit-tested).
`apps/desktop/src/renderer/canvas/charms-ui.ts`: input row in the
`#` popover.
`apps/desktop/src/renderer/note/NotePanel.svelte`: add-field in
the chip row (visible for non-phantom panels even when zero chips).
`apps/desktop/src/renderer/chrome/mirror.ts` /
`views/GalleryActionBar.svelte`: MAY adopt the shared helper if
mechanical; otherwise leave and note it.
`apps/desktop/e2e/` (tags or panels spec): new coverage.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and
**think**. Have you validated all aspects are **implemented** and
**tested**?
</CRITICAL_RULE>

- [ ] `tag-assign.ts` shared helper with unit tests (create, hit
      existing by name_key, conflict recovery, already-assigned).
- [ ] `#` charm popover: completing input above chips; Enter
      assigns/creates; chips update without reselecting the node.
- [ ] Note panel chip row: same field, same behavior, hidden for
      phantom panels.
- [ ] e2e: board flow (select → # → type novel name → Enter → chip
      appears; type prefix of existing → completion → assign) and
      note-panel flow; one undo removes the assignment.
- [ ] Full gates (pnpm -r build, unit, lint, affected e2e).

### Acceptance Criteria

**GIVEN** a selected node on the board
**WHEN** the artist opens `#`, types a new tag name, and presses
Enter
**THEN** the tag is created and assigned in one gesture, the chip
appears immediately, and one undo removes the assignment.
**GIVEN** an open note panel on a tagged node
**WHEN** the artist types the prefix of an existing tag and picks
the completion
**THEN** the existing tag (matched by name_key) is assigned — no
duplicate tag row is created.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->
