---
node_id: AI-IMP-067
tags:
  - IMP-LIST
  - Implementation
  - canvas
  - tools
kanban_status: planned
depends_on: [AI-IMP-059, AI-IMP-064]
parent_epic: [[AI-EPIC-006-shell-and-local-scope]]
confidence_score: 0.8
date_created: 2026-07-05
date_completed:
---

# AI-IMP-067-pin-dock-tool

## Summary of Issue #1

Pin creation happens through the interim Create Pin dialog
(CreatePinDialog.svelte, 459 lines of form). RFC §6.2 (rev 0.20,
closing Q20) replaces it with the pin tool: a dock tool (◉,
shortcut N, sharing the map-pin glyph with the bookmark control —
pins mean places, everywhere). Clicking with the tool places a dot
node with its phantom note already open and focused: the first
committed edit materializes note, node, and placement as one
CreatePin transaction (§7.2 rules); Escape before typing persists
nothing. Icon/image appearances, tags, and note attachment flow
through ordinary node operations afterward, not a creation dialog.
The Create Pin dialog retires. Covers FR-13. Done when the dialog
is deleted and the tool round-trip (place → type → persisted;
place → Esc → nothing) passes e2e.

### Out of Scope

Bookmark control styling (061 owns the shared teardrop glyph;
this ticket reuses it). Changes to CreatePin command semantics
(§6.2's one-transaction backbone is implemented and stays).
AttachNotePicker flows (§6.6, unchanged).

### Design/Approach

◉ joins the dock's tool-mode group (between connector and the
divider, per §8.2 order) with shortcut N and a tooltip. Tool
active + canvas click: render a provisional dot at the click point
in the adornment plane (no domain record) and open a tethered
phantom panel (064) anchored to it, editor focused. First
committed edit fires one CreatePin (nodeId/canvasId/placementId,
dot appearance, note create with typed title/body per the §7.2
title-from-first-line rules already in the editor flow); the
provisional dot swaps for the real placement from the scene event.
Escape (or clicking away with an empty editor) discards panel and
provisional dot — nothing ever existed, matching phantom-panel
semantics. Tool stays active for repeated placement until another
tool is chosen (matching other dock tools' modality). Dialog
retirement: CreatePinDialog.svelte and its title-strip interim
button delete; e2e that drove the dialog (import.spec/slice.spec
paths that used open-create-pin) migrate to the tool or to direct
command calls where the dialog was only a fixture.

### Files to Touch

`apps/desktop/src/renderer/chrome/Dock.svelte`: ◉ tool + N.
`apps/desktop/src/renderer/canvas/pin-tool.ts` (new): provisional
dot + phantom panel orchestration.
`apps/desktop/src/renderer/note/panels.ts`: phantom-anchored-at-
provisional-point support.
`apps/desktop/src/renderer/CreatePinDialog.svelte`: deleted;
title-strip button removed.
`apps/desktop/e2e/` pin coverage in `charms.spec.ts` or new
`pin-tool.spec.ts`; `import.spec.ts`/`slice.spec.ts` fixture
migration off the dialog.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and
**think**. Have you validated all aspects are **implemented** and
**tested**?
</CRITICAL_RULE>

- [ ] ◉ in the dock with shortcut N and tooltip; tool modality
      matches existing tools (active until switched; Esc returns
      to select).
- [ ] Click places provisional dot + focused tethered phantom
      panel; no domain records exist at this point (verify via
      query).
- [ ] First committed edit commits exactly one CreatePin (note
      create + dot node + placement); undo removes all three as
      one user-level transaction.
- [ ] Escape before typing (or click-away with empty editor)
      discards everything; no draft rows remain (DeleteDraft*
      symmetry respected if drafts are used).
- [ ] CreatePinDialog deleted; interim title-strip button gone;
      no orphaned imports; e2e fixtures migrated; `pnpm -r build`
      green.
- [ ] e2e: place-type-persist round trip (reload shows dot with
      visible label = note title), place-Esc-nothing, repeated
      placements in one activation; full gates green
      hidden-window.

### Acceptance Criteria

**GIVEN** the pin tool active (N)
**WHEN** the user clicks the canvas and types "Harbor gate"
**THEN** one CreatePin commits; the dot placement shows the label
and the panel is its tethered note; a single undo removes note,
node, and placement together.

**GIVEN** the pin tool active
**WHEN** the user clicks and presses Escape without typing
**THEN** nothing persisted — no note, node, placement, or draft
rows — and the provisional dot is gone.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->
