---
node_id: AI-IMP-297
tags:
  - IMP-LIST
  - Implementation
  - captions
  - canvas
  - design-adoption
kanban_status: planned
depends_on: []
parent_epic: [[AI-EPIC-029-the-kit-adoption-push]]
confidence_score: 0.8
date_created: 2026-07-12
date_completed:
---

# AI-IMP-297-caption-plaque

## Summary of Issue #1

The caption's visual maturation is ratified (rev 0.71 §4.5 + kit
letter 24/29): the caption renders as THE PLAQUE — cream face in a
slim brushed-metal frame, layered shadow, centered under its print
as an invariant, narrower than the art — with a one-shot POP birth
beat (~280ms, whisper of overshoot; joins the motion ledger). And
the outline amendment: caption text renders as display meta on its
placement's existing row (never an entry, no search identity of
its own). alph's bond test: image + caption read as ONE object.
Done means: captions render as plaques on the board, the birth
beat plays once on creation, outline placement rows show caption
meta, and the ❝ charm sits on the charm bar per the component
amendment.

### Out of Scope

- Caption FTS (deferred with scope).
- The routing dialogue / promote-to-note flow (shipped; unchanged).
- Note-paper postures (AI-IMP-296).

### Design/Approach

The caption renders through the label machinery (§4.5 — world-
scaled, fade ladder, crisp-raster buckets); the plaque is a
restyle of that rendering: face + frame + shadow drawn in the
engine's text/label pipeline (round-1 verifies where caption
rendering lives — canvas/caption-editor.ts + engine label path —
and whether the plaque's chrome fits the crisp-raster bucket
approach; if the layered shadow fights the bucket system, flag
with a proposed simplification, e.g. baked shadow in the plaque
texture). Centered-under-print + narrower-than-art are layout
invariants at label placement time. Birth beat: one-shot pop on
CreateCaption commit only (not on load, not on edit). Outline:
placement rows gain a caption-meta line (display only; clamp one
line; OutlineView's row renderer).

### Files to Touch

`apps/desktop/src/renderer/canvas/caption-editor.ts` + engine
  label rendering path (round-1 enumerates): plaque restyle +
  layout invariants.
`apps/desktop/src/renderer/chrome/beats.ts` / motion constants:
  the pop beat.
`apps/desktop/src/renderer/outline/OutlineView.svelte`: caption
  row meta.
`apps/desktop/src/renderer/canvas/charms-ui.ts`: ❝ charm styling
  per the DS amendment (verify current caption charm in round-1).
e2e/unit: plaque layout + outline meta + one-shot beat.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [ ] Round-1: verify caption rendering path, the crisp-raster
      constraint vs the plaque's shadow, the outline row renderer,
      and the kit's plaque drawing; record corrections here.
- [ ] Plaque rendering: cream face, slim frame, shadow, centered
      under the print, narrower than the art; world-scaled with
      the existing fade/raster behavior.
- [ ] Pop birth beat on caption creation only; constant recorded
      with the motion constants; no beat on load/edit/undo-redo
      replay.
- [ ] Outline placement rows show caption text as one-line display
      meta; no new outline entries; search behavior unchanged.
- [ ] ❝ charm per the DS amendment.
- [ ] Unit + e2e green; full local gate green with counts read.

### Acceptance Criteria

**Scenario:** a caption is born.
**GIVEN** a placed image without a caption
**WHEN** the user adds "cliffs at dawn" via the ❝ charm
**THEN** the plaque appears centered under the print, narrower
than the art, with one pop beat
**AND** reloading the project shows the plaque with no beat.
**Scenario:** telling placements apart.
**GIVEN** one node placed twice with different captions
**WHEN** the user reads the node's placement rows in the outline
**THEN** each row shows its own caption as meta and the outline
gains no new entries.

### Issues Encountered

