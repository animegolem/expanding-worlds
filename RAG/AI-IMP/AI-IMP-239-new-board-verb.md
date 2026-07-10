---
node_id: AI-IMP-239
tags:
  - IMP-LIST
  - Implementation
  - canvas
  - onboarding
  - ux
kanban_status: planned
depends_on: []
parent_epic:
confidence_score: 0.65
date_created: 2026-07-09
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

- [ ] "New board…" verb on the empty-board context menu (+ Board
      menu row if the grammar wants it); palette naming flow.
- [ ] One gesture: node + name + canvas + placed board-object +
      dive; ONE undo group reverses it all.
- [ ] Naming reuses the existing node-naming path (documented).
- [ ] E2e round-trip incl. the single-undo assert.
- [ ] Gates: build, per-package units, lint, e2e in 4+ foreground
      shards.
- [ ] HUMAN-TESTING entry appended at merge by the lead (alph
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
