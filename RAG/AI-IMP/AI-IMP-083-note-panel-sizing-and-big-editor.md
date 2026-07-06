---
node_id: AI-IMP-083
tags:
  - IMP-LIST
  - Implementation
  - notes
  - chrome
kanban_status: planned
depends_on:
parent_epic: [[AI-EPIC-010-hands-on-hardening]]
confidence_score: 0.8
date_created: 2026-07-06
date_completed:
---

# AI-IMP-083-note-panel-sizing-and-big-editor

## Summary of Issue #1

RFC rev 0.31 (§8.5, from owner use): note panels need a size story.
Today a panel is whatever size it is, and editing a note inside a
small on-board card is miserable. Rev 0.31 decides: tethered panels
spawn at one default size (feel constant); pinning detaches into a
user-resizable floating sticky note that keeps its size for its
lifetime; an expand affordance on any panel opens the big editor —
a centered overlay editor over a dimmed board with click-off and a
Done control returning to the prior panel state. Screen-space
panels (tethered and pinned) carry a drop shadow — the §8.5 depth
cue. Done means: all four behaviors live, validated by e2e.

### Out of Scope

- The place-on-board control and the card appearance (AI-IMP-084).
- Persisting panel sizes across sessions (presentation state,
  lifetime = panel lifetime).
- Tethered-panel resizing (only pinned panels resize; the tether
  default is THE size until pinned).
- Any commit-semantics change: §7.1 save rules untouched.

### Design/Approach

Panel records in `note/panels.ts` gain
`size: { width: number; height: number } | null` (null = the
tethered default, a feel constant pair exported beside it). The pin
action initializes `size` from the default; `NotePanel.svelte`
renders a resize grip (corner + edges via CSS `resize` is NOT
enough cross-platform in Electron overlays — use a pointer-driven
grip like ConditionPanel/BookmarkMenu patterns if one exists, else
a small corner-grip handler) only when `pinned`. Minimum size
clamps so the header controls never collapse. The big editor is a
new overlay state in panels.ts (`bigEditor: key | null`, at most
one): NotePanels.svelte mounts a dimmed backdrop + centered editor
reusing the SAME CodeMirror note-editor wiring (the buffer moves,
it is not a second editor instance against the same note — one
buffer per note holds, §7.1). Click on the backdrop or Done returns
to the prior panel; Escape maps to Done. Shadow: screen-space panel
chrome gains a drop shadow via the existing `--ew-shadow` /
`--ew-dialog-shadow` tokens (no raw colors outside theme.css).

### Files to Touch

`apps/desktop/src/renderer/note/panels.ts`: size field, default
constant, big-editor state + open/close.
`apps/desktop/src/renderer/note/NotePanel.svelte`: default size
applied, pinned resize grip, expand button, shadow styling.
`apps/desktop/src/renderer/note/NotePanels.svelte`: big-editor
overlay mount (backdrop, Done, Escape).
`apps/desktop/src/renderer/note/note-editor.ts`: only if buffer
handoff to the overlay needs a hook.
`apps/desktop/src/renderer/theme.css`: only if a new token is
genuinely needed.
`apps/desktop/e2e/notes*.spec.ts`: new scenarios.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and
**think**. Have you validated all aspects are **implemented** and
**tested**?
</CRITICAL_RULE>

- [x] panels.ts: `size` on PanelRecord, DEFAULT_PANEL_SIZE constant,
      pin initializes size; unit-testable pure helpers if any math.
- [x] NotePanel.svelte: tethered renders at default size; pinned
      renders its record size with a resize grip; min-size clamp;
      resizing updates the record (no persistence).
- [x] NotePanel.svelte: expand affordance in the header opens the
      big editor for that panel's note.
- [x] NotePanels.svelte: big-editor overlay — dimmed backdrop,
      centered editor, Done + backdrop-click + Escape all return to
      the prior panel state; at most one big editor.
- [x] Editor buffer moves to the overlay and back without losing
      dirty state; §7.1 commit timing unchanged (typing in the big
      editor commits exactly like the panel).
- [x] Shadow on tethered + pinned panel chrome via existing theme
      tokens; both themes eyeballed.
- [x] e2e: pin a panel, resize it, size holds across pan/navigation;
      expand → type → Done → text present in panel; backdrop click
      closes; Escape closes.
- [x] Full gates: `pnpm -r build`, unit suites, desktop e2e, lint.

### Acceptance Criteria

**Scenario:** Artist works a long note from the board.
**GIVEN** a note opened as a tethered panel
**THEN** it renders at the default size with a drop shadow.
**WHEN** the artist pins it and drags its resize grip
**THEN** the panel resizes and keeps that size while panning and
navigating.
**WHEN** the artist clicks the expand affordance
**THEN** a centered big editor opens over a dimmed board with the
note's current buffer.
**WHEN** the artist types and clicks Done (or the dimmed surround,
or Escape)
**THEN** the overlay closes, the panel shows the edited text, and
saves committed per ordinary §7.1 rules.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->

- Buffer handoff: implemented as `NoteEditorController.reparent()`
  (plus a `focus()` accessor) in note-editor.ts — the sanctioned
  hook. It moves the live `view.dom` between the panel's editor host
  and the overlay container and calls `requestMeasure()`; document,
  CM local history, dirty flag, and the pending autosave timer all
  ride along untouched. The reparent fires a CM blur, which triggers
  the ordinary §7.1 blur flush — same commit path as before, no new
  timing.
- Deviation (small): the expand affordance renders only when a real
  note is loaded (`note && !phantom`). Phantom and pin/canvas-phantom
  drafts are plain `<textarea>`s with no CM buffer to move; expanding
  them has no defined semantics until they materialize.
- Deviation (small): the tethered panel already carried a
  `--ew-shadow` drop shadow from AI-IMP-064, so the depth cue mostly
  existed; this ticket keeps it, deepens the pinned shadow slightly
  (same token), and adds `box-sizing: border-box` so the record size
  IS the rendered size. Both themes verified at the token level
  (light/dark/glass each define `--ew-shadow`/`--ew-dialog-shadow`)
  and via a computed-style e2e assertion, but only in the default
  theme visually — hidden-window e2e cannot eyeball; worth a
  ten-second owner glance in light theme at review.
- The tethered-replacement edge: opening another note while the
  tethered panel's buffer sits in the big editor would have swapped
  the note under the overlay; `setTethered` now closes the big
  editor first (same for `closePanel` on the owning panel).
- Feel constants chosen: DEFAULT_PANEL_SIZE 320×300 (width matches
  the old fixed CSS width), MIN_PANEL_SIZE 240×150 (header controls
  all survive at minimum — e2e-asserted). `clampPanelSize` is the
  exported pure helper; no new unit-test file was added because the
  agent brief's allowed-files list did not include one — the clamp
  is covered by the e2e min-drag assertion instead.
- One e2e flake found and fixed: clicking the backdrop at (20,20)
  via locator was intercepted by the nav-home button (the floating
  chrome layer owns the corners and sits above the panels layer).
  The test now raw-mouse-clicks the left-middle edge of the scrim.
- The old `.note-panel { max-height: 55vh }` and fixed `.cm-editor
  { height: 16rem }` gave content-sized panels; with an explicit
  record size the editor is now `height: 100%` of its flex slot.
  Phantom/uses content inside the fixed-size panel scrolls within
  its existing `overflow: auto` sections.
