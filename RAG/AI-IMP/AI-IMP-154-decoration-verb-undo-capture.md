---
node_id: AI-IMP-154
tags:
  - IMP-LIST
  - Implementation
  - undo
  - menus
kanban_status: planned
depends_on:
parent_epic:
confidence_score: 0.75
date_created: 2026-07-07
date_completed:
---


# AI-IMP-154-decoration-verb-undo-capture

## Summary of Issue #1

Codex review on PR #9 (adversarially verified): the §8.4-shipped
decoration context-menu verbs Lock/Unlock and Hide commit
`UpdateDecoration`, which is in neither `CAPTURED_COMMANDS` nor
`GROUP_ONLY_COMMANDS` in `undo/undo-store.ts` — so two ratified menu
verbs change the board without entering Mod+Z, a direct break of the
§8.4 line "every verb is one undoable command." The same review
found the multi-menu "Lock all" only operates on placement ids: on a
mixed selection it silently leaves decorations unlocked, and on a
decoration-only selection an enabled row no-ops. Codex's own triage
of the same round adds the sibling case: "Gather into a frame" is
also always enabled while its handler gathers placements only — a
decoration-only selection gets an actionable row that creates an
EMPTY frame. Done means: menu
(and keyboard) lock/hide of decorations round-trips through Mod+Z as
one entry per gesture, Lock all covers the whole selection it
advertises, and e2e proves both.

### Out of Scope

- Sweeping ALL `UpdateDecoration` traffic into undo. The command is
  also emitted by live style controls (`Dock.svelte`) and text
  commits (`text-entry.ts`); capturing those raw would put one undo
  entry per intermediate style drag on the stack. The undo-breadth
  DESIGN-QUEUE item owns that larger call — this ticket captures
  only the discrete verb gestures.
- `TrashNode` / Delete-frame undo (a §8.4-vs-§9.6 design tension —
  queued for the owner, see DESIGN-QUEUE).

### Design/Approach

The blast-radius problem is that `CAPTURED_COMMANDS` filters by bare
command TYPE, but `UpdateDecoration` is polysemous (style drags vs
discrete verbs). Follow AI-IMP-114's gesture-shaped precedent:
capture at the GESTURE, not the type. Preferred mechanism — the
undo-store already exposes group capture for multi-command gestures
(`runAsUndoGroup`); route the menu/keyboard lock/hide handlers
through an explicit capture call (or a group of size one) instead of
allowlisting the bare type, leaving Dock/text-entry traffic
untouched. Verify the inverse round-trips (the handler already
returns a reciprocal `UpdateDecoration{ set: priorSet }`). For Lock
all: include `decorationIds` via `UpdateDecoration{locked}` inside
the same undo group as the placements' `SetPlacementLock`; disable
the row only when the selection is empty of lockable items. For
Gather: decide at build whether frames can capture decorations
(check CaptureInFrame's contract) — if yes, include them; if no,
the row disables with a reason on decoration-only selections
(§8.4 disabled-with-reason grammar) and gathers the placements
alone on mixed ones.

### Files to Touch

`apps/desktop/src/renderer/undo/undo-store.ts`: explicit-capture
seam (if not already exposed).
`apps/desktop/src/renderer/menus/ContextMenu.ts`: lock/hide verbs
and `lockAll` route through capture; decoration ids join Lock all.
`apps/desktop/src/renderer/canvas/decorations-ui.ts`: keyboard
lock/hide parity.
`apps/desktop/e2e/context-menus.spec.ts` (or undo.spec.ts):
lock → Mod+Z → unlocked; hide → Mod+Z → visible; mixed-selection
Lock all → one Mod+Z frees everything.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [x] Explicit-capture path lands; menu + keyboard decoration
      lock/hide enter undo as one entry per gesture; style-drag and
      text-commit `UpdateDecoration` traffic stays OUT (vitest).
- [x] Lock all covers decorations in the same undo group; row
      disabled only when nothing lockable is selected.
- [x] e2e: decoration lock/hide/Lock-all round-trip through Mod+Z.
- [x] Gates: `pnpm -r build`, `pnpm -r test`, `pnpm lint`, desktop
      e2e hidden.

### Acceptance Criteria

**GIVEN** a board with a decoration selected
**WHEN** the user locks it from the context menu and presses Mod+Z
**THEN** the decoration is unlocked again and undo depth returned to
its prior value
**AND** dragging a style slider in the Dock afterwards adds no undo
entries.

**GIVEN** a mixed selection of two placements and one decoration
**WHEN** the user chooses Lock all and presses Mod+Z once
**THEN** all three items are unlocked.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->

- Mechanism landed exactly as the ticket preferred: `UpdateDecoration`
  joined `GROUP_ONLY_COMMANDS` (never `CAPTURED_COMMANDS`), and every
  discrete verb handler — ContextMenu `setDecorationLock` /
  `hideDecoration`, decorations-ui `setLockedOnSelection` /
  `hideSelection` / `show` (keyboard + hidden-list parity) — wraps its
  commit in `runAsUndoGroup`. A bare UpdateDecoration (Dock style
  drag, text commit) has no open group and is filtered by the standing
  allowlist, so it cannot enter the stack; no new seam was needed.
- CaptureInFrame contract finding: frames capture PLACEMENTS only
  (`memberPlacementIds`; `frame_member.member_placement_id` PK — no
  decoration column). So Gather disables-with-reason on
  decoration-only selections ("frames hold items, not decorations")
  and on mixed selections both the frame's bounding box and the
  capture now use the placement subset (previously the bbox spanned
  decorations the frame could never hold).
- Lock all now takes the whole selection: placements via
  SetPlacementLock (unconditional — its inverse restores prior
  state), decorations via UpdateDecoration{locked:true} skipping
  already-locked ones (their reciprocal inverse would otherwise
  re-lock on undo). One group = one Mod+Z. The row only disables when
  nothing lockable is selected, which a multi-selection cannot reach
  in practice.
- theme.test.ts rejects raw hex literals outside theme.css; the
  vitest's style-drag payload initially used a hex fill and was
  switched to `strokeWidth` (same shape through the seam).
- The undo-store vitest stubs `window` (no jsdom in the desktop
  vitest config) and polls microtasks for `attachUndo`'s async
  gateway bootstrap before emitting notices through a second real
  CommandGateway — the same cross-gateway path production uses.
- e2e additions live in context-menus.spec.ts (three tests): verb
  lock/hide one-undo round-trips plus a real Dock `sel-stroke-width`
  edit asserting depth stays flat; mixed-selection Lock all
  (2 pins + 1 rect) → one undo frees all three; decoration-only multi
  menu shows Gather aria-disabled and Lock all still works.
