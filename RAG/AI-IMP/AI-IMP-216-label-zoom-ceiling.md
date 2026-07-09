---
node_id: AI-IMP-216
tags:
  - IMP-LIST
  - Implementation
  - canvas
  - labels
  - feel
kanban_status: planned
depends_on: []
parent_epic:
confidence_score: 0.7
date_created: 2026-07-09
---


# AI-IMP-216-label-zoom-ceiling

## Summary of Issue #1

Owner Parking Lot flush (2026-07-09, on v0.16.0, screenshot): at
board zoom (~37%) a placement title label ("Beyrl") renders HUGE
relative to its shrunken artwork, dominating the view — "past a
certain readable zoom level titles should no longer be displayed."
Labels keep screen legibility while the world shrinks, so far out
they invert the hierarchy: chrome dwarfing content (the same
doctrine violation 192 just fixed for the charm bar). Done means:
FIRST diagnose and document the label's actual scaling rule
(packages/canvas-engine/src/renderers/placement.ts renders it;
host.ts positions "screen-constant chrome"); THEN labels
fade/hide once their PLACEMENT's rendered size crosses below a
threshold derived from the shrink-ladder family (the 192/133
constants — no new magic numbers), so a label never outweighs the
thing it names. Fade preferred over pop if a cheap opacity ramp is
available in that renderer; either way the transition must not
flicker at the boundary during a zoom glide (hysteresis or the
ladder's existing banding).

### Out of Scope

- Frame titles (187 owns rotated frame adornments).
- Label content/typography.
- The 192 selection dismissal (shipped; this is the label
  sibling).

### Design/Approach

Read the placement renderer's label path and name the current rule
in the ticket (screen-fixed px? clamped world scale?). Gate on the
placement's rendered max edge vs a ladder constant (likely
EW_FURNITURE_MIN_PX is too low for text — labels probably want the
page-floor tier; pick from the EXISTING constants and justify).
Apply at the same point the renderer already receives zoom, so no
new per-frame work. Unit the threshold decision; e2e: zoom out
past the floor → label gone/faded, zoom in → returns (labels are
presentation, not selection — unlike 192, they resurrect).

### Files to Touch

`packages/canvas-engine/src/renderers/placement.ts` (+ shrink-
ladder import), engine unit test, a canvas e2e assert.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [x] Current label scaling rule diagnosed and documented.
- [x] Labels fade/hide below the chosen ladder threshold; return
      on zoom-in; no boundary flicker.
- [x] Threshold from existing constants, choice justified; unit +
      e2e.
- [x] Gates: build, per-package units, lint, e2e in 4+ foreground
      shards.
- [ ] HUMAN-TESTING entry appended at merge by the lead (the
      threshold tier is a feel call — flag it).

### Acceptance Criteria

**GIVEN** a labeled placement and the camera zooming out
**WHEN** the artwork shrinks below the legibility floor
**THEN** its label yields with it — a title never dominates a
board it can no longer describe — and zooming back in restores it.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->

**Current label scaling rule, diagnosed (packages/canvas-engine/src/
renderers/placement.ts):** the label is honest WORLD content, not
screen-constant chrome. `syncLabel` sets `Text.style.fontSize =
labelBasis(item).height * LABEL_HEIGHT_RATIO` (0.14) — a fixed
fraction of the placement's own world-unit height — and the label is
a Pixi child of the placement's Container, so it inherits the
container's `scale` (item.scale) and, being under the world/content
plane, the camera's zoom too. Both the body and the label therefore
shrink at exactly the SAME rate as zoom decreases — the label/body
RATIO never changes. The one thing that IS screen-constant is the
gap between them: `syncPlacementLabelOffset` hangs the label
`LABEL_CLEARANCE_PX / zoom` below the body edge (world units), so the
gap stays a constant few screen px at any zoom (AI-IMP-087) — this is
the "screen-constant chrome" the ticket brief pointed at in host.ts's
comment, but it names the CLEARANCE, not the label's own size. So the
owner's "label renders HUGE" complaint isn't a math bug: a 14%-of-
height label was always proportionally that size. The real problem is
perceptual/legibility — text rendering has a practical floor (hinting
+ anti-aliasing) below which glyphs remain a legible-looking block
while the shrunken artwork around them degrades into an
indistinguishable smear, so a "still crisp text" reading as
disproportionate to "can no longer make out the art" is a doctrine
violation even though the code was never clamping anything (the file
header literally said "no legibility clamping," rev 0.8, — that
guarantee is now revised in this ticket, see below).

**Threshold tier chosen and why:** rather than adding a single hard
cutoff, the label's OPACITY (not its font size — the glyphs keep
shrinking exactly as before) rides the shrink ladder's two EXISTING
constants as a fade envelope: full opacity at/above `EW_PAGE_FLOOR_PX`
(48px rendered) — already documented in shrink-ladder.ts as "the
legibility floor a bound page's affordances need to still read,"
which fits a run of text far better than the furniture floor — down
to fully hidden at/below `EW_FURNITURE_MIN_PX` (8px rendered), where
the ladder already degrades every other consumer (icon LOD, the bound
page) to nothing. This reuses BOTH constants already in the ladder
(no third magic number for a fade width) and gives a continuous ramp
— `labelZoomOpacity` — so a zoom glide crosses the whole band linearly
with no single-frame pop and no flicker at either edge; the ladder's
own two-constant banding stands in for a bespoke hysteresis margin, as
the ticket's "hysteresis or the ladder's existing banding" allowed.
The gate is keyed on the PLACEMENT's own rendered max edge
(`placementRenderedMaxEdge`: `max(width, height) * zoom * |scale|`,
the same "rendered screen size" quantity `syncPlacementIconLod` and
`frameRegionStrokeWidth` already use), not the label's own glyph size,
because the complaint is about the body/label ratio, not the glyphs.

**Changes:** `packages/canvas-engine/src/renderers/placement.ts` —
imported `EW_PAGE_FLOOR_PX` alongside the existing
`EW_FURNITURE_MIN_PX` import; added `placementRenderedMaxEdge` and
`labelZoomOpacity` (both exported, both pure); wired the opacity into
`syncPlacementLabelOffset` (already re-run every cull pass by the
host's `applyLabelClearance`, so the fade responds to a pure zoom
glide with no scene/renderer update needed — mirrors how
`syncPlacementIconLod`/`syncFrameRegionStroke` already piggyback on
that same per-frame call); at opacity 0 also sets `label.visible =
false` (not just alpha 0) so Pixi's bounds walk collapses to a zero
rect — this is what the existing `__ewDebug.labelBounds` e2e/debug
seam already treats as "gone" (label-clearance.spec.ts's existing
poll already tolerated a `{width:0,height:0}` bounds return, so no
new debug hook was needed). Updated the file's header doc comment
(rev 0.8's "no legibility clamping" line) to describe the new rule
instead of contradicting it. `shrink-ladder.ts` untouched — both
constants were already exported.

Unit tests added to `placement.test.ts` (new `describe('label zoom
ceiling (§8.2, AI-IMP-216)')`): `placementRenderedMaxEdge` picks the
larger edge and applies zoom/|scale|, with the DEFAULT_DOT_RADIUS
fallback when width/height/asset size are all null;
`labelZoomOpacity` boundary values at both constants and a monotonic
ramp check across the band (no single-frame jump); an integration
test through `syncPlacementLabelOffset` proving the label fades to
invisible on deep zoom-out and RESURRECTS (same Text child, no
rebuild) on zoom back in — unlike the AI-IMP-192 selection dismissal,
this is presentation, not a "stays gone" state; a mid-band fade
assertion (alpha ≈ 0.5, still `visible: true` — only opacity exactly
0 drops visible); and a no-label no-op/no-crash case. None of the
~15 PRE-EXISTING label tests in that file assert on alpha/visible, so
none needed updates — verified by re-running the full suite (387/387
canvas-engine tests green).

E2E: added one test to `apps/desktop/e2e/label-clearance.spec.ts`
(the file already owned label-geometry e2e coverage; no new spec file
needed) — seeds a 200×200 placement with a note titled "Beyrl" (the
owner's screenshot title), confirms the label reads at zoom 1,
zooms to `EW_FURNITURE_MIN_PX / 2 / 200` (well under the furniture
floor) and polls `labelBounds(id).width === 0`, then zooms back to 1
and confirms the label returns. Imports `EW_FURNITURE_MIN_PX` from
`@ew/canvas-engine` rather than a bare literal, matching the sibling
`object-icons.spec.ts` LOD test's idiom.

**Friction / things noticed beyond the brief (reporting, not
fixing):** `hit-test.ts`'s `adornedWorldAABB` (used by the AI-IMP-161
charm bar to clear the label) calls `placementLabelWorldBottom(item,
zoom)`, which is a PURE function of the `ScenePlacement` item and
reflects only `hasUnderBodyLabel` (title/visibility/card/flipY) — it
does not know about the new opacity gate, so it keeps reserving the
label's clearance space even once the label has faded to nothing at
board zoom. In practice this is very likely harmless: the charm bar
itself is furniture and is already zoom-gated off well before a
placement gets anywhere near the furniture floor, so the two zoomed-
out states (label gone, charm bar gone) should already coincide in
every realistic case I could construct. But I did not verify there is
no gap between "label opacity hits 0" and "charm bar disappears" for
an oddly-proportioned placement (e.g. very tall and narrow, where
`placementRenderedMaxEdge`'s max-edge gate and the charm bar's own
gate might disagree), and `hit-test.ts` was out of my touch scope, so
I'm flagging it rather than changing it. A future ticket could either
thread the same ladder gate through `placementLabelWorldBottom` or
just confirm by inspection that the charm bar's own furniture gate is
always at least as conservative as the label's page-floor-anchored
one.

No blockers; nothing failed to implement; no missing tests beyond the
above.
