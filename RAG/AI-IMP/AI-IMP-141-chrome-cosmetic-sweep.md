---
node_id: AI-IMP-141
tags:
  - IMP-LIST
  - Implementation
  - design-pass
  - chrome
kanban_status: planned
depends_on: [AI-IMP-130]
parent_epic:
confidence_score: 0.85
date_created: 2026-07-07
date_completed:
---


# AI-IMP-141-chrome-cosmetic-sweep

## Summary of Issue #1

The component audit found the shipped DOM chrome nearly identical
to the kit; this ticket closes the small deltas in one pass. Done
means: selection outline reads `--ew-accent` (today a hardcoded
engine color mirroring it), PathBar separator becomes `▸`, the
tooltip chip swaps to the kit's token trio, the charm BAR restyles
to the kit surface (menu surface + shadow, 26px buttons) keeping
its extra appearance button, hint charms trade unicode ¶/⊡ for the
kit's drawn bordered-div shapes, and the toast/action-bar/
recognition-chip confirmations from the audit are asserted (no
change expected).

### Out of Scope

- Frame furniture (138), image bodies (140), paper (134/135).
- Any behavior change — pure presentation; every existing e2e
  stays green with stable testids.

### Design/Approach

Small ordered passes, one commit: (1) engine SELECTION_COLOR reads
the accent token via the resources bridge (both themes; e2e color
assertions updated if any pin exact color). (2) PathBar `/`→`▸`.
(3) tooltip.ts token swap. (4) charms-ui bar restyle per kit
CharmBar (keep appearance button; glyphs stay unicode in the BAR
— the drawn-shape upgrade applies to HINT charms per kit). (5)
hintButton renders the two drawn shapes (page = document with rule
lines; frame = framed box) as bordered divs on tokens, same scrim
chip, same cadence. (6) audit-confirmation asserts only.

### Files to Touch

`packages/canvas-engine/src/` selection color plumbing (+
resources).
`apps/desktop/src/renderer/chrome/PathBar.svelte`,
`chrome/tooltip.ts`.
`apps/desktop/src/renderer/canvas/charms-ui.ts` (bar restyle +
hint shapes).
Touched e2e assertions only where colors/glyphs were pinned.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [ ] Selection = accent token on both themes.
- [ ] PathBar ▸; tooltip token trio; bar restyle with appearance
      button intact.
- [ ] Hint charms drawn shapes, cadence/scrim unchanged.
- [ ] Full e2e green; no testid churn.
- [ ] Gates: `pnpm -r build`, `pnpm -r test`, `pnpm lint`, desktop
      e2e hidden.
- [ ] HUMAN-TESTING entry appended at merge by the lead (hint
      shapes read at a glance vs old glyphs).

### Acceptance Criteria

**GIVEN** the merged sweep
**THEN** every listed surface matches the kit reference on tokens
with zero behavior change and a fully green suite.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->
