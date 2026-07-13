---
node_id: AI-IMP-297
tags:
  - IMP-LIST
  - Implementation
  - captions
  - canvas
  - design-adoption
kanban_status: completed
depends_on: []
parent_epic: [[AI-EPIC-029-the-kit-adoption-push]]
confidence_score: 0.8
date_created: 2026-07-12
date_completed: 2026-07-13
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

- [x] Round-1: verify caption rendering path, the crisp-raster
      constraint vs the plaque's shadow, the outline row renderer,
      and the kit's plaque drawing; record corrections here.
- [x] Plaque rendering: cream face, slim frame, shadow, centered
      under the print, narrower than the art; world-scaled with
      the existing fade/raster behavior.
- [x] Pop birth beat on caption creation only; constant recorded
      with the motion constants; no beat on load/edit/undo-redo
      replay.
- [x] Outline placement rows show caption text as one-line display
      meta; no new outline entries; search behavior unchanged.
- [x] ❝ charm per the DS amendment.
- [x] Unit + e2e green; full local gate green with counts read.

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

### Round-1 source verification (2026-07-13)

The committed caption is not rendered by `caption-editor.ts`. That file
is screen-space edit chrome and commits `SetPlacementCaption`
(`renderer/canvas/caption-editor.ts:1-7,95-127`). The board label lives
in `packages/canvas-engine/src/renderers/placement.ts`: its file contract
puts caption ahead of title in the shared world-scaled slot (`:7-20`),
and the existing `placementLabelLayout` / `labelTextResolution` /
`syncLabel` / `syncPlacementLabelOffset` pipeline remains the only
permitted rendering path. Round 2 will add a Pixi `Graphics` plaque
behind the existing `Text`, keeping its current resolution buckets,
wrapping, fade ladder, and offset updates. The layered CSS specimen is
simplified to a vector cream face + slim frame + one soft vector shadow;
no baked or parallel texture pipeline is justified.

There is no `CreateCaption` command. Caption birth is the successful
`SetPlacementCaption` transition from `null` to non-null
(`caption-editor.ts:107-127`). The one-shot pop belongs on that
interactive success path only; edits, load, undo, and redo never emit it.
The charm already exists in `renderer/canvas/charms-ui.ts`; this ticket
only adopts the amended visual.

The outline path in the ticket is wrong:
`renderer/views/OutlineView.svelte` is the shipped surface. More
importantly, its preview transport exposes placement id/canvas/label but
no caption (`renderer/views/outline-data.ts:8-30`), and the row renderer
has no placement-specific meta source (`OutlineView.svelte:565-659`).
**Verdict required before implementation:** per-placement caption meta
requires extending `getOutlinePreview` (a persistence read-model change),
but the wave hard-fences all persistence changes. It cannot be derived
honestly in the renderer, especially for placements on other canvases.
Either authorize the narrow display-only read-model extension (no schema,
no outline/search identity), or defer only this checklist item; round 2
will not smuggle it through a private query or scene probe.

Round-1 ruling initially authorized the narrow `getOutlinePreview`
display-only extension. A second full transport read before code found
that proposal (and therefore the ruling built on it) named the wrong
query: preview data feeds only the separate selected preview pane. Tree
rows are built from `getOutlineTree`, whose `OutlineChildRow` already maps
one placement id. The correction was sent back through the inbox before
either query changed. The implemented seam is the same authorized
capability on that direct projection: one nullable child-row display
field, with no schema, write, FTS/search identity, query proliferation, or
new entry. Plaque and birth-beat rulings stand as proposed.

### Issues Encountered

- The first focused engine run convicted `Text.width`/`height` as a
  browser-canvas dependency unavailable to the headless engine suite.
  Plaque geometry now uses the same deterministic em-cell estimate as
  caption wrapping; no canvas shim or environment carve-out was added.
- RFC rev 0.71 deliberately supersedes AI-IMP-266's old outline-blindness
  assertion. The stale test was rewritten to pin the narrower invariant:
  caption appears only on the existing placement child row, never on a
  canvas/root identity and never as a new row or search key.
- Full `CI=true pnpm check` green: shared-ui 1, commands 19, domain 60,
  protocol 1, canvas-engine 410, persistence 659, desktop unit 557,
  hidden-window e2e 273; eslint and spike typecheck green. The e2e runner
  printed its pre-existing isolated-clone `git main` diagnostic but all
  273 tests completed green.
- The post-verdict query correction was submitted in both the dedicated
  and stable inbox channels; no outbox response had arrived by local gate
  completion. The implementation uses the smaller direct tree projection
  described above and leaves the correction conspicuous for lead review.
