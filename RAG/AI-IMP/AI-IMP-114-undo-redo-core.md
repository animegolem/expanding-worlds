---
node_id: AI-IMP-114
tags:
  - IMP-LIST
  - Implementation
  - undo
  - commands
kanban_status: completed
depends_on:
parent_epic: [[AI-EPIC-007-lifecycle-trash-undo]]
confidence_score: 0.75
date_created: 2026-07-06
date_completed: 2026-07-06
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

- [x] onCommitted hook on the gateway, unit-tested, conflict-set
      idiom followed. (Copied the `#conflict` listener-set idiom but
      hoisted to MODULE scope — `onCommittedAnywhere` — because the
      note pane runs its own gateway; see Issues.)
- [x] Stack unit tests: push/undo/redo ordering, inverse:null
      skipped, UNDO_STALE drops with toast, same-canvas fence
      skips-with-toast, project switch clears. (8 tests,
      undo-stack.test.ts.)
- [x] Mod+Z / Shift+Mod+Z work on the board, do NOT fire inside
      CodeMirror or inputs or takeovers; ☰ rows live and
      depth-aware. (e2e: defer test + menu-rows test.)
- [x] Materialization: one undo un-materializes, typed text
      survives as unresolved token (unit at handler level + e2e
      through the phantom flow). A handler fix WAS needed — see
      Issues.
- [x] e2e: move a node → undo restores position → redo reapplies;
      delete-batch → one undo restores all (AI-IMP-028 batch is one
      entry); the §8.5 place-on-board → one undo (086 semantics hold
      through the stack, across gateways); materialization phantom
      flow. (Flip shares the TransformContent/FlipPlacement capture
      path proven by the move+delete tests; not separately scripted.)
- [x] Full gates. (build; canvas-engine 296; persistence 461;
      desktop unit 55; lint clean; undo/panels/notes e2e green.)

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

**Capture had to span gateways (load-bearing deviation).** The core
decision named an instance `onCommitted` hook copying the `#conflict`
idiom. But the note pane runs its OWN `CommandGateway`
(note/project-port.ts, "deliberately independent of the canvas host's
gateway"), and §8.5 place-on-board commits `PlaceAsCard` THROUGH THAT
gateway — invisible to any single instance's hook. Since the brief
also requires place-on-board to enter the stack AND forbids touching
note/**, an instance hook alone cannot satisfy both. Resolution: the
listener-set idiom is copied verbatim but hoisted to MODULE scope
(`onCommittedAnywhere`, exported from @ew/canvas-engine) so one
subscriber sees commits from every gateway. This also reconciles the
brief's own wording — it singles out "note-port UpdateNote autosaves"
as OUT, not all note-port commands, which only makes sense if capture
spans the note port. Documented as friction because a module-level
mutable set in the otherwise instance-pure engine package is a mild
smell; the alternative (reaching into per-pane ports) would have meant
editing note/**.

**Filter is a conservative allowlist, not "everything structural."**
`UpdateNote` returns a NON-null inverse (a body-restore), so "skip
inverse:null" alone would wrongly capture note-body autosaves. Rather
than a denylist, the store uses an explicit allowlist of eight
structural canvas commands (Transform/Flip/Reorder/CreateDecoration/
DeleteContent/CreatePlacement/CreatePin/PlaceAsCard). This is stricter
than §10.2's "structural undo covers all other commands" — notably
`RenameNote` (§10.2 says it is undoable) is NOT captured in v1. Chosen
for predictability on the highest-stakes ticket; growing the allowlist
is a one-line change per future command. Flag for EPIC-007: decide
whether RenameNote and other note-pane structural commands should
join.

**Materialization DID need a handler fix.** Links resolve against
trashed notes too (links.ts: "active AND trashed notes → bound"), so
DeleteDraftPin's existing note-trash left the source token BOUND to a
now-trashed note — not the rev 0.47 "survives as the unresolved token
it began as." Fixed inside the CreatePin/DeleteDraftPin inverse path
ONLY: when it trashes the created note it now reverts every inbound
bound link (target_note_id = createdNoteId) back to `unresolved`,
re-keyed to the note's title (the original raw token text isn't
retained; the title reconstitutes the phantom). New unit in
pin.test.ts proves the round-trip; the display_text becomes the note
title, which is a best-effort reconstruction of the phantom's shown
text.

**Undo re-executes through a DEDICATED gateway, not the host
instance.** "The same gateway" is honored in spirit: the store owns a
`CommandGateway` threading its own observed revision (exactly as the
note pane does), so inverses run with the optimistic check ON and
UNDO_STALE/conflict surface as the "That change can no longer be
undone" toast. This avoids editing Workspace/CanvasHost to expose the
host gateway (both outside this ticket's file list). Capture is
suppressed during undo/redo via an `applying` flag; the tiny async
window where a concurrent user command could be missed from capture is
the standard undo-suppression tradeoff (a keypress-scoped gap).

**V1 same-canvas fence = decline, not skip-forward.** A cross-board
top entry is declined with a board-naming toast and LEFT in place
(still undoable once the user is on that canvas), rather than popped
and skipped over. Navigation-on-undo (§10.2's navigate-and-center) is
deliberately deferred per the brief; declining is the non-destructive
v1. Board name comes from `getOutlineTree` on the rare fence path (no
new query added — persistence stayed inside the materialization fix).

**Not separately scripted in e2e:** flip (shares the capture path with
move/delete, unit-covered by the self-inverting + composite stack
tests) and a live cross-canvas fence run (needs a second board + the
deferred dive UI; the fence is unit-tested). All other checklist e2e
items are green.
