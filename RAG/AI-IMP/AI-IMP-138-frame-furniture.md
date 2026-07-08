---
node_id: AI-IMP-138
tags:
  - IMP-LIST
  - Implementation
  - design-pass
  - frames
  - canvas
kanban_status: planned
depends_on: [AI-IMP-133]
parent_epic:
confidence_score: 0.65
date_created: 2026-07-07
date_completed:
---


# AI-IMP-138-frame-furniture

## Summary of Issue #1

The shipped frame is region-only (wash + border). Rev 0.55/§4.9 +
the Style Guide give it FURNITURE: the frame's title renders ON its
top edge in mono (`--ew-frame-label`) — deliberately where an item
label never sits, so the position itself is the tell. The
sort-state control (grid · rows · float ▾; "float" is the visible
off-state) lives in the FRAME'S CHARM BAR, not on the edge —
owner ruling 2026-07-07 ("it has to be in the charm bar"),
resolving the design-queue location question against the drawn
title-row chip. Furniture is zoom-gated by the shrink ladder
(exists only above EW_FURNITURE_MIN_PX-derived threshold; the
region keeps a ≥1px stroke so membership never vanishes). Done
means: a titled frame shows its on-edge label above the threshold,
the selected frame's charm bar carries the sort chip reflecting
and setting the AI-IMP-129 sort state, and nothing renders below
the threshold except the minimum stroke.

### Out of Scope

- (Location call RESOLVED 2026-07-07: charm bar. A follow-on
  conversation is noted in DESIGN-QUEUE on whether deep-nest charm
  clutter ever matters; nothing here waits on it.)
- Frame rename UX beyond what exists (menu row is 137).
- Hover-dim/focus (shipped in 127).

### Design/Approach

Furniture rides the DOM adornment layer (charms-ui pattern — "UI,
not pixels": never in exports/crops), positioned from the frame
placement's screen rect, following the engagement cadence. Title =
the node's title (empty → no label; rename via existing surfaces).
The sort chip joins the CHARM BAR shown for a selected frame
(charms-ui.ts): it reads placement presentation (129's
`frame_sort_on_drop` + a sort-mode fact if 129 stores one; else
chip = On/float toggle + sort-now action matching the Dock's) and
dispatches the same actions as the Dock buttons (no new commands).
Zoom gate via 133's helper applies to the on-edge label; the ≥1px
region stroke is engine-side (placement renderer minimum). The
charm bar follows its own existing visibility rules — the zoom
gate governs edge furniture only.

### Files to Touch

`apps/desktop/src/renderer/canvas/frames-furniture.ts` (new, in
the charms-ui family) + wiring in host adornment refresh.
`packages/canvas-engine/src/renderers/placement.ts`: minimum
stroke at deep zoom (+ unit).
`apps/desktop/e2e/frames.spec.ts`: extend — label+chip visible at
working zoom, gone below threshold (stroke persists), chip
toggles sort-on-drop.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [x] On-edge mono title, tokens only, engagement cadence, never
      in exports (adornment layer).
- [x] Zoom gate via the shared constant; region stroke ≥1px
      always (unit).
- [x] Sort chip in the frame's charm bar reflects + sets sort
      state (same action path as Dock); e2e round-trip.
- [x] Gates: `pnpm -r build`, `pnpm -r test`, `pnpm lint`, desktop
      e2e hidden.
- [ ] HUMAN-TESTING entry appended at merge by the lead (label
      position as the tell; chip legibility on nests).

### Acceptance Criteria

**GIVEN** a titled frame with sort-on-drop on
**THEN** its top edge carries the mono title, and selecting the
frame shows a "grid ▾"-style chip in its charm bar that toggles
the 129 behavior
**AND** below the furniture threshold the label vanishes while the
region keeps a hairline stroke.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->

**On-edge title lives in a new sibling adornment layer**
(`canvas/frames-furniture.ts`, `attachFramesFurniture`), mounted in
`CanvasHost.svelte` beside `attachCharmsUi`. It follows the charms-ui
pattern exactly — a DOM layer over the canvas (`z:Z.affordance`,
`pointer-events:none`), positioned from the camera every rAF the scene
is dirty (camera + `onSceneApplied`), fading on the shared engagement
clock. Being DOM, the export/crop exclusion is structural, not
filtered. The title reads `item.noteTitle` (the field the hint-frame
charm and load-into-frame already treat as the frame's title; empty →
no label), straddles the frame's top edge (`translate(-50%,-50%)` on
the top-center world point) where a §4.5 item label — which hangs
BELOW the body — never sits, and is zoom-gated by
`isFurnitureVisible(min(screenW,screenH))` (the AI-IMP-133 shared
helper, the furniture floor, not zoom %).

**Mono without Maple Mono.** theme.css reserves Maple Mono for note
TEXT only ("never chrome"); the frame title is chrome/furniture, so it
uses the platform monospace stack (`ui-monospace, Menlo, monospace`) —
a font stack literal, not a colour, so the raw-hex/token guards are
unaffected. Ink is the existing `--ew-frame-label` token (already
present in both themes — no theme.css change was needed); a
`--ew-art-chip-scrim-soft` background keeps it legible over content.

**Minimum region stroke is a per-cull re-derive** in
`renderers/placement.ts`. `buildFrameBody` now draws through
`drawFrameRegion(...)` at a floored width, and a new
`syncFrameRegionStroke(object,item,zoom,resources)` — exported and
called from the host's `applyLabelClearance` loop right beside
`syncPlacementIconLod` — re-strokes the region in place when the floor
bites (`frameRegionStrokeWidth = renderStrokeWidth(FRAME_BORDER_WIDTH,
zoom × |scale|)`, reusing the AI-IMP-040 `MIN_STROKE_SCREEN_PX` idiom).
Camera motion runs no renderer update, so this mirrors the icon-LOD
sync; a cached `__frameStrokeWidth` makes it a no-op unless the width
actually changed. Three unit tests in `placement.test.ts` cover the
width math (floor honoured/biting, scale factored), the in-place redraw
+ colour survival, and the non-frame no-op.

**Sort chip landed in the charm bar (charms-ui.ts), same action
path.** The chip shows ONLY when the single selection is a frame
(`appearanceKind === 'frame'`): a divider + a toggle
(`charm-frame-sort-on-drop`) + a sort-now button
(`charm-frame-sort-now`), appended once after the lock button and
shown/hidden by `syncFrameChip(selected)`, called from the layout pass
BEFORE the bar is measured so centering accounts for the chip. To use
the SAME path as the Dock (and context menu), `attachCharmsUi` now
takes the `BoardTooling` handle (passed from `CanvasHost.svelte`, where
tooling is attached before charms): the toggle calls
`tooling.setFrameSortOnDrop`, sort-now calls `tooling.sortFrame`, and
the reflected state is read once per newly-selected frame via
`tooling.frameSortOnDrop`. No new command, no new setting — it drives
AI-IMP-129's existing `frame_sort_on_drop:<placementId>` flag.

**Chip is a toggle, not a 3-way "grid · rows · float" segmented
control — as the brief's fallback directs.** AI-IMP-129 stores ONLY
the boolean `frame_sort_on_drop` (no sort-MODE fact), so per the
Design/Approach's explicit "else" branch the chip is the on/float
toggle plus the Dock's sort-now action: label reads "▦ grid" when ON,
"◇ float" when OFF (the visible off-state). Building the literal
grid-vs-rows dropdown would require a new mode fact + command, which
the brief forbids ("no new commands"); flagged here so a future feel
pass can add the mode fact and promote the toggle to the segmented
form without touching this wiring.

**Charm-bar disposers hazard (noted in the brief) left untouched.**
The per-entry `CharmEntry.disposers` bug is a separate fix; my new
listeners hang off buttons/tooltips that live for the module lifetime,
with tooltip `.destroy` pushed to the module-level `disposers` array
(which IS drained in `destroy`) and click listeners on children removed
with `layer.remove()` — the same lifetime contract every existing bar
button uses.

**Validation (worktree, branch `worktree-agent-af10f4a5e10d0ca9f`):**
- `pnpm -r build` → exit 0 (only pre-existing GalleryView/Outline a11y
  warnings, none in touched files).
- `pnpm -r test` → exit 0. canvas-engine vitest 380/380 (29 files);
  apps/desktop vitest:unit 293/293 (33 files); desktop playwright e2e
  **195/195** (~5.2m, hidden windows). `frames.spec.ts` alone: 3/3,
  including the new "frame furniture …§4.9, AI-IMP-138" round-trip.
- `pnpm lint` → exit 0 (`eslint .` clean).
