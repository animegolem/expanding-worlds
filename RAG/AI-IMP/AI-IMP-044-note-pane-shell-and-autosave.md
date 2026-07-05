---
node_id: AI-IMP-044
tags:
  - IMP-LIST
  - Implementation
  - notes
  - editor
kanban_status: completed
depends_on:
parent_epic: [[AI-EPIC-005-notes-links-phantoms]]
confidence_score: 0.85
date_created: 2026-07-05
date_completed: 2026-07-05
---

# AI-IMP-044-note-pane-shell-and-autosave

## Summary of Issue #1

The note half of the product has no editor: NotePane.svelte is an
eight-line placeholder and CodeMirror is not a dependency. This
ticket lands the interface-defining shell: a CM6 Markdown editor in
the note pane, the §10.2 autosave gesture model (one UpdateNote per
editing burst — idle debounce, blur/pane-switch, quit, forced flush),
open-note entry points (double-click a placement whose node has a
note; node-menu Open Note), and the two missing read models
(`getNoteLinks`, `getNoteUses`) later tickets consume. Done when a
typing burst commits exactly one UpdateNote / one project_revision
increment and a note survives quit-mid-debounce (§17 item 25 half).

### Out of Scope

Wiki-link decoration, suggestions, phantom views, rename, collision
dialogs, Uses sidebar UI, attach/detach (AI-IMP-045..049). Chrome-era
layout — the pane stays in the existing docked grid column,
collapsible only.

### Design/Approach

CM6 (`@codemirror/state/view/commands/language`, `@lezer` markdown)
in the renderer; the editor buffer is ephemeral state per §10.2. A
`NoteEditorController` (plain TS, `renderer/note/note-editor.ts`)
owns dirty tracking and exposes `flushPending(): Promise<void>` — the
forced-flush seam every body-touching command must call first.
Triggers: `NOTE_AUTOSAVE_IDLE_MS = 1500` idle debounce, editor blur,
note switch, and `beforeunload` (sendBeacon-style sync flush via
`project.execute` await is impossible on unload — flush on
`visibilitychange`/window blur and have main delay quit via
will-quit → flush IPC round-trip). Editor-local undo stays
CodeMirror's history (invariant 30): the pane's keymap handles
Mod-z/Mod-Shift-z locally when focused. Queries: `getNoteLinks(noteId)`
returns the note's outbound link records (range, state, target,
display text); `getNoteUses(noteId)` returns placements of all active
nodes referencing the note grouped canvas → node with counts
(§7.3/§7.4 shape). Entry points: canvas double-click on a placement
whose node has a note opens it (falls back to text edit for
decorations as today); node menu gains Open Note.

### Files to Touch

`apps/desktop/package.json`: CM6 dependencies.
`apps/desktop/src/renderer/NotePane.svelte`: real editor + title display.
`apps/desktop/src/renderer/note/note-editor.ts`: new controller (dirty/debounce/flush).
`apps/desktop/src/renderer/App.svelte` / `Workspace.svelte`: open-note plumbing, collapse toggle.
`apps/desktop/src/renderer/canvas/node-menu.ts`, `gestures-ui.ts`: Open Note entry points.
`apps/desktop/src/main/index.ts`, `preload/index.ts`: quit-flush handshake.
`packages/persistence/src/queries-notes.ts` (+ test): getNoteLinks, getNoteUses.
`apps/desktop/e2e/notes.spec.ts`: new spec.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and
**think**. Have you validated all aspects are **implemented** and
**tested**?
</CRITICAL_RULE>

- [x] `getNoteLinks` and `getNoteUses` queries with unit tests
      (grouping, active-only nodes, unplaced group).
- [x] CM6 editor mounted in NotePane; loads a note by ID; title shown;
      Markdown highlighting active.
- [x] NoteEditorController: dirty tracking, 1500 ms idle debounce,
      blur / note-switch flush, `flushPending()` seam; exactly one
      UpdateNote per burst asserted in an e2e via project_revision
      delta.
- [x] Quit flush: main delays close until renderer flush resolves;
      e2e (or integration test) proves an edit inside its debounce
      window survives relaunch.
- [x] Local undo: Mod-z in a focused editor is CodeMirror history and
      never dispatches structural undo.
- [x] Open-note entry points: double-click placement-with-note and
      node-menu Open Note both load the pane; e2e covers one path.
- [x] Gates: `pnpm -r build`, unit suites, lint, desktop e2e green.

### Acceptance Criteria

**GIVEN** an open note and a 30-keystroke typing burst
**WHEN** the user stops typing for 1.5 s
**THEN** exactly one UpdateNote commits and project_revision advances
by exactly one.

**GIVEN** a dirty editor inside its debounce window
**WHEN** the application quits and relaunches
**THEN** the note body contains the typed text.

**GIVEN** a placement whose node references a note
**WHEN** the user double-clicks it
**THEN** the note pane loads that note.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->
Landed as scoped with three notes. (1) Quit flush could not use
beforeunload (a sandboxed renderer cannot await IPC there): main
intercepts window close, requests a flush over `app:flush`, and
proceeds on ack or a 2 s timeout — the e2e drives the REAL close
chain via BrowserWindow.close() and proves a mid-debounce edit
survives relaunch (first relaunch-based e2e in the suite; clean
close releases the writer lock, so no 30 s corpse window). (2)
UpdateNote deliberately skips the optimistic revision check
(checkRevision: false): the editor buffer is the prose authority and
an unrelated canvas command must never conflict an autosave; all
other note commands keep the check. (3) The note pane builds its own
CommandGateway over the preload bridge instead of borrowing the
canvas host's, so the editor works even if canvas boot fails. Both
entry points (double-click, node-menu Open Note) are e2e-covered,
not just one. Blur-flush is implemented via CM domEventHandlers but
only exercised indirectly (dirty-indicator e2e uses the debounce);
IMP-047's rename flow will exercise the flush seam directly.
Decorations/import e2e flaked once under full-suite load (known
class, absorbed by retries:1, clean in isolation).
