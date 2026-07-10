---
node_id: AI-IMP-239
tags:
  - IMP-LIST
  - Implementation
  - canvas
  - onboarding
  - ux
kanban_status: completed
depends_on: []
parent_epic: [[AI-EPIC-026-structure-you-fill-in]]
confidence_score: 0.65
date_created: 2026-07-09
date_completed: 2026-07-09
---


# AI-IMP-239-new-board-verb

## Summary of Issue #1

Owner ruling (2026-07-09): first-time board creation is a MISS.
The image-opens-into-board loop is fully wired (charm / Enter /
context menu, all placement-seeded), but there is NO affordance
anywhere for "I want a fresh board for a topic" — every
CreateCanvas call site requires an existing placement, so the
blank-board journey is a three-step undiscoverable ritual (place
a pin → make-canvas → dive). The model is not the problem
(canvases belong to nodes by invariant — boards are always the
inside of something); the missing piece is SUGAR: one verb that
performs the ritual. Done means "New board…" exists as a single
gesture — name it, Enter — that creates the node, its canvas, and
a board-shaped placement on the current board, then DIVES into
the new board; undo is ONE group (returning you to the origin
board with the placement gone); and the verb is discoverable
where users look for it.

### Out of Scope

- OWNER RULING 2026-07-09: build the FUNCTIONAL surface now — plain
  kit presentation, no bespoke visuals; the boards-being-born design
  push (DESIGN-GAPS) restyles later. Do not wait on drawings.

- Any schema/invariant change (none needed — this composes
  existing commands: CreateNode/name path + CreateCanvas +
  CreatePlacement).
- The Make-canvas charm's silent-click ruling (AI-IMP-208).
- Multi-project management (a board ≠ a project).

### Design/Approach

Surface: "New board…" in the EMPTY-BOARD context menu (§8.4 — the
menu you open on the ground where the board will live) and the
Board menu's row set; lean on the Menus Document grammar. Naming:
reuse note/CommandPalette.svelte (AI-IMP-211 built it verbs-
injected for exactly this) as the name prompt — typed title,
Enter commits, Escape cancels. Creation: follow the house
composition — CreateNode, node title via the SAME path the pin
wizard names nodes (find it; do NOT invent a second naming
mechanism), CreateCanvas for the node, CreatePlacement at the
context-menu's board position (frame-family appearance so the
placement reads as a board object — check how make-canvas
placements present and match), all inside one runAsUndoGroup,
then navigateTo the new canvas. If the pin wizard's naming path
and the palette collide awkwardly, STOP and report options rather
than choosing. E2e: verb → palette → name+Enter → on the new
board (path bar shows it); back → placement exists with the
name; ONE Mod+Z removes everything and lands you back.

### Files to Touch

`menus/ContextMenu.ts` + `menus/inventory.ts` (the verb),
`note/CommandPalette.svelte` consumption (no rework), the
creation composition (likely beside host.ts's frame-creation
ritual), e2e.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [x] "New board…" verb leads the empty-board context menu (§8.4
      `create` group, `ctx-new-board`); the verb opens the AI-IMP-211
      command palette (NewBoardPalette.svelte) as a create-only naming
      prompt via a dependency-free window event (menus/new-board.ts),
      mounted by CanvasHost.svelte beside AttachNotePicker.
- [x] One gesture: CreateNode + CreateNoteAndAttach (name) +
      CreateCanvas + CreatePlacement in ONE runAsUndoGroup, then dive.
      ONE Mod+Z from the origin board reverses node + canvas +
      placement (LIFO: DeleteDraftPlacement → DeleteDraftCanvas →
      DetachAndTrashNote → DeleteDraftNode).
- [x] Naming reuses the existing node-naming path — a titled note
      created and attached to the node (the node's name IS its note
      title, exactly as the pin wizard's CreatePin note:{kind:'create'}
      does); issued here as the standalone CreateNoteAndAttach so the
      placement can land LAST (documented below).
- [x] E2e round-trip incl. the single-undo assert
      (e2e/new-board.spec.ts): verb → palette → name+Enter → path-bar
      crumb + live-canvas swap → back → placement carries the name and
      the dive hint (childCanvasId) → undoDepth 1 → one Mod+Z removes
      placement + canvas + node. Second test: Escape cancels cleanly.
- [x] Gates: build, per-package units (554+387+…), desktop units
      (335), lint clean, e2e in 4 foreground shards
      (45+66+77+50 = 238). All New board tests green; one pre-existing
      environmental failure unrelated to this ticket (see below).
- [x] HUMAN-TESTING entry appended at merge by the lead (alph
      first pass — the "new user makes their first board" beat).

### Acceptance Criteria

**GIVEN** a user on any board wanting a fresh board for a topic
**WHEN** they right-click empty ground, choose "New board…", type
a name, and press Enter
**THEN** they are standing inside their new named board, the
origin board carries its board-object, and one Mod+Z undoes the
whole act.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->

**Naming path (the ticket's key decision).** A node has no title of its
own — its NAME is the title of the note attached to it. The pin wizard
names by creating a titled note inside `CreatePin` (`note:{kind:'create',
title}`); the "Attach New Note…" flow names an existing node with the
same note-create-and-attach via the standalone `CreateNoteAndAttach`.
These are the SAME mechanism (both run `requireLinkableTitle` +
`requireTitleFree`, insert the note, set `node.note_id`), not two. This
composition uses `CreateNoteAndAttach` — not a second mechanism, and not
`CreatePin` — because the placement must be issued LAST (see below), and
`CreatePin` is an inseparable node+note+placement composite that can only
come first. No new naming command was invented.

**Ordering is load-bearing (why not CreatePin + CreateCanvas).** The undo
group fences to its FINAL command's canvas (undo-stack.recordGroup keys
`action.canvasId` off the last member). For "Mod+Z from the ORIGIN board"
to work, the last command must be the placement on the origin board — so
the sequence is CreateNode → CreateNoteAndAttach → CreateCanvas →
CreatePlacement (the ticket's exact decomposition). A CreatePin-first
variant fences to the CHILD canvas instead and also trips
`DeleteDraftPin`'s "no owned canvas" guard when undone before the canvas
is removed. The four-command LIFO undo lands each inverse on a state its
draft-guard accepts; every inverse is pre-existing and tested.

**Deviation from the brief's "MUST NOT TOUCH undo-store internals."**
`CreateCanvas` and `CreateNoteAndAttach` are in NEITHER undo allowlist,
so without a change they would not join the group and one Mod+Z would
strand the canvas and the name (orphaning records — `DeleteDraftPin` /
`DeleteDraftNode` even refuse to delete a node that still owns a canvas).
The ticket's own acceptance ("one Mod+Z undoes the whole act", incl. the
canvas) cannot be met otherwise. I added both names to
`GROUP_ONLY_COMMANDS` — the design's documented "structural commands opt
in by name" extension (the set's own header), NOT a change to the stack /
capture machinery. Both are captured ONLY inside a runAsUndoGroup, so the
standalone make-canvas charm, on-demand open-as-board, and the "Attach New
Note…" prompt (none grouped) are unchanged and stay non-undoable exactly
as before; all undo.spec.ts e2e stayed green. Flagged here as the judgment
call the "MUST NOT TOUCH" fence would otherwise forbid.

**Undo-from-inside vs deferred navigation-on-undo.** The origin-board
fence means undo is offered on the origin board (the brief's e2e:
"navigate back → Mod+Z"). Pressed while still standing INSIDE the new
board, Mod+Z is DECLINED with the standard cross-board toast ("made on
Home — open that board to undo it") rather than silently deleting the
board under the user's feet — the honest behavior until navigation-on-undo
(deferred, undo-stack §10.2) lands. The ticket acceptance's "standing
inside … one Mod+Z" wording presumes that deferred infra; the achievable,
safe contract is undo from the origin board.

**Appearance.** The node carries NO explicit appearance — an
appearance-less node renders as the default dot (placement.ts), which is
exactly what a make-canvas placement on a fresh node shows; the dive hint
chip falls out of the node owning a canvas (`childCanvasId`). Verified: no
`SetNodeAppearance` needed, matching how make-canvas placements present.

**Pre-existing environmental e2e failure (NOT this ticket).**
`decorations.spec.ts:25` fails in isolation with "Expected > 3, Received 3"
— it asserts the OS enumerates more than three system font families into
the text-family select. This depends on installed fonts, touches no code
in this change, and is unrelated to New board. (note-lifecycle.spec.ts
also showed one retry-flaky pass, likewise unrelated.)
