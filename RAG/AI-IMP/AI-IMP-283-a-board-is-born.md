---
node_id: AI-IMP-283
tags:
  - IMP-LIST
  - Implementation
  - renderer
  - lifecycle-push
kanban_status: completed
depends_on: []
parent_epic:
confidence_score: 0.8
date_created: 2026-07-11
date_completed: 2026-07-12
---

# AI-IMP-283-a-board-is-born

## Summary of Issue #1

B1 (ratified flagship, lifecycles-1.1 → "B1 A Board Is Born" — THE
NORMATIVE SPEC; rev 0.70 §10.2 records its undo exception): one
birth, two doors, one ending — you're inside. Door 1 ("New
board…", AI-IMP-239's shipped four-command group) and door 2 (the
make-canvas charm) currently END DIFFERENTLY: 239 dives, the charm
is nearly silent (hint chip, no dive) and its already-a-board state
is native-disabled with no voice (charms-ui.ts ~:1091-1092). The
ruled deltas: (1) MAKE-CANVAS DIVES on success like door 1 — the
hint-chip-only ending retires; both doors share the identical
flight: a camera zoom INTO the object until it fills and fades,
one continuous 240ms ease-out (navigateTo is the one flight path),
never a crossfade; back travels as a plain settle. (2)
ALREADY-A-BOARD goes INERT with the why-tooltip ("already a board —
dive with its frame charm"), crop's card-button idiom
(~:595-607) — native disabled without a voice retires everywhere
in the bar. (3) DOOR 1 GAINS THE CARRY: Enter in the naming
palette no longer places directly — it hands the newborn
board-object to the cursor (S4 place mode REUSED, not a new
grammar); the seating click fires the placement and closes the
undo group; Escape mid-carry unmakes the whole birth (GR-2 R3 —
nothing provisional survives). The placed object stays an ordinary
node ("Swap for…" can re-face it later; the board underneath
survives). (4) ⊡ is the birth glyph in both doors (shipped in the
palette; verify). (5) R6: one ⌘Z unmakes the birth; if standing
INSIDE the unmade board, the camera flies back to the origin
first, then it unmakes — the rev 0.70 §10.2 scoped exception to
decline-in-place (the only navigating undo). Arrival: the path
grows a crumb, the path-tail pin rests unpinned, an empty newborn
board says nothing.

### Out of Scope

- The board-object's eventual FACE (N1's caption card owns it).
- Covers / launcher (separate ruled cluster).
- Charm-bar order (ratified as shipped: ⬚ ⇋ ⇵ | ◑ ⊡ ¶ # ⊘).
- Any naming-palette anatomy change beyond the carry handoff.

### Design/Approach

Make-canvas: on committed success, run the same navigateTo flight
door 1 uses; delete the hint-chip ending. Inert idiom: swap
native `disabled` for the card-button pattern + tooltip. The
carry: NewBoardPalette's Enter path defers CreatePlacement — the
first three commands commit (or stage — round 1 verifies what the
shipped group composition allows without breaking
placement-last fencing), place mode receives the node, the seat
click completes the group; Escape mid-carry rolls back the birth
commands as one inverse (verify the cleanest seam: either delay
all four into one group closed at seat, or compose
carry-abandon as the group's inverse — round 1 proposes, the
verdict rules). R6 fly-back: undo coordinator detects the
birth-group inverse targeting the ACTIVE canvas's own records →
navigate to origin, then apply; silent per GR-3 class 7.

### Files to Touch

- `apps/desktop/src/renderer/canvas/charms-ui.ts` (dive + inert
  idiom)
- `apps/desktop/src/renderer/chrome/NewBoardPalette.svelte` (the
  carry handoff)
- place-mode seam (S4 reuse; round 1 locates)
- `apps/desktop/src/renderer/undo/` (the R6 birth-group
  exception — narrow, typed to the birth group only)
- `apps/desktop/src/renderer/chrome/navigation.ts` (flight reuse
  only; no new flight code)
- e2e: both doors end inside; already-a-board inert + tooltip;
  carry seat completes one undo group; Escape mid-carry leaves
  nothing; ⌘Z inside the newborn flies back then unmakes.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [x] Make-canvas dives on success; hint-chip ending removed;
      flight identical to door 1 (240ms, through the object).
- [x] Already-a-board renders inert with the why-tooltip (card-
      button idiom); no native-disabled remains in the bar.
- [x] Door 1 carry: Enter → cursor; seat click completes the
      four-command group; the newborn is swappable afterwards.
- [x] Escape mid-carry unmakes the whole birth; nothing
      provisional survives (pinned).
- [x] R6: undoing the birth while inside flies back to origin
      first, then unmakes, silently; undoing from the origin
      just unmakes; both one ⌘Z.
- [x] Full `CI=true pnpm check` green (pipefail, counts read);
      CHANGELOG [Unreleased]; HUMAN-TESTING entry (the flight
      feel, the carry, the fly-back).

### Acceptance Criteria

**GIVEN** either birth door
**WHEN** the birth succeeds
**THEN** the user is standing inside the new board via the same
240ms through-the-object flight, the path shows the new crumb,
and nothing else announces

**GIVEN** the carry in flight
**WHEN** Escape is pressed
**THEN** no node, note, canvas, or placement from the birth
survives

**GIVEN** ⌘Z immediately after a birth, standing inside it
**THEN** the camera returns to the origin board and the birth
unmakes as one entry.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->

- Round-1 ruling: `runAsUndoGroup` finalizes in `finally` and has no abort
  primitive; CreateNoteAndAttach's inverse deliberately trashes. Birth
  therefore delays all durable commands until seating. Escape drops only
  renderer memory and literally nothing survives.
- S4 is `renderer/canvas/place-mode.ts`; it now has a narrow board-birth
  request variant while the gallery pull path remains unchanged.
- A refused seat rolls back any captured prefix through a birth-only
  fail-stop seam, clears its redo receipt, keeps the ghost, and reports
  inline. Birth metadata is the sole navigate-before-undo exception.
