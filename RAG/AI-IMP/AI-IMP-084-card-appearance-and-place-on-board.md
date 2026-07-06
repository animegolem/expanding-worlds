---
node_id: AI-IMP-084
tags:
  - IMP-LIST
  - Implementation
  - canvas
  - notes
kanban_status: planned
depends_on: [AI-IMP-083]
parent_epic: [[AI-EPIC-010-hands-on-hardening]]
confidence_score: 0.75
date_created: 2026-07-06
date_completed:
---

# AI-IMP-084-card-appearance-and-place-on-board

## Summary of Issue #1

RFC rev 0.31 closed open question 16: the note card joins dot,
icon, and image as the fourth appearance kind (§4.6) — fixed card
chrome rendering the attached note's title and a clamped body
excerpt, updating with note edits, flat (no shadow — the §8.5
depth cue marks screen-space panels, not world content). Its
primary door is the §8.5 place-on-board control on a note panel:
one command materializes a placement of the panel's node with the
card appearance roughly under the panel, then the panel closes
(one-way, like phantom → note). Done means: cards render on the
board, place-on-board works from a pinned panel, and the mutual
highlight (below) behaves.

### Out of Scope

- Editing inside the card: cards are display; activating one opens
  the ordinary note surface (§4.6). No CodeMirror on the world
  plane.
- Visual identity polish between panel chrome and card chrome —
  owner tabled this for a design pass; ship legible, not final.
- Passive persistent linking indicators: when neither panel nor
  card is active, nothing highlights (owner decision 2026-07-06).
- Markdown rendering in the excerpt (plain text clamp; rich
  rendering is polish).

### Design/Approach

Appearance kind `card` threads through the existing single-default-
appearance model (§4.6, node-owned): persistence accepts
`{ kind: 'card' }` in the SetNodeAppearance union (no payload —
content comes from the attached note via the read model), scene
projection exposes `appearanceKind: 'card'` plus noteTitle/
noteExcerpt on the placement scene item (queries-structure already
joins notes for labels — extend, don't duplicate). The canvas-
engine placement renderer grows a card branch: fixed chrome
(rounded rect, title line, clamped excerpt, theme-token colors
passed the same way existing renderer colors arrive), world-space,
no shadow. Note edits already flow scene refreshes; the card
re-renders from the updated projection. Place-on-board: a control
on the pinned panel commits (a) SetNodeAppearance card if the
node's appearance is currently a dot — icon/image nodes keep their
appearance and the control places them as they are (their look
already represents them) — and (b) CreatePlacement on the active
canvas at the panel's board-projected position, then closes the
panel. Mutual highlight: selecting the card while its note's panel
is open flashes the panel (panels.ts focus flash); an open panel's
source-node halo (§8.5, exists) covers the reverse. A node with
card appearance but no note renders the phantom card state (§7.2
empty chrome).

### Files to Touch

`packages/persistence/src/handlers/nodes.ts`: card in the
appearance union + validation.
`packages/persistence/src/queries-structure.ts`: note excerpt on
placement projection for card nodes.
`packages/canvas-engine/src/types.ts`: appearanceKind + card
fields.
`packages/canvas-engine/src/scene-sync.ts`: projection mapping.
`packages/canvas-engine/src/renderers/placement.ts` (+test): card
render branch; hit box = card rect.
`apps/desktop/src/renderer/note/NotePanel.svelte`: place-on-board
control (pinned panels).
`apps/desktop/src/renderer/note/panels.ts`: close-on-materialize +
flash hook.
`apps/desktop/e2e/`: card + place-on-board scenarios.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and
**think**. Have you validated all aspects are **implemented** and
**tested**?
</CRITICAL_RULE>

- [ ] persistence: SetNodeAppearance accepts `{kind:'card'}`;
      round-trips; units for validation and prior-state undo.
- [ ] queries-structure: placements of card-appearance nodes carry
      noteTitle + clamped excerpt (140ch, match gallery clamp);
      unit.
- [x] canvas-engine: scene item fields + card renderer branch —
      fixed chrome, title, excerpt, no shadow, correct hit box;
      renderer units; note edit → scene refresh repaints card.
- [ ] NotePanel: place-on-board control on pinned panels — dot
      nodes flip to card appearance, icon/image nodes place as-is;
      placement lands at the panel's board position; panel closes.
- [ ] Mutual highlight: selecting a card whose note has an open
      panel flashes that panel; no passive highlight when neither
      is active.
- [ ] Phantom card: card-appearance node with no note renders empty
      card chrome; first committed edit fills it (§7.2).
- [ ] e2e: pin panel → place on board → card visible with note text
      → edit note → card text updates → select card → panel
      flashes.
- [ ] Full gates: `pnpm -r build`, unit suites, desktop e2e, §12.1
      perf, lint.

### Acceptance Criteria

**Scenario:** Artist promotes a working note to board content.
**GIVEN** a pinned note panel over the board
**WHEN** the artist clicks Place on board
**THEN** a placement with card chrome (title + excerpt, no shadow)
appears near where the panel sat, and the panel closes.
**WHEN** the artist edits the note later and returns
**THEN** the card shows the updated text.
**WHEN** the artist clicks the card
**THEN** it selects like any placement (z-order, transforms), and
if its note's panel is open, that panel lights up.
**GIVEN** the node also has a placement on another canvas
**THEN** that placement shows the card appearance too (appearance
is node-owned, §4.6).

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->

**BLOCKER — schema CHECK constraint (needs a lead-owned migration).**
`node.appearance_kind` carries `CHECK (appearance_kind IN ('dot',
'icon', 'image'))` in `migrations/0001-init.ts`. Storing `card` is
impossible without a schema change, migrations are append-only
("never edit an applied migration"), and SQLite cannot ALTER a CHECK
— a new `0006` migration must rebuild the node table (or use the
`writable_schema` rewrite). The node table is FK-referenced by
placement/canvas/tag_assignment, and `PRAGMA foreign_keys` is a
no-op inside a transaction, so the rebuild shape needs care — left
to the lead deliberately (migrations were outside the ticket fence).
VALIDATED: with the one-line CHECK widening applied locally
(reverted before commit), the ENTIRE stack goes green — persistence
410/410, canvas-engine 270/270, desktop unit 36/36, e2e
card-appearance + panels 6/6, build + lint clean. On the committed
branch (constraint intact) the 4 new persistence card tests and the
dot→card e2e fail at the CHECK, exactly as expected. Checklist items
that depend on stored card rows stay unchecked until the migration
lands.

**@ew/commands union not extended.** `NodeAppearance` lives in
`packages/commands/src/payloads/structure.ts` (also outside the
fence; the ticket's Files to Touch placed "the union" in
handlers/nodes.ts, where only validation lives). Shipped a local
`WireNodeAppearance = NodeAppearance | { kind: 'card' }` widening
inside nodes.ts plus one cast on the inverse payload. The proper fix
is one line in the commands union; NotePanel dispatches through the
untyped ProjectPort so nothing else needs it.

**Decisions worth review.**
- Appearance-less nodes (`appearance_kind` NULL) also flip to card
  on place-on-board: a bare stroke circle represents a note no
  better than a dot does. Icon/image place as-is per the ticket.
- Zero-node notes get NO place-on-board control (CreatePin validates
  dot/icon/image and pin.ts was fenced; §6.10's Place on Current
  Canvas already embodies them). The control renders only when the
  note has a node.
- The card suppresses the §4.5 under-label — the chrome's title line
  IS the label; rendering both prints the title twice.
- Unsized card placements read a default 260×160 coalesced in the
  scene projection (mirrored constants in queries-structure and the
  renderer, cross-referenced comments) so hit box = card rect
  without touching hit-test.ts. Renderer lays the chrome out once at
  design size and group-scales onto the rect; title clamps at 28
  chars (deterministic, no canvas text measuring), excerpt collapses
  whitespace so a newline-heavy body cannot overflow the chrome.
- Place-on-board commits TWO commands for dot nodes
  (SetNodeAppearance + CreatePlacement), so §10.2 undo is two steps:
  first undo removes the placement, second restores the dot. A
  one-transaction shape needs a batch/compound command — flagged for
  the lead rather than invented here.
