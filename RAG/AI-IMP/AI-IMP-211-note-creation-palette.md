---
node_id: AI-IMP-211
tags:
  - IMP-LIST
  - Implementation
  - notes
  - palette
  - ux
kanban_status: planned
depends_on: []
parent_epic:
confidence_score: 0.7
date_created: 2026-07-09
---


# AI-IMP-211-note-creation-palette

## Summary of Issue #1

Owner review (2026-07-09, v0.16.0): the attach-note chooser
(AttachNotePicker) "feels slightly off" — diagnosis ratified by the
owner: it looks like a command palette but breaks palette grammar.
Typing a new title has NO Enter path (create is click-only), and
creating doesn't open the note (owner had to find the manual
active toggle). Owner's ruling on the shape: **palette grammar
plus a centered, screen-faded presentation** — "fade the screen,
spawn in the middle of the screen, like a command palette when
you're creating it, and then it dumps it under the cursor — or
even attaches it to the cursor and you click to drop it — without
using our animation primitives." Done means: the picker presents
as a true palette (centered, dimmed scrim, keyboard-first); typing
a title that matches nothing surfaces **Create "⟨title⟩"** as the
first highlighted row; Enter commits (create or select); arrows
navigate; Escape cancels; and a committed create ATTACHES the note
and hands it to the user at the cursor (drop-under-cursor or
attach-to-cursor-click-to-place — builder picks the simpler, no
new animation primitives, and states the choice).

### Out of Scope

- The reading-zoom ruling (DESIGN-QUEUE) — where "open" lands
  after creation follows that ruling; until then, place the panel
  via the existing §8.8 clamp at the cursor.
- The pin-wizard vs note-creation UNIFICATION pass (Parking Lot,
  design conversation) — this ticket makes the note picker right;
  the unification decides whether the pin wizard becomes the same
  surface. Build so the palette is reusable (one component, verbs
  injected).
- Mod+P quick-open (§8.3, untouched — but match its keyboard
  grammar exactly).

### Design/Approach

Rework AttachNotePicker: takeover-family scrim (input-blocker per
AI-IMP-183), centered fixed-width palette, search field autofocus.
Rows: matches first; exact-match dedupe; non-empty non-matching
query prepends the Create row (highlighted by default so plain
Enter creates). Keyboard: ↑/↓ move, Enter commits, Escape closes
(compose with 183's Escape routing). Commit-create path:
CreateNote + attach (existing commands), close palette, then the
cursor-drop: simplest honest version = spawn the panel at the
LAST BOARD CURSOR position through the §8.8 clamp (no new
animation). E2e: type-new-title + Enter creates, attaches, panel
up at cursor; arrow+Enter selects existing; Escape layers.

### Files to Touch

`note/AttachNotePicker.svelte` (rework), open-note/panels seam for
spawn-at-cursor, e2e (new palette spec or panels extension).

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [ ] Centered palette with scrim; keyboard-first (arrows, Enter,
      Escape per 183).
- [ ] Create "⟨title⟩" row on non-matching query; Enter creates.
- [ ] Create attaches AND opens at the cursor (choice documented).
- [ ] E2e round-trips for create, select, cancel.
- [ ] Gates: build, per-package units, lint, e2e in 4+ foreground
      shards.
- [ ] HUMAN-TESTING entry appended at merge by the lead.

### Acceptance Criteria

**GIVEN** the note charm on a note-less placement
**WHEN** the user types "Harbor log" and presses Enter
**THEN** the note is created, attached, and open under the cursor
— no mouse required between typing and reading.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->
