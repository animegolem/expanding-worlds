---
node_id: AI-IMP-295
tags:
  - IMP-LIST
  - Implementation
  - chrome
  - navigation
  - design-adoption
kanban_status: completed
depends_on: [AI-IMP-286]
parent_epic: [[AI-EPIC-029-the-kit-adoption-push]]
confidence_score: 0.7
date_created: 2026-07-12
date_completed: 2026-07-13
---

# AI-IMP-295-identity-corner

## Summary of Issue #1

The identity corner ◎ (kit wireframes 6b, RULED): a lower-left
glyph button — claiming a reserve-identity corner in the frame —
opens the current canvas's SELF: a profile slot (drop / paste /
browse sets the canvas node's face), the node's note excerpt with
✎, and every place its image lives, each row with a ⌖ flight. This
panel IS the canonical "where does this live" surface (the note
panel's ⌖ list defers to it for the canvas's own node). Drop-on-◎
was explicitly rejected — the drop target is the panel's profile
slot only. Done means: ◎ renders in the reserved corner, the panel
opens with kit anatomy, profile drop/paste/browse set the node's
appearance through existing commands, places rows fly per §8.1,
and the note-panel deferral note is honored where it applies.

### Out of Scope

- A charm-bar verb opening the same panel for non-canvas nodes —
  the letter marks it "to be drawn with the note-paper kit"; watch
  for tension, don't build it.
- Any new domain records: the panel reads/writes existing node
  appearance + note + placement queries only.
- The world picker's ◎ faces (already drawn; the picker consumes
  whatever face the node has).

### Design/Approach

◎ is chrome furniture (ChromeLayer) at the frame's lower-left,
glyph-only (the path bar already names the canvas). The panel is
an anchored surface growing from ◎ (one-physics), frame-clamped.
Profile slot: accepts image drop/paste/browse and routes through
the EXISTING import + appearance path for the canvas's node
(round-1 verifies the command sequence: import asset → set node
appearance — reuse, never new commands; if the canvas node's
appearance semantics have any §4.6 wrinkle, flag to the lead).
Note excerpt: read-only clamp + ✎ opening the note panel. Places
list: the §7.4 row grammar against the canvas node's placements;
⌖ rows are §8.1 navigation events. Exits per GR-2 (esc / ✕ /
click-away).

### Files to Touch

`apps/desktop/src/renderer/chrome/IdentityCorner.svelte` + panel:
  new.
`apps/desktop/src/renderer/chrome/ChromeLayer.svelte`: mount.
`apps/desktop/src/renderer/canvas/import-surfaces.ts`: profile
  slot's drop/paste route.
Note panel places-list deferral (round-1 locates the §7.4 list
  owner in note/ and adds the canvas-node deferral only if the
  kit letter's ruling maps cleanly — else flag).
e2e: identity corner open/profile-set/fly spec.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [x] Round-1: verify the wireframe 6b anatomy, the reserve-
      identity corner in the kit's frame drawing, the appearance
      command path for a canvas-owning node, and the §7.4 list
      owner; record corrections here.
- [x] ◎ button at lower-left inside the reservation frame; panel
      grows from it; GR-2 exits; camera untouched by open/close.
- [x] Profile slot: drop + paste + browse set the canvas node's
      face via existing commands, one undo group, with the beat;
      failure speaks (GR-3).
- [x] Note excerpt + ✎ opens the note panel (existing open path).
- [x] Places rows: §7.4 grammar; ⌖ flight is a §8.1 navigation
      event (history entry; regression test).
- [x] Drop-on-◎ itself does nothing (no dead-drop: the button is
      not a drop target and never advertises one).
- [x] Unit + e2e green; full local gate green with counts read.

### Acceptance Criteria

**Scenario:** giving a world its face.
**GIVEN** a canvas whose node has no image
**WHEN** the user opens ◎ and drops an image on the profile slot
**THEN** the node's appearance updates everywhere it renders (home
card, world picker) as one undo group
**AND** the places list shows each placement with a working ⌖
flight that enters history
**AND** esc closes the panel with the board exactly as it was.

### Issues Encountered

- Round-1 correction: no new persistence read model was needed.
  `getCanvasScene` identifies the active canvas owner and the existing
  `getOutlinePreview({ kind: 'node' })` projection already carries its
  face, note excerpt, naming-safe place rows, and placement ids.
- Round-1 correction: the old imperative `corner-charm` in
  `charms-ui.ts` was duplicate lower-left furniture, not a reusable
  shell. It was retired. Its existing empty-world note materialization
  contract remains available through ◎'s ✎ door via `openCornerPanel`;
  the old acceptance tests now exercise the new door.
- The durable profile act is exactly one grouped
  `SetNodeAppearance`; `importAsset` remains the ordinary managed-blob
  ingress. A refused import never opens a group, and a refused command
  fails stop with the sticky import-error surface. Any imported blob
  left by a later command refusal is an ordinary GC-eligible orphan.
- Full-file review found a shared-note interaction: a note may ride
  several nodes, so opening it with a bare note id can make the panel's
  first library row look like the subject. The identity door preserves
  the existing `corner` anchor, and NotePanel prefers the active canvas
  owner for that anchor before deciding to defer Places to ◎.
- Validation: `pnpm check:ci` passed (commands 19/19, domain 60/60,
  shared-ui 1/1, protocol 1/1, canvas-engine 409/409, persistence
  658/658; workspace build, lint, and spike typecheck green). Desktop
  units passed 553/553. Focused identity/legacy acceptance passed 5/5,
  covering browse/drop/paste, one-undo restoration, drop-on-◎ no-op,
  camera-stable GR-2 exit, history-backed place flight, owner-note
  deferral, and the retained empty-world note path. The final nav-wave
  all-shard E2E oracle remains the submission gate shared with 293.
