---
node_id: AI-IMP-049
tags:
  - IMP-LIST
  - Implementation
  - notes
  - nodes
kanban_status: completed
depends_on: [AI-IMP-044]
parent_epic: [[AI-EPIC-005-notes-links-phantoms]]
confidence_score: 0.8
date_created: 2026-07-05
date_completed: 2026-07-05
---

# AI-IMP-049-note-node-surfaces-and-uses

## Summary of Issue #1

The note↔node relationship surface (§6.6, §6.10, §7.4) has commands
but no UI: attach an existing or new note to a bare node, detach,
make independent, the note pane's Uses sidebar (locations grouped
canvas → node, with an Unplaced group), and Place on Current Canvas
for zero-node notes. Done when §17 items 6, 7, and 17 pass end to
end and a zero-node note can be placed from the pane, producing the
labeled dot.

### Out of Scope

Location-chooser interactions and cross-canvas highlight navigation
(EPIC-006) — Uses rows on the active canvas may center a placement;
other canvases render inert with a canvas name. Node library
(EPIC-006). Tag display beyond names.

### Design/Approach

Node side (extend `node-menu.ts`): a bare node offers Attach Note →
picker (search existing active notes via suggestTitles, or Create New
with title → CreateNote + AttachNoteToNode; collisions reuse
AI-IMP-047's dialog); a note-bearing node offers Open Note, Detach
from This Node (DetachNoteFromNode, no confirmation, §6.6), and Make
Note Independent → title prompt (MakeNoteIndependent). Labels follow
existing SetPlacementLabelVisibility/§17-6 behavior — attaching must
show the title label on the placement (verify the scene query already
projects it; fix if not). Note side: NotePane gains a closable Uses
sidebar fed by getNoteUses (AI-IMP-044): groups by canvas, then node
(placement count, appearance hint, tag names), plus an Unplaced group
whose rows offer Place on Current Canvas — CreatePin with
`note:{kind:'attach'}` at view center for zero-node notes, or
CreatePlacement for an existing node with zero placements. Rows whose
placements live on the active canvas center via CameraFlight.

### Files to Touch

`apps/desktop/src/renderer/canvas/node-menu.ts`: attach/detach/
independent/open entries.
`apps/desktop/src/renderer/note/AttachNotePicker.svelte`: new picker.
`apps/desktop/src/renderer/note/UsesSidebar.svelte`: new sidebar.
`apps/desktop/src/renderer/NotePane.svelte`: sidebar mount + Place
action for zero-node notes.
`packages/persistence/src/queries-notes.ts` (+ test): getNoteUses
gains appearance/tag fields if AI-IMP-044's shape lacks them.
`apps/desktop/e2e/notes.spec.ts`: items 6, 7, 17 + unplaced placement.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and
**think**. Have you validated all aspects are **implemented** and
**tested**?
</CRITICAL_RULE>

- [x] Attach Note picker: search-or-create; attaching an existing
      note to a second node passes item 7 (shared note, independent
      node identities); created-note path routes collisions through
      the AI-IMP-047 dialog.
- [x] Placement label shows the note title after attach (item 6) and
      the label toggle still works.
- [x] Detach from This Node removes only the reference, undoable, no
      dialog; note remains intact at zero nodes (item 17 first half).
- [x] Make Note Independent: title prompt, copies body, attaches new,
      detaches old (item 17 second half).
- [x] Uses sidebar: canvas → node grouping with placement counts and
      tags, Unplaced group, close control; active-canvas rows center
      their placement.
- [x] Zero-node note Place on Current Canvas commits one CreatePin
      (attach) and the labeled dot appears at view center (§6.10).
- [x] Gates: full build/test/lint/e2e green.

### Acceptance Criteria

**GIVEN** a bare image node and an existing note titled Ash
**WHEN** the user attaches Ash via the node menu
**THEN** the node references Ash and its placements show the label Ash.

**GIVEN** two nodes sharing one note
**WHEN** the user makes one node's note independent with a new title
**THEN** the new note carries the copied body, the other node's note
reference is unchanged, and the old note keeps its other use.

**GIVEN** a note with zero nodes open in the pane
**WHEN** the user chooses Place on Current Canvas
**THEN** one command creates node + default dot + placement and the
labeled dot appears at the view center.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->
Scope notes: the picker replaced only the old exact-title
Attach Existing prompt; Attach New keeps AI-IMP-020's inline flow
(and its e2e). Create-and-attach remains two commands (CreateNote +
AttachNoteToNode) — parity with the existing menu behavior; a
composite command wasn't cut because §6.6 doesn't demand it, noted
as accepted residue. The pane derives the active canvas as the root
canvas (workspace tabs are EPIC-006).

Mid-ticket, an e2e "flake" turned out to be the OWNER'S KEYSTROKES:
full-suite runs open ~19 visible Electron windows that each steal
macOS focus and thrash Stage Manager, and a message the owner was
typing landed inside a test editor (they reported motion nausea
severe enough to turn the monitor off). Fixed for good:
EW_TEST_HIDDEN_WINDOWS=1 (set by playwright.config, honored by main
with show:false + dock hide + backgroundThrottling:false) runs the
whole suite with NO visible windows; CDP input and rendering work
unchanged, incl. the perf suite. That exposed the recurring
decorations flake's true cause — DecorationToolbar composed text
edits from its 120ms-stale snapshot, so a fast size→bold sequence
reverted the size (a real user-facing race, not load noise). Fixed
by composing from fresh queried data at click time. First
zero-flake full-suite run of the session followed (34/34,
first-attempt), and the suite runs faster unfocused.
