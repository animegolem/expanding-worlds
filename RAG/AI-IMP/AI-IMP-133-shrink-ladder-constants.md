---
node_id: AI-IMP-133
tags:
  - IMP-LIST
  - Implementation
  - design-pass
  - canvas
  - feel
kanban_status: planned
depends_on:
parent_epic:
confidence_score: 0.8
date_created: 2026-07-07
date_completed:
---


# AI-IMP-133-shrink-ladder-constants

## Summary of Issue #1

Rev 0.55 §8.2 ratifies the shrink ladder: world shrinks honestly,
chrome holds size, furniture exists only above a shared threshold —
governed by exactly two constants, `EW_FURNITURE_MIN_PX` (~8) and
`EW_PAGE_FLOOR_PX` (~48). Today the codebase has scattered
per-element rendered-size conditionals (charm visibility, panel
legibility floor `PANEL_LEGIBILITY_FLOOR`, label rules). Done
means: the two constants exist in one module, every existing
rendered-size conditional references them (or a documented derived
value), and a guard test fails any new magic-number size gate.

### Out of Scope

- New furniture (frame title/sort chip ride 138; page rings ride
  134 — they CONSUME these constants).
- Changing current feel values (map existing behavior onto the
  constants at equivalent values; the feel pass tunes).

### Design/Approach

One module (canvas-engine or renderer feel home — pick by who
imports; likely canvas-engine since renderers gate there) exporting
the two constants + tiny helpers (`isFurnitureVisible(renderedPx)`,
`pageDegradeStage(renderedPx)`). Inventory every rendered-size
conditional (grep px thresholds in charms-ui, feel.ts, placement
renderer, labels) and re-express each as the constant or a
documented ratio of it. The guard: a vitest scanning the renderer +
engine for numeric comparisons against rendered-size variables not
importing the module — pragmatic implementation: a lint-style
source scan for known patterns with an allowlist, mirroring the
raw-hex guard's approach; perfect static analysis is not the bar,
catching drive-by magic numbers is.

### Files to Touch

`packages/canvas-engine/src/shrink-ladder.ts` (new, + test).
Call sites: `charms-ui.ts`, `chrome/feel.ts` consumers,
`renderers/placement.ts`, label/panel floors.
`apps/desktop/src/renderer/` guard test (sibling to theme guard).

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [x] Module + helpers land; existing thresholds mapped at
      behavior-equivalent values (e2e suite green unchanged is the
      proof — 154/154 passed).
- [x] Guard test catches an injected magic size-gate (prove, then
      remove the plant).
- [x] Gates: `pnpm -r build`, `pnpm -r test`, `pnpm lint`, desktop
      e2e hidden. (`pnpm -r test`'s only failure is a PRE-EXISTING,
      fenced z-guard hit already fixed on current main — see Issues.)

### Acceptance Criteria

**GIVEN** the merged branch
**THEN** exactly two shared constants govern furniture/page
thresholds, all prior behavior is unchanged (full e2e green), and
a new magic-number size conditional fails the guard.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->

**Module.** `packages/canvas-engine/src/shrink-ladder.ts` is the single
home: `EW_FURNITURE_MIN_PX = 8`, `EW_PAGE_FLOOR_PX = 48`,
`isFurnitureVisible(renderedPx)` (`renderedPx >= EW_FURNITURE_MIN_PX`,
floor inclusive), and `pageDegradeStage(renderedPx)` →
`full` (≥48, rings) · `degraded` ([8,48), stroke) · `hidden` (<8,
fade whole) — the §8.2 ring→stroke→fade grammar keyed on the same two
boundaries so furniture and page reveal together on one gesture. The
page consumers arrive with EPIC-023; the helper defines the contract
now. Exported through `index.ts`; 6 unit tests.

**Full rendered-size-conditional inventory** (renderer + engine grep for
px thresholds / rendered-size comparisons):

| Site | Old value | Disposition |
|---|---|---|
| `renderers/placement.ts` `syncPlacementIconLod` icon-LOD gate | `ICON_FURNITURE_MIN_PX = 8` | **ABSORBED** → gate now reads `rendered < EW_FURNITURE_MIN_PX`; local const deleted; `placement.test.ts` + `index.ts` re-pointed at the module. Behaviour identical (8). |
| `canvas/charms-ui.ts` hint-charm visibility (`Math.min(screenW,screenH) < CHARM_MIN_SCREEN_PX`) | `CHARM_MIN_SCREEN_PX = 48` (feel.ts) | **ABSORBED (documented tension)** → `CHARM_MIN_SCREEN_PX = EW_PAGE_FLOOR_PX` in feel.ts. Value 48 is behaviour-identical. Charms are §8.2 FURNITURE (nominal home = EW_FURNITURE_MIN_PX ~8), but the shipped gate has always hidden them at the higher ~48 page floor. Reconciling (drop to furniture floor vs. keep at page floor) is a FEEL dial the owner owns — out of scope here; referencing the numerically-equal page floor keeps one source of truth without changing behaviour. |
| `chrome/feel.ts` `PANEL_LEGIBILITY_FLOOR = 0.4` / `PANEL_LEGIBILITY_FADE = 0.2` (tethered note-panel fade) | scale fractions | **DOCUMENTED-RATIO (not forced)** → conceptually the PAGE-floor family (the tethered panel is the bound page made visible), but they gate on effective SCALE, not rendered px, with no clean px equivalence to 48. Left as documented scale fractions per the brief's "fraction-of-default-size → document, don't force" rule. Guard ignores scale gates by design. |
| `chrome/feel.ts` `TITLE_STRIP_REVEAL_PX = 10` | 10 | out-of-scope — screen-fixed pointer reveal band (chrome holds size), not a world rendered-size gate. |
| `decoration-data.ts` `TEXT/STROKE/ARROW_LEGIBLE_SCREEN_PX` (16/2/4) | — | out-of-scope — CREATION-size defaults (`legibleFontSize` computes a world size so a fresh decoration is legible at the creating zoom); no comparison against a rendered-size variable, not a visibility/degrade gate. |
| `stroke-render.ts` `MIN_STROKE_SCREEN_PX = 1` | 1 | out-of-scope — hairline minimum-render-width floor (`max(worldWidth, 1/zoom)`), a different concern from the furniture/page ladder; the stroke never vanishes. |
| `background-grid.ts` `GRID_MAJOR_MIN_PX = 48`, `GRID_MINOR_FADE_START_PX`, `GRID_MAJOR_FULL_PX`, `GRID_MAJOR_EASE_PX` | 48/16/72/160 | out-of-scope — the background grid's own self-contained promotion/fade LOD ramp (its own §, all via named constants, no bare literals), not furniture or bound-page. |
| `snap-provider.ts` `SNAP_ENGAGE/RELEASE_PX`, `snap-guides.ts` `SNAP_GUIDE_*`, `controller.ts` `DRAG_THRESHOLD_PX`, `tools/draw-tools.ts` `MIN_DRAG_SCREEN_PX`, `lens.ts` `LENS_RING_*`, `placement.ts` `SELECTION_OUTLINE_*` / `LABEL_CLEARANCE_PX` / `LABEL_OUTLINE_GAP_PX` | various | out-of-scope — screen-fixed interaction tolerances / overlay geometry (chrome holds screen size), never rendered-world-size gates. |

Note: the two genuine gates (icon LOD, charm visibility) already used
NAMED constants before this ticket, so no bare-literal magic gate
existed to migrate — the guard's value is forward-looking.

**Guard.** `apps/desktop/src/renderer/shrink-ladder-guard.test.ts`
(theme-guard / z-guard style): a source scan over BOTH the renderer and
canvas-engine `*.ts` trees flagging a rendered-size variable
(`rendered`/`screenW`/`screenH`/… — a name list) compared against a
bare numeric literal (`rendered < 8`, `Math.min(screenW,screenH) < 48`).
Named-constant gates and scale-domain fractions pass. Allowlist-with-
reasons is empty today (0 current matches across both trees). Proof:
(1) permanent in-memory detector test asserting planted literals fail
and named/scale/assignment/arrow lines pass; (2) a physical plant
(`__plant_shrink.ts` with `rendered < 8`) — scan reported 1 match, plant
removed, scan back to 0.

**PRE-EXISTING gate caveat (not mine).** During the run `local main`
advanced from my branch point `036ecd26` (the AI-IMP-132 merge I
branched from) to `c5377f79` as AI-IMP-153 (one-voice sweep) merged.
My base commit `036ecd26` carries a PRE-EXISTING z-guard failure —
`menus/ContextMenu.ts:147/244` used bare `z-index:520/521` — which the
newer main **already fixes** (it now uses `Z.popover`). That file is in
the 137/153 fence I must not touch and is unrelated to this ticket, so
`pnpm -r test` reports that one failure on my branch. Everything else
is green; when the lead merges onto current main the z-guard passes.

**Gate results (from worktree root, base `036ecd26`):**
- `pnpm -r build` → success (only pre-existing GalleryView a11y
  warnings, not my files).
- `pnpm -r test` → canvas-engine 348/348 pass (incl. new module + LOD
  test); apps/desktop vitest 136 pass / **1 pre-existing fenced z-guard
  fail** (above). New `shrink-ladder-guard.test.ts` 2/2 pass.
- `pnpm lint` → clean (`eslint .`).
- desktop e2e (hidden, `electron-vite build` + `playwright test`) →
  **154/154 passed** (~4.7m) — behaviour equivalence proven. No flaky
  retries needed.
