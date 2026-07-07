---
node_id: AI-IMP-167
tags:
  - IMP-LIST
  - Implementation
  - chrome
  - design-pass
kanban_status: planned
depends_on:
parent_epic:
confidence_score: 0.75
date_created: 2026-07-07
date_completed:
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

- [ ] Cascade on MenuPopover + ContextMenu family, opacity-only,
      named constants, long-menu cap.
- [ ] Close unchanged; one-shot per open.
- [ ] Gates: `pnpm -r build`, `pnpm -r test`, `pnpm lint`, desktop
      e2e hidden.
- [ ] HUMAN-TESTING entry appended at merge by the lead.

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
