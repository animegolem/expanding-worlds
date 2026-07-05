---
node_id: AI-IMP-046
tags:
  - IMP-LIST
  - Implementation
  - notes
  - phantoms
kanban_status: completed
depends_on: [AI-IMP-045]
parent_epic: [[AI-EPIC-005-notes-links-phantoms]]
confidence_score: 0.85
date_created: 2026-07-05
date_completed: 2026-07-05
---

# AI-IMP-046-phantom-view-and-materialization

## Summary of Issue #1

Writing `[[Title]]` for a nonexistent title is itself a creation flow
(§6.11), but nothing presents phantoms: activating an unresolved link
must open a phantom view (would-be title, references grouped by
source note, materialization actions) and materialization must bind
every matching token project-wide in one command (§7.2). The
`getPhantom` read model and the sweep already exist. Done when §17
item 14 passes end to end: two notes referencing the same missing
title yield one aggregated phantom view; Create and Place
materializes; both tokens bind in one command.

### Out of Scope

Bound/broken/in-trash activation (AI-IMP-048). Any persistence
changes — CreateNote, CreatePin, and the sweep are complete. Location
chooser (EPIC-006).

### Design/Approach

The note pane gains a second mode: `phantom` (titleKey) alongside
`note` (noteId). Activating an unresolved token (click handler from
the AI-IMP-045 plugin) opens the phantom view: would-be title,
grouped references from `getPhantom` (source note + display-text
occurrences; clicking a source opens that note), and two equal-peer
actions — Create Note (`CreateNote`) and Create and Place on Current
Canvas (`CreatePin` with `note:{kind:'create'}` at view center, the
same §6.10 semantics the placement panel uses). First-edit-creates:
the phantom view offers an editable body area; the first committed
burst dispatches CreateNote carrying the typed content, then the pane
swaps to the real note without losing focus. Dismissing without
materializing persists nothing (projection only, invariant 28). After
materialization the project-changed event refreshes open editors'
decorations (sweep effects visible — AI-IMP-045's cache).

### Files to Touch

`apps/desktop/src/renderer/NotePane.svelte`: phantom mode UI + actions.
`apps/desktop/src/renderer/note/note-editor.ts`: pane mode state,
first-edit-creates handoff.
`apps/desktop/src/renderer/note/wiki-link-plugin.ts`: unresolved-token
activation → phantom open.
`apps/desktop/src/renderer/Workspace.svelte`: view-center supplier for
Create and Place.
`apps/desktop/e2e/notes.spec.ts`: slice item 14 scenario.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and
**think**. Have you validated all aspects are **implemented** and
**tested**?
</CRITICAL_RULE>

- [x] Phantom mode renders would-be title, reference count, and
      references grouped by source note from getPhantom; source rows
      navigate to their note.
- [x] Create Note and Create and Place presented as equal peers;
      Create Note yields an open, editable real note; Create and
      Place commits one CreatePin (note+node+appearance+placement)
      and the labeled dot appears at view center.
- [x] First committed edit in the phantom body creates the note with
      that content as one user-level command.
- [x] Dismissing the phantom view persists nothing (assert no new
      records / unchanged project_revision).
- [x] Sweep visibility e2e (slice item 14): same missing title in two
      notes → one phantom view → Create and Place → both tokens
      render bound, one command in the log.
- [x] Gates: full build/test/lint/e2e green.

### Acceptance Criteria

**GIVEN** notes A and B each containing `[[Kestrel]]` with no such note
**WHEN** the user activates either token
**THEN** one phantom view shows both references grouped by source.
**WHEN** the user chooses Create and Place on Current Canvas
**THEN** note, node, appearance, and placement commit as one command
**AND** the tokens in both A and B render bound
**AND** a labeled dot appears at the view center.

**GIVEN** an open phantom view
**WHEN** the user dismisses it without materializing
**THEN** no records persist and project_revision is unchanged.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->
As scoped, with three wiring decisions. (1) Token activation is
Mod+Click (the Obsidian convention — plain click keeps caret
placement for editing); the handler routes by data-link-state, so
IMP-048 plugs bound/trashed/broken into the same seam. (2) Create
and Place crosses panes by event: the note pane dispatches
ew-create-and-place, the Workspace (which owns the active canvas,
gateway, and view center) commits the CreatePin and answers with
ew-open-note — the pane never touches canvas state. (3) The
phantom draft is a plain textarea, not a second CM instance; the
first committed burst (idle debounce or blur) dispatches CreateNote
with the typed body, and the pane swaps to the real editor.
Collision handling on materialization currently surfaces the raw
NOTE_TITLE_CONFLICT message in the pane's error line — IMP-047
replaces that with the §7.7 dialog. Validation note: the decorations
e2e failed its first attempt twice during gate runs (flat 120 s
test-timeout, passes on retry and stays failure-free in content) —
machine was under heavy external load (Spotlight reindex + the
owner's live dev session, load avg ~5); same known class EPIC-010
documented, absorbed by retries:1.
