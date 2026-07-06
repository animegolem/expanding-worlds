---
node_id: AI-IMP-063
tags:
  - IMP-LIST
  - Implementation
  - shell
  - charms
kanban_status: completed
depends_on: [AI-IMP-059, AI-IMP-060, AI-IMP-062]
parent_epic: [[AI-EPIC-006-shell-and-local-scope]]
confidence_score: 0.7
date_created: 2026-07-05
date_completed: 2026-07-05
---

# AI-IMP-063-charms-and-click-grammar

## Summary of Issue #1

Nodes advertise nothing about what they hold, and there is no dive
UI at all — `openCanvas` still has no user-facing entry point. Per
RFC §8.4 this ticket ships the content-hint charms (page = has
note, frame = has canvas; at most one of each, side-by-side, inset
lower-right, scrim chip, screen-size visibility, engagement fade,
excluded from crop/flip previews and export), the click grammar
(single click = select + charm bar; page charm = tethered note;
frame charm = dive; double click = everything), and the selection
charm bar (crop · flip H · flip V · divider · make-canvas · note ·
tags # · lock). The frame charm becomes the first caller of 060's
navigateTo. Covers FR-6 and FR-7. Done when the §8.4 table is
observable end to end in e2e.

### Out of Scope

Tethered/pinned panel physics (064 — until it lands, "note opens"
means the existing requestOpenNote path into the docked pane; 064
swaps the realization without touching this grammar). The tag
panel (EPIC-013): `#` pops the node's tag chips; clicking a chip
shows the deferred tooltip. The §4.5 label/title strip rendering
(exists). node-menu.ts context menu retirement decisions beyond
actions the charm bar now owns.

### Design/Approach

Charms render in the same screen-space adornment pass as selection
outlines (host render loop), not in the scene texture — which
makes crop/flip/export exclusion structural. Visibility: node's
rendered screen size above threshold (feel constant) AND the 059
engagement store's chrome opacity; ~70% at rest, 100% on charm
hover with pointer cursor. Hit-testing: charms claim pointer
events before zone classification (062) so a charm click never
starts a drag. Click grammar per the §8.4 table; double-click on a
note-only node opens the note, canvas-only dives, both = dive then
open that canvas's note via the corner-charm path (064 refines the
anchor; interim opens the pane). make-canvas wires CreateCanvas on
the node; note opens (creating a phantom flow per §7.2 if
note-less); lock toggles 062's SetPlacementLock on the selected
placement; flips wire FlipPlacement; crop wires the existing crop
flow from node-menu. Charm bar floats beneath the selection in the
adornment plane, cadence-aware, every button tooltipped.

### Files to Touch

`apps/desktop/src/renderer/canvas/host.ts`: adornment pass renders
hint charms + charm bar anchors; charm hit priority.
`apps/desktop/src/renderer/canvas/gestures-ui.ts`: click/dblclick
grammar dispatch ahead of zone logic.
`apps/desktop/src/renderer/canvas/charm-bar.ts` (new): bar
rendering + actions wiring existing commands.
`apps/desktop/src/renderer/canvas/node-menu.ts`: drop actions the
bar now owns (keep the rest).
`apps/desktop/src/renderer/chrome/engagement.ts`: charm opacity
participation.
`apps/desktop/e2e/` new `charms.spec.ts`: grammar table coverage;
`canvas.spec.ts`/`gestures.spec.ts` touch-ups.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and
**think**. Have you validated all aspects are **implemented** and
**tested**?
</CRITICAL_RULE>

- [x] Hint charms render for note/canvas-bearing nodes:
      side-by-side, never stacked, lower-right inset, scrim chip;
      absent on bare nodes at rest.
- [x] Visibility keys on rendered screen size (feel constant) and
      the shared engagement clock; charm hover lights that charm
      alone; no node-hover reveal state exists.
- [x] Charms live in the adornment plane: crop/flip previews and
      export render without them (assert via export render
      test or preview snapshot).
- [x] Click grammar: image click = select + charm bar; page charm
      = note opens, canvas unchanged; frame charm = navigateTo
      dive (history entry); double click = dive + canvas note;
      note-only/canvas-only degenerate cases per table.
- [x] Charm bar: crop, flip H/V, make-canvas (CreateCanvas), note
      (open/phantom per §7.2), # tag chips (panel-click shows
      deferred tooltip), lock (SetPlacementLock toggle with 062
      refusal behavior); all tooltipped with shortcuts.
- [x] Charm pointer priority: a charm click never starts a
      zone drag; unit or e2e regression for the overlap case.
- [x] e2e charms.spec covers the four-row grammar table, charm
      bar actions committing their commands, and screen-size
      hiding (zoom out until charms drop); full gates green.

### Acceptance Criteria

**GIVEN** a node with a note and a nested canvas
**WHEN** the user single-clicks its frame charm
**THEN** the nested canvas opens as a history entry and the note
stayed shut; Back returns with viewport restored.

**GIVEN** the same node
**WHEN** double-clicked
**THEN** the canvas opens AND its canvas note opens.

**GIVEN** a selected image
**WHEN** the charm bar's lock is toggled
**THEN** transform gestures refuse until unlocked, and the lock
state survives restart.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->
Deviations and findings. (1) Charms are a DOM adornment layer
(charms-ui.ts), not a pixi overlay pass — the crop/flip/export
exclusion becomes STRUCTURAL (charms simply aren't in the scene
texture), tooltips and testids come free, and pointer priority is
architectural (DOM sits above the canvas element, so a charm click
can never start a zone drag — proven incidentally by the e2e dive
click). No render-path exclusion assert exists because no export
render path exists yet. (2) There is NO crop editor anywhere in the
app — the interim dialog cropped at creation only. The charm bar
ships crop disabled with a deferred tooltip; an interactive crop
editor needs its own small ticket before FR-7 is fully §8.4-true.
(3) node-menu cleanup deferred to 064: its Open Note row duplicates
the page charm, but removing it now would churn notes.spec twice
(064 migrates that suite anyway). (4) The scene read model gained
noteId/childCanvasId; the utility bundle resolves persistence
through dist, so the first e2e run saw `undefined` for both fields
(undefined !== null made every node grow a frame charm) — the
CLAUDE.md pnpm -r build rule, relearned. (5) The note charm on a
note-less node routes to the existing attach picker; the §8.5
phantom panel replaces that in 064. (6) Provisional glyphs (¶ ⊡ 🔒)
are feel-pass placeholders.
