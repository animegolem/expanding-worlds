---
node_id: AI-IMP-174
tags:
  - IMP-LIST
  - Implementation
  - chrome
  - shell
kanban_status: planned
depends_on: [AI-IMP-165]
parent_epic:
confidence_score: 0.7
date_created: 2026-07-07
date_completed:
---


# AI-IMP-174-macos-move-resize-chord

## Summary of Issue #1

The frameless shell (165) ships with the title strip as the only
drag handle. Rev 0.64's deferred half — a held chord that moves or
resizes the window from ANYWHERE on it — got its GO 2026-07-07
(owner: wants both move and resize; shortcut budget is fine). This
is a Linux-WM affordance (Super+drag) brought to the frameless
macOS/Windows shell. Done means: holding the chord and dragging
anywhere on the window moves it; the resize variant resizes from
the nearest edge/corner; both feel native (no lag, no canvas
interaction leaking through while chorded), and the bindings print
in the Help/About shortcut listing.

### Out of Scope

- Rebinding UI (fixed chords this ticket).
- Any canvas gesture change — while the chord is held, ALL pointer
  input belongs to the window operation and must not reach the
  canvas (capture-phase guard, same family as board-tooling's
  background-edit capture set).

### Design/Approach

Proposed bindings (feel pass adjudicates; constants named in
chrome/beats.ts-style module so they live once): **Ctrl+Cmd+drag =
move**, **Ctrl+Cmd+Shift+drag = resize** (nearest-corner). Renderer
tracks the chord via keydown/keyup + window blur reset; while
active, a capture-phase pointerdown starts the operation and
consumes everything through pointerup. Move: stream
`win.setPosition` via IPC from pointer deltas (or
`-webkit-app-region` swap if flicker-free — measure both). Resize:
compute nearest corner from the press point, stream `setBounds`.
Cursor communicates the mode while chorded. HUMAN-TESTING entry at
merge (chord comfort, resize grab feel).

### Files to Touch

`apps/desktop/src/renderer/chrome/` (chord tracker module),
`apps/desktop/src/main/` (IPC for setPosition/setBounds),
preload seam, HelpAboutDialog shortcut listing.
E2E: window bounds change under synthesized chord-drag.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [ ] Chord tracker with blur/keyup reset; capture-phase pointer
      ownership while chorded (nothing reaches the canvas).
- [ ] Move streams smoothly; resize from nearest corner.
- [ ] Shortcuts printed in Help/About.
- [ ] Gates: `pnpm -r build`, `pnpm -r test`, `pnpm lint`, desktop
      e2e hidden.
- [ ] HUMAN-TESTING entry appended at merge by the lead.

### Acceptance Criteria

**GIVEN** the chord held anywhere over the window
**WHEN** the user drags
**THEN** the window moves (or resizes from the nearest corner with
Shift), the canvas never sees the gesture, and releasing the chord
returns all input to normal.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->
