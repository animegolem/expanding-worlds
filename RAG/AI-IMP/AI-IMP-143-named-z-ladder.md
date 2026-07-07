---
node_id: AI-IMP-143
tags:
  - IMP-LIST
  - Implementation
  - design-pass
  - chrome
  - hygiene
kanban_status: planned
depends_on: [AI-IMP-130]
parent_epic:
confidence_score: 0.75
date_created: 2026-07-07
date_completed:
---


# AI-IMP-143-named-z-ladder

## Summary of Issue #1

Rev 0.55 names the §8.8 z-ladder (world 0 → tooltip 800) and the
audit found 7 unordered literals in the renderer (incl. tooltip at
1000 vs the named 800, place-ghost at 480). Done means: every
z-index in the renderer references the named ladder (130's Z
module) — intra-overlay stacking contexts may use small locals but
must document their rung — and a guard fails new literal z-indexes.

### Out of Scope

- Changing stacking BEHAVIOR: each site maps to the rung §8.8
  already assigns it; any observed reorder is a bug to fix, not a
  redesign.
- DOM vs canvas layering (unchanged).

### Design/Approach

Map the 7 sites (charms-ui 1/6, pin-tool 7, open-note 25,
node-menu 30, place-mode 480, tooltip 1000) onto rungs: tooltip →
Z.tooltip; node-menu → Z.popover; place-ghost → Z.chrome-adjacent
(assign per §8.8 order and verify visually via e2e overlap
scenarios — ghost must ride above panels, below modals); locals
inside one absolutely-positioned parent may stay small ints with a
`// rung:` comment. Guard: source scan for `z-index:` literals
outside the module/comment convention (theme-guard style). E2E:
the shipped occlusion tests must stay green; add one
tooltip-over-modal assertion since tooltip's value changes.

### Files to Touch

The 7 sites; `z.ts` consumers; a guard test; occlusion e2e
extension.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [ ] All 7 sites on the ladder (or documented locals); no
      literal z remains unguarded.
- [ ] Occlusion e2e green + tooltip-over-modal added; place-ghost
      layering visually verified in an overlap e2e.
- [ ] Guard proves on a plant.
- [ ] Gates: `pnpm -r build`, `pnpm -r test`, `pnpm lint`, desktop
      e2e hidden.

### Acceptance Criteria

**GIVEN** the merged branch
**THEN** the renderer's stacking derives from the named ladder,
behavior is unchanged (occlusion suite green), and a new literal
z-index fails the guard.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->
