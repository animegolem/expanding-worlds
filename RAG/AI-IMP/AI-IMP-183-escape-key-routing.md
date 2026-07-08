---
node_id: AI-IMP-183
tags:
  - IMP-LIST
  - Implementation
  - keyboard
  - escape
  - focus
  - bug
kanban_status: planned
depends_on: []
parent_epic:
confidence_score: 0.8
date_created: 2026-07-08
---


# AI-IMP-183-escape-key-routing

## Summary of Issue #1

Systemic family (one ticket) — AI-IMP-173 audit FAMILY 1 (Escape /
global-key routing hygiene). Members: **M-09, M-10, M-24** (bubble-
Escape leaks + host.ts missing typing-target guard, P2/P3),
**M-11, M-12, M-13, M-28, M-29, M-30** (capture-order steals, input-
blocker gap, Mod+[/] guard, P2/P3) + the Codex seed. Root: the canvas
host window keydown gates only on `takeoverActive()` — no typing-target
check — so Escape from a text field or a non-takeover panel leaks
through and clears the canvas selection / drops the active gesture;
menus/panels use inconsistent bubble vs capture and `stopPropagation`
vs `stopImmediatePropagation`; and the big editor isn't a takeover-
family input blocker.

Concrete failures:
- Rename a node's note-panel title, press Escape to discard → the
  canvas selection also empties (`NotePanel.svelte:1159-1162` title
  input, `:1351-1353` phantom draft — neither stops propagation;
  `host.ts:1734-1741` window keydown has no INPUT/TEXTAREA/
  contenteditable guard; `controller.ts:274-291` escape clears
  selection). [M-09]
- Dismiss the LocationChooser with Escape → selection vanishes,
  violating RFC §7.3 ("the dismissal MUST NOT also select or drag
  content underneath it") (`LocationChooser.svelte:21-27`). [M-10]
- Escape leaks through chrome menus BookmarkMenu/MenuPopover/
  TitleStrip/CharmRail to the canvas (`BookmarkMenu.svelte:48`,
  `MenuPopover.svelte:87-90`, `TitleStrip.svelte:90-93`,
  `CharmRail.svelte:74-77`; host `:1734/1754`). [M-24]
- The big editor (§8.5 modal) never `registerInputBlocker`s, so Mod+P
  quick-open opens behind it and steals focus, and Mod+[/] moves the
  board underneath it (`panels.ts:468-481` — no register, unlike
  `crop-editor.ts:170`, `first-run.ts:32`; `navigation.ts:169-180`
  Mod+P guards only `takeoverActive()`, `:159-165` Mod+[/]). [M-11]
- Capture-phase TagPanel/SearchPanel steal a single Escape from the
  bubble-phase big-note editor (`TagPanel.svelte:175-184` capture,
  `SearchPanel.svelte:331-339` capture, `NotePanels.svelte:133-136,:383`
  bubble). [M-12]
- Window-capture panels steal Escape from the right-click context menu
  whose handler is on `document` (`ContextMenu.ts:117-144`, `:423-424`).
  [M-13]
- Two capture-phase panels both close on one Escape (plain
  `stopPropagation`, not `stopImmediatePropagation`). [M-28]
- `registerInputBlocker` overlays don't trigger the tag/search auto-
  close that named takeovers get (`notify()` fires only from
  `openTakeover`/`closeTakeover`, `takeover.ts:27-37,59-68`). [M-29]
- Back/Forward Mod+[ / Mod+] is the one global shortcut here missing
  the typing-target guard its siblings have (`navigation.ts:159-168,:187`;
  guarded siblings `undo-keys.ts:37-44`, `PathBar.svelte:113-137`,
  `Dock.svelte:177-204`). [M-30]

Done means: Escape closes exactly one surface per press without ever
clearing the canvas selection underneath it; Escape inside any text
field never leaks to the board; and Mod+[/] never fires from a focused
input.

### Out of Scope

- The async-open generation races (M-17..M-20/M-25) — AI-IMP-184.
- Same-board bookmark history (M-27) — needs a design ruling.
- CodeMirror/TipTap editor-internal keymaps (RFC §8.2 excludes them).
- Non-Escape gesture-pipeline hardening (M-14/M-15/M-16/M-31/M-32,
  FAMILY 7) — not this ticket.

### Design/Approach

Four coordinated changes, each copying an existing in-repo pattern:

(a) **Root fix — typing-target guard on the host Escape.** Add an
`isTypingTarget` check (INPUT/TEXTAREA/contenteditable) to the host
window keydown at `host.ts:1734/1754`, so a keystroke landing in an
editable never reaches `tools.escape()` / `controller` selection-clear.
`gestures-ui.ts`'s onKeyDown already applies exactly this guard — copy
it. This alone neutralizes M-09's title-rename leak and hardens M-10/
M-24 against any residual leak.

(b) **Consume Escape at the source surfaces.** The four bubble-phase
menus (BookmarkMenu, MenuPopover, TitleStrip, CharmRail) + LocationChooser
+ NotePanel's title-rename and phantom-draft handlers consume Escape
using the capture+`stopPropagation` pattern that `SearchPanel.svelte:328-339`
and the sibling `note/open-note.ts:304`, `canvas/text-entry.ts:145`
(stopPropagation on the first line) already use. This satisfies §7.3 for
the chooser and closes the leaks at each surface.

(c) **Mod+[/] typing-target guard.** Add the `isTypingTarget` guard its
siblings have to the Back/Forward binding (`navigation.ts:187` area /
the keys registry), so it can't fire from inside a focused input/editor.

(d) **Big editor becomes a takeover-family blocker.** Call
`registerInputBlocker` from `openBigEditor` (`panels.ts:468-481`),
matching `crop-editor.ts:170` / `first-run.ts:32`, so Mod+P/Mod+[/]
are suppressed under it. Make `registerInputBlocker` also `notify()`
(M-29, `takeover.ts:27-37,59-68`) so opening the editor auto-closes the
tag/search panels — which removes the M-12 capture-steal by construction
(the panels are gone before the editor's Escape matters).

(e) **Defined layering / peel order.** For the capture-phase collisions
(M-13 menu-vs-panel, M-28 two panels on one Escape), adopt a single
ordered layered-Escape handler as `views/GalleryView.svelte:947` does —
one handler that peels the topmost layer per press. Use
`stopImmediatePropagation` ONLY where the §8.2 peel order demands one-
layer-per-press; elsewhere plain `stopPropagation` is correct. Do NOT
scatter `stopImmediatePropagation` — it is the blunt instrument that
causes M-28.

### Files to Touch

`apps/desktop/src/renderer/canvas/host.ts`: typing-target guard on the
window Escape (`:1734/1754`), copying `gestures-ui.ts`.
`apps/desktop/src/renderer/note/NotePanel.svelte`: consume Escape in
title-rename (`:1159-1162`) + phantom-draft (`:1351-1353`).
`apps/desktop/src/renderer/note/LocationChooser.svelte`: capture+consume
Escape (`:21-27`).
`apps/desktop/src/renderer/chrome/BookmarkMenu.svelte`,
`menus/MenuPopover.svelte`, `chrome/TitleStrip.svelte`,
`canvas/CharmRail.svelte`: consume Escape (bubble→capture+stop).
`apps/desktop/src/renderer/chrome/navigation.ts`: Mod+[/] typing-target
guard (`:187`); Mod+P/Mod+[/] respect the big editor's input-blocker.
`apps/desktop/src/renderer/note/panels.ts`: `registerInputBlocker` from
`openBigEditor` (`:468-481`).
`apps/desktop/src/renderer/chrome/takeover.ts`: `registerInputBlocker`
also `notify()` (`:27-37,59-68`).
`apps/desktop/src/renderer/menus/ContextMenu.ts` + `tags/TagPanel.svelte`
+ `chrome/SearchPanel.svelte`: coordinate one-layer-per-press peel order
(mirror `GalleryView.svelte:947`); `stopImmediatePropagation` only where
§8.2 demands.
`apps/desktop/tests/e2e/*`: Escape-routing e2e per surface.
LOC: ~140–200 across surfaces.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [ ] Host window Escape has an `isTypingTarget` (INPUT/TEXTAREA/
      contenteditable) guard, copying `gestures-ui.ts` (`host.ts:1734/1754`).
- [ ] NotePanel title-rename + phantom-draft consume Escape (capture+
      stop) — canvas selection survives discarding a rename.
- [ ] LocationChooser consumes Escape per §7.3 (capture+stop).
- [ ] BookmarkMenu / MenuPopover / TitleStrip / CharmRail consume
      Escape; it never reaches the canvas.
- [ ] Mod+[/] gains the typing-target guard its siblings have.
- [ ] `openBigEditor` calls `registerInputBlocker`; Mod+P/Mod+[/] are
      suppressed under the editor.
- [ ] `registerInputBlocker` also `notify()`s → opening the editor
      auto-closes tag/search panels (removes the M-12 steal).
- [ ] Capture collisions resolved via one ordered layered-Escape peel
      (mirror `GalleryView.svelte:947`); `stopImmediatePropagation`
      used ONLY where §8.2 peel order requires it.
- [ ] E2e: selection survives Escape-closing each surface (menus,
      chooser, panels); Escape in a text field never clears the board;
      one Escape peels exactly one layer.
- [ ] Gates: `pnpm -r build && pnpm -r test && pnpm lint` + hidden
      e2e (`EW_TEST_HIDDEN_WINDOWS=1`).
- [ ] Append an `RAG/HUMAN-TESTING.md` entry: with nodes selected, open
      and Escape-dismiss each menu/panel/chooser; rename a title and
      Escape; confirm the selection never vanishes and each press peels
      one layer.

### Acceptance Criteria

**Scenario: Escape never clears the board underneath a closing surface.**
**GIVEN** nodes are selected and a menu/panel/chooser is open
**WHEN** the user presses Escape to dismiss it
**THEN** only that surface closes AND the selection is unchanged.

**Scenario: Escape in a text field stays in the field.**
**GIVEN** the user is typing in a note title / phantom draft / any
editable
**WHEN** the user presses Escape
**THEN** the field handles it AND the canvas selection/gesture is
untouched.

**Scenario: one layer per press.**
**GIVEN** two dismissible layers are stacked
**WHEN** the user presses Escape once
**THEN** exactly one layer (the topmost) closes.

**Scenario: quick-open cannot hide behind the big editor.**
**GIVEN** the big editor is open
**WHEN** the user presses Mod+P
**THEN** quick-open does not open behind it (the editor blocks it) and
the board does not move under Mod+[/].

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->
