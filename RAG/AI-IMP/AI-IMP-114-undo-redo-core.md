---
node_id: AI-IMP-114
tags:
  - IMP-LIST
  - Implementation
  - undo
  - commands
kanban_status: planned
depends_on:
parent_epic: [[AI-EPIC-007-lifecycle-trash-undo]]
confidence_score: 0.75
date_created: 2026-07-06
date_completed:
---

# AI-IMP-114-undo-redo-core

## Summary of Issue #1

Every command handler returns an inverse and NOTHING consumes it —
zero undo surface exists (doc-review blocks-artist headline; §10.2
has the model, EPIC-007 owns it). Done = an in-renderer undo/redo
stack consuming committed canvas-gateway commands, driven by
Mod+Z / Shift+Mod+Z and the ☰ menu's Undo/Redo rows (shipped
disabled by AI-IMP-110 — this flips them live), honoring
UNDO_STALE and the rev 0.47 materialization rule.

### Out of Scope

- Persisted undo across restarts (§10.2: session-only, in-memory).
- Undo for gallery/trash bulk actions (they bypass the canvas
  gateway; recorded as a v2 extension, not silently absorbed).
- Editor TEXT undo (CodeMirror owns it per §10.2's boundary; the
  structural stack must not capture UpdateNote autosaves).
- Cross-canvas navigation-on-undo (v1 fence below).

### Design/Approach

New `apps/desktop/src/renderer/undo/undo-stack.ts`: a per-project
session stack. Capture: add a narrow `onCommitted` listener hook
to `packages/canvas-engine/src/command-gateway.ts` (the same
pattern as its existing #conflict set — this is the ONLY
canvas-engine change) surfacing {commandType, payload, result}
for committed commands; the stack records entries whose
result.inverse is non-null (inverse:null commands are deliberately
non-undoable). Undo pops and re-executes the inverse through the
SAME gateway (checkRevision per the §10.2 rules); a committed
inverse's own inverse (or the original forward command) feeds the
redo stack; redo for internal-composite inverses re-issues the
forward command. UNDO_STALE (or any conflict/error on an inverse):
drop the entry, toast "That change can no longer be undone",
continue — never crash the stack. V1 SAME-CANVAS FENCE: entries
record their canvasId; undoing an entry from another canvas is
skipped-with-toast naming the board (navigation-on-undo is a
design-pass question, deliberately not built). New project =
cleared stack. Drivers: a small module mounted from App.svelte
adds a capture-phase window keydown for Mod+Z / Shift+Mod+Z that
defers to text inputs and CodeMirror focus (the editor keeps its
own history) and to takeovers; MenuPopover's Undo/Redo rows flip
live, enabled-state reflecting stack depth (empty = disabled).
Materialization rule (rev 0.47 §7.2): verify the materializing
command's inverse removes note+binding in ONE user-level step and
the open editor retains the typed text as an unresolved token —
if the handler inverse doesn't already behave so, fix it in
packages/persistence handlers (touch ONLY the materialize/
CreatePin inverse path) with a unit proving it.

### Files to Touch

`packages/canvas-engine/src/command-gateway.ts` (+ test): the
onCommitted hook.
`apps/desktop/src/renderer/undo/undo-stack.ts` (+ unit test): new.
`apps/desktop/src/renderer/undo/undo-keys.ts` (or similar): the
keydown driver, mounted from App.svelte.
`apps/desktop/src/renderer/chrome/MenuPopover.svelte`: rows live.
`packages/persistence/src/handlers/*` + test: ONLY if the
materialization inverse needs the one-step fix.
`apps/desktop/e2e/undo.spec.ts`: new.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and
**think**. Have you validated all aspects are **implemented** and
**tested**?
</CRITICAL_RULE>

- [ ] onCommitted hook on the gateway, unit-tested, conflict-set
      idiom followed.
- [ ] Stack unit tests: push/undo/redo ordering, inverse:null
      skipped, UNDO_STALE drops with toast, same-canvas fence
      skips-with-toast, project switch clears.
- [ ] Mod+Z / Shift+Mod+Z work on the board, do NOT fire inside
      CodeMirror or inputs or takeovers; ☰ rows live and
      depth-aware.
- [ ] Materialization: one undo un-materializes, typed text
      survives as unresolved token (unit at handler level + e2e
      through the phantom flow).
- [ ] e2e: move a node → undo restores position → redo reapplies;
      flip → undo; delete-batch → one undo restores all
      (AI-IMP-028 batch is one entry); the §8.4 place-on-board →
      one undo (086 semantics hold through the stack).
- [ ] Full gates.

### Acceptance Criteria

**GIVEN** a node moved, flipped, and trashed on this board
**WHEN** the artist presses Mod+Z three times
**THEN** each step reverts in reverse order as single steps
**AND** Shift+Mod+Z replays them
**AND** typing in an open note between steps never routes text
history into the structural stack.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->
