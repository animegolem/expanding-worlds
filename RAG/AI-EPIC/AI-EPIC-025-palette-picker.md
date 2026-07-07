# AI-EPIC
---
node_id: AI-EPIC-025
tags:
  - EPIC
  - AI
  - color
  - tools
date_created: 2026-07-07
date_completed:
kanban_status: backlog
AI_IMP_spawned:
---

# AI-EPIC-025-palette-picker

## Problem Statement/Feature Scope

The first tester's own ask (2026-07-07, verbatim intent): "the tool
I wanted when it comes to color… is a fill-in palette setup… a
small grid you can adjust with like 6 or so gray squares; select a
square, gives you a color picker; you go around the screen picking
colors to fill each square and that's your palette." Today he
builds palettes in CSP's Color Set panel, which he finds finicky,
and the palette lives away from the references it was mixed from.
The board is where the references are — palette building belongs
there, and the result must travel INTO his paint program (.ase).

## Proposed Solution(s)

**Picker-first flow (owner-ratified 2026-07-07).** A top-level dock
tool opens the color picker — chrome: a small working surface with
a color control, an eyedropper, and a strip of fill-in wells
(default ~6, adjustable). The artist plays across the references on
the board filling wells; the eyedropper samples from placed art
(Chromium's EyeDropper API; in-window sampling is the core case,
OS-wide is a build-time feasibility check). **Save** flushes the
built palette to the canvas as a **palette node** — an ordinary
node with a `palette` appearance kind whose content is the ordered
swatch list (title, tags, placements, trash, undo, gallery all free
from being a node; appearance kinds validate in command handlers,
never SQLite CHECK). Activating a placed palette loads it BACK into
the picker to continue working. Exploration is chrome; the saved
artifact is world (§8.2 two-materials doctrine).

**Out the door:** `.ase` export (vendor Color Tool's TS
`palette-ase.ts` — MIT, owner-designed), plus an "Open in…" charm
on placed palettes: write the .ase and hand it to (a) a
user-configured art program (one settings entry), (b) the OS
default handler, or (c) reveal-in-folder for drag-into-anything.
The native OS "choose an app" dialog is platform-specific
(invokable on Windows, LaunchServices on macOS) — feasibility
check at build, not a commitment. NOTE: paint apps differ in .ase
handling (CSP imports color sets via its own dialog, not file
association) — ask the tester how a palette actually enters CSP
before finalizing the affordance.

## Path(s) Not Taken

- Fill-in-place editing on the canvas node (lead's first sketch) —
  superseded by the picker-first flow: authoring lives in one
  chrome surface, the node is the saved artifact.
- A decoration or baked-image palette: palettes are structured,
  editable, re-loadable data — node content, not pixels.
- Deriving palettes from k-means analysis: that is AI-EPIC-024
  (deferred); a "seed palette from analysis" bridge is a natural
  LATER link between the two, not v1.

## Success Metrics

- Build-a-palette loop: dock tool → eyedrop N wells from placed
  references → Save → palette node on the board, in ≤ the CSP
  Color Set effort (tester judgment via HUMAN-TESTING).
- Round-trip: activate a placed palette → picker reopens loaded →
  edit → Save updates the same node (one undoable command per
  save).
- A board-built palette lands in the tester's paint program via
  .ase with colors byte-faithful to the wells.

## Requirements

### Functional Requirements

- [ ] FR-1: `palette` appearance kind + node content schema
      (ordered swatches; hex or oklch at rest — decide with the
      color-fidelity question), commands with inverses (create,
      update-swatches, rename ride existing node commands).
- [ ] FR-2: Canvas rendering of palette placements: swatch
      grid/strip, legible across the shrink ladder (consumes
      EW_FURNITURE_MIN_PX / page-floor semantics).
- [ ] FR-3: Picker chrome on the dock: wells (adjustable count),
      color control, eyedropper (EyeDropper API), Save-as-node.
      The picker always has an ACTIVE palette (owner-ratified
      2026-07-07): opened from a placed palette, that node is the
      target and every pick drops in additively; opened fresh from
      the dock, the target is a new unsaved palette until Save
      flushes it to the canvas.
- [ ] FR-3b: Placed-palette controls (owner-ratified 2026-07-07),
      charm-style like note/frame hints: an export/open-out charm
      (FR-4's trio) and an edit-in-picker charm that loads the
      palette as the picker's active target.
- [ ] FR-4: .ase export (vendored encoder) + "Open in…" charm:
      configured app / OS default / reveal; ATTRIBUTIONS entry for
      vendored code.
- [ ] FR-5: Context-menu verbs per §8.4 grammar (Edit in picker,
      Export .ase, Open in…, Delete) — every verb one undoable
      command where it mutates.

### Non-Functional Requirements

- Two-materials discipline: picker is chrome (motion budget,
  tokens, no raw hex); the node is world (lift/settle beats apply).
- No SQLite CHECK for the appearance kind; content validated in
  command handlers.
- Design inputs pending from the tester (recorded before FR-1
  freezes): well count/growth and layout; swatch labels
  ("skin shadow") yes/no; does the active palette drive draw-tool
  color; .ase IMPORT in v1; how a palette enters CSP in practice.

## Implementation Breakdown

Backlog — IMPs cut when the epic activates (after the tester's
answers land). Rough slices: domain content + appearance kind ·
canvas swatch renderer · picker chrome + eyedropper · .ase export
and Open-in · menu verbs + e2e.
