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

- [x] `tag-assign.ts` shared helper with unit tests (create, hit
      existing by name_key, conflict recovery, already-assigned).
- [x] `#` charm popover: completing input above chips; Enter
      assigns/creates; chips update without reselecting the node.
- [x] Note panel chip row: same field, same behavior, hidden for
      phantom panels.
- [x] e2e: board flow (select → # → type novel name → Enter → chip
      appears; type prefix of existing → completion → assign) and
      note-panel flow; one undo removes the assignment.
- [x] Full gates (pnpm -r build, unit, lint, affected e2e).

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

**Shared helper shape.** `renderer/tags/tag-assign.ts` exports two
pure-ish pieces: `filterTagCompletions(allTags, needle, limit=8)` (the
case-insensitive prefix filter, exact-text dropped, capped — the
TagPanel idiom, never `<datalist>`) and
`assignTagByName(execute, nodeId, name, allTags)` which does the §4.8
find-or-create + assign: merge by `name_key`, `CreateTag` only for a
genuinely new name, `TAG_NAME_CONFLICT` recovers `details.existingTagId`,
then `AssignTagToNode` with `TAG_ALREADY_ASSIGNED` folded to a benign
`{status:'already'}`. It returns a tagged union
(`assigned | already | error`) so each surface renders outcomes its own
way. `execute` is the narrow `(type, payload) => Promise<CommandResult>`
door both surfaces already own (the charm gateway; the note ProjectPort).

**Two surfaces.** The `#` charm popover (charms-ui.ts, imperative DOM)
gained an add-field row + custom completion list above a rebuilt chip
row, dispatching through `host.gateway.execute`; the note panel mounts
a small shared Svelte component `TagAddField.svelte` in its chip row,
dispatching through `paneProject.execute` and refreshing via
`refreshTagChips()`. The note-panel chip section now renders for any
placement-anchored (non-phantom) note even at zero chips — a new
`tagNodeId` state gates it to `subjectNodeId()` (a placement anchor)
so phantom/canvas-phantom drafts never show the field.

**Issues / deviations.**
- panels.spec.ts line 47 asserted `panel-tag-chips` has count 0 for an
  untagged subject. Since the add-field is now always present for a
  non-phantom subject, that assertion was updated (within the allowed
  panels spec) to check `tag-add-field` is visible and no
  `panel-tag-chip-*` chips exist.
- GalleryActionBar and chrome/mirror.ts were left to keep their own
  find-or-create copies (optional adoption per ticket). Neither is
  purely mechanical: the gallery bar loops the assign over many
  selected nodes with per-node added/skipped/failed toast accounting
  and uses `galleryTagCounts` (not `listTags`) as its vocabulary; mirror
  iterates a list of names, mutating a local `existing[]` vocabulary as
  it creates. Folding these into the single-node helper would distort
  it; deferred by design.
- Fresh-worktree electron husk (dist held only LICENSES, no
  Electron.app, no path.txt) blocked Playwright launch; applied the
  documented copy-from-main + `printf` path.txt workaround.

**Validation (all green).**
- `pnpm -r build`: Done (pre-existing a11y warnings only).
- `pnpm --filter desktop test:unit`: 6 files, 47 tests passed (adds
  the tag-assign suite: 8 cases).
- `pnpm lint`: clean.
- `npx playwright test panels.spec.ts notes.spec.ts tags.spec.ts`:
  27 passed (3 new tags cases + the updated panels assertion).
