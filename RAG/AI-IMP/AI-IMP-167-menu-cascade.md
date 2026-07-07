---
node_id: AI-IMP-167
tags:
  - IMP-LIST
  - Implementation
  - chrome
  - design-pass
kanban_status: completed
depends_on:
parent_epic:
confidence_score: 0.75
date_created: 2026-07-07
date_completed: 2026-07-07
---


# AI-IMP-167-menu-cascade

## Summary of Issue #1

Signature Pin pass decision 06, ratified rev 0.64 §8.2: the CASCADE
is the universal menu grammar. Every menu and popover opens the
same way — rows fade in staggered ~30ms top to bottom, opacity
only, ≤190ms total ease-out, anchored to its opener. Done means
MenuPopover and the ContextMenu family play the cascade on open
(close stays instant/plain), the stagger is a named constant, the
motion is opacity-only (chrome rule), and reduced-motion is
respected if the app ever gains the media query (note the absence,
don't invent a convention).

### Out of Scope

- The bookmark menu's pin BEAT (166); its menu still opens with
  this cascade.
- Any row content/grammar change.

### Design/Approach

One CSS mechanism, defined once (chrome css or a shared class):
rows get `animation: ew-menu-row-in` with
`animation-delay: calc(var(--row-index) * 30ms)`, opacity-only
keyframes, total ≤190ms — cap the effective stagger for LONG menus
(e.g. delay = min(index, 5) * 30ms) so a 20-row menu still lands
inside the budget; note the cap in the ticket. Apply in
MenuPopover.svelte and the ContextMenu DOM builder (rows get
--row-index). One-shot on open only; no close animation beyond the
existing fade. E2E: menu opens, last row reaches opacity 1 within
budget; a replayed open re-runs (fresh mount).

### Files to Touch

`apps/desktop/src/renderer/chrome/MenuPopover.svelte`,
`menus/ContextMenu.ts` (+ its css), a shared keyframes home,
`chrome/beats.ts` constants (EW_MENU_STAGGER_MS 30,
EW_MENU_CASCADE_MS 190).
E2E: context-menus spec extension (opacity poll).

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [x] Cascade on MenuPopover + ContextMenu family, opacity-only,
      named constants, long-menu cap.
- [x] Close unchanged; one-shot per open.
- [x] Gates: `pnpm -r build`, `pnpm -r test`, `pnpm lint`, desktop
      e2e hidden.
- [x] HUMAN-TESTING entry appended at merge by the lead.

### Acceptance Criteria

**GIVEN** any menu or popover
**WHEN** it opens
**THEN** rows fade in top-to-bottom within ≤190ms, opacity only,
and closing is as instant as today.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->

- **One mechanism, one home.** The keyframe (`ew-menu-row-in`, opacity
  0 → `var(--row-rest-opacity, 1)`, ease-out) lives in
  `chrome/menu-cascade.css`; a shared applicator `applyMenuCascade`
  (`chrome/menu-cascade.ts`) stamps each row's `--row-index`, class,
  and per-row `animation-delay`/`animation-duration`. MenuPopover uses
  it via `use:applyMenuCascade`; ContextMenu.ts calls it in `render()`
  and again on each flyout panel (submenus cascade too).
- **Cap = 4 rows; budget math.** delay = `min(index, 4) * 30ms`,
  per-row fade = `EW_MENU_CASCADE_MS - cap*stagger = 190 - 120 = 70ms`.
  The last staggered row starts at 120ms and finishes at exactly 190ms;
  a 20-row menu caps at the same 120ms delay, so it still lands in
  budget. All three numbers are named in `chrome/beats.ts`
  (`EW_MENU_STAGGER_MS` 30, `EW_MENU_CASCADE_MS` 190,
  `EW_MENU_STAGGER_CAP` 4) and the applicator reads them, so the CSS
  never hardcodes timing — no TS/CSS drift.
- **Disabled rows fade to their resting dimness, not to full.** The
  keyframe animates to `var(--row-rest-opacity, 1)`; disabled rows set
  `--row-rest-opacity: 0.45` (MenuPopover `.deferred`, ContextMenu
  disabled buttons) so `fill-mode: both` holds 0.45, never 1. Without
  this, the animation's end value would override the 0.45 resting
  opacity and light disabled rows up.
- **`--ew-` prefix trap avoided (per brief).** All cascade custom
  properties are unprefixed (`--row-index`, `--row-rest-opacity`); the
  theme guard (`theme.test.ts`) only checks `var(--ew-…)` references
  and raw colors, both clean here (opacity-only, no hex/rgba).
- **Interactivity during the fade is preserved** because the motion is
  opacity-only — never `pointer-events`, `visibility`, or `display`.
  An `opacity:0` element still hit-tests, and Playwright treats it as
  visible/clickable, so the existing specs that click rows the instant
  a menu opens (shell.spec `menu-settings`, the context-menu round
  trips) stayed green.
- **Reduced motion:** no app-wide `prefers-reduced-motion` query exists
  yet; noted in `menu-cascade.css` as the home for one when it lands
  (not invented here).
- **Validation:** `pnpm -r build` ✓, `pnpm lint` ✓, `pnpm -r test`
  → 186 passed, 1 flaky (a pre-existing font-family load race in
  `decorations.spec.ts`, unrelated to this change). Targeted
  `playwright test context-menus` → **9 passed** (the 8 existing specs
  + the new cascade spec).
