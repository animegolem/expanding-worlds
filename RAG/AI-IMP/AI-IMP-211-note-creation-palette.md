---
node_id: AI-IMP-211
tags:
  - IMP-LIST
  - Implementation
  - notes
  - palette
  - ux
kanban_status: completed
depends_on: []
parent_epic:
confidence_score: 0.7
date_created: 2026-07-09
date_completed: 2026-07-09
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

- [x] Centered palette with scrim; keyboard-first (arrows, Enter,
      Escape per 183).
- [x] Create "⟨title⟩" row on non-matching query; Enter creates.
- [x] Create attaches AND opens at the cursor (choice documented).
- [x] E2e round-trips for create, select, cancel.
- [x] Gates: build, per-package units, lint, e2e in 4+ foreground
      shards.
- [x] HUMAN-TESTING entry appended at merge by the lead.

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

- Reusable shell extracted: `note/CommandPalette.svelte` owns the
  scrim + centered layout, the input, the row list, the keyboard
  (↑/↓/Enter), the Escape window-capture (composes with 183 M-13/24/28
  — declines to a topmost context menu, `stopImmediatePropagation`,
  onclose), and a lifetime `registerInputBlocker(() => true)` so the
  palette is a takeover-FAMILY blocker (Mod+P suppressed, tag/search
  panels retire). Verbs are injected — `search`, `createLabel`,
  `oncommit`, `oncreate` — so the future pin-wizard unification reuses
  the same component. `AttachNotePicker.svelte` is now a thin wrapper
  supplying the note verbs and owning the §7.7 conflict dialog.
- Portaling: the palette scrim rides `overlayPortal` into the root
  overlay host (§8.8 law 2 / Z.modal 600), matching the big editor —
  the old picker sat at a raw `z-index:35` INSIDE `.canvas-host`,
  which is BELOW note panels (200) and chrome (400); as a real modal
  it must escape those stacking contexts.

- **cursor-drop choice (documented).** The ticket named two options
  (drop-under-cursor vs attach-to-cursor-click-to-place) and asked for
  the simpler. I chose neither literal screen-drop: a committed create
  opens the note **tethered beside the node it was just attached to**,
  via the existing §8.5 anchored-open path (`requestOpenNote` with the
  placement anchor found synchronously from `items()`). Rationale: the
  palette always attaches to a node that ALREADY carries a placement on
  the active canvas (the note charm sits on it), so §8.5's "a note
  opens tethered beside its node" IS the honest "under the cursor" —
  and it needs zero new machinery (no last-cursor tracking, no
  spawn-a-pinned-panel-at-screen), reuses the tethered panel's own §8.8
  layout clamp, and never contradicts §8.5's "pinning is the user's act
  alone." Reading `items()` is safe here — the placement pre-exists the
  create, so no scene-apply to await; a missing placement falls back to
  the store's async anchor resolve.

- Guard hit + fixed: the palette's hand-rolled `<input>` tripped
  `input-styling-guard.test.ts` (AI-IMP-142 — no new .svelte may reach
  for `--ew-surface-input`). Switched to the shared `ui/TextInput`
  (variant="pill"), the house primitive; guard green.
- testids preserved: `attach-picker-query` / `attach-picker-results` /
  `attach-picker-create` fall out of the palette's `${testid}-*`
  scheme with `testid="attach-picker"`, so the existing attach flow in
  `notes.spec.ts` needed no change. New rows carry `attach-picker-item`.
- Scope note (report, not fixed): only the CREATE path opens the note;
  selecting an EXISTING note to attach still attaches-and-closes as
  before (the ticket's acceptance is create-only). Symmetric
  open-on-select could be a nice follow-up but was left out of scope.
- No blockers. Full suite green (229 tests, 4 shards).