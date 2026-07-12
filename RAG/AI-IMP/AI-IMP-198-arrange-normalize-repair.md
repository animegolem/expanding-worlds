---
node_id: AI-IMP-198
tags:
  - IMP-LIST
  - Implementation
  - canvas
  - dock
  - bug
kanban_status: cancelled
depends_on: []
parent_epic:
confidence_score: 0.6
date_created: 2026-07-08
---


# AI-IMP-198-arrange-normalize-repair

> SUPERSEDED (2026-07-12): arrange rides the selection charm bar (kit ruling 7 — one ⌗ charm, grouped popover) and the repair is re-scoped as AI-IMP-291 under AI-EPIC-029, which carries this ticket's align-center defect and cites its PureRef/Figma audit.

## Summary of Issue #1

Owner review FAIL on AI-IMP-128 (2026-07-08): the arrange (reading
order/name/import/area) and normalize (height/width/size/area)
verbs are effectively INVISIBLE — "I don't see any of these
options"; what he found instead was the context menu's align row,
whose behavior is also wrong: "align center… puts them overlapping
in the middle… sorts them in weird shapes." Two threads: (1)
DISCOVERABILITY — the eight Dock buttons shipped as a stopgap
(128's own ticket flagged it) and failed the find test; the verbs
must surface where the owner looked (the multi-select context menu
already has an align family — arrange/normalize belong beside it)
and the Dock stopgap gets retired or clarified in the 189 restyle.
(2) CORRECTNESS — audit ALIGN CENTER/MIDDLE on real mixed
selections: aligning centers COLLAPSES spread items onto one axis
line (them overlapping may be align-semantics working as coded but
failing intent — PureRef/Figma align to the selection bounds axis;
verify ours matches, and that arrange-pack is offered where the
user actually wants "tidy these"). Done means arrange + normalize
are reachable from the multi-select context menu, align semantics
verified against the reference tools (fixes where divergent,
findings where deliberate), and every verb e2e'd from the menu
path.

### Out of Scope

- Dock visual restyle (189 — coordinate on the stopgap's fate).
- New arrangement algorithms (pack behavior itself was accepted at
  128 review; this is reachability + align correctness).

### Design/Approach

Read AI-IMP-128's shipped implementation + the §8.4 menu grammar.
Add an Arrange submenu (or rows) to the multi-select context menu
dispatching the SAME actions as the Dock segment (one action path,
the 138 discipline). Then the align audit: reproduce his
overlap-in-the-middle case (mixed sizes, spread positions, align
center), compare to PureRef/Figma semantics on the same layout,
and record a verdict per verb in Issues Encountered — fix clear
bugs, flag taste divergences for the owner rather than silently
re-designing.

### Files to Touch

`menus/ContextMenu.ts` + `menus/inventory.ts` (multi subject rows),
the align/arrange action seam, e2e: menu-driven arrange +
normalize + align on a seeded mixed selection.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [ ] Arrange + normalize reachable from the multi-select menu,
      same action path as the Dock.
- [ ] Align semantics audit table (ours vs PureRef/Figma) in
      Issues Encountered; bugs fixed, taste calls flagged.
- [ ] Menu-driven e2e for arrange/normalize/align.
- [ ] Gates: `pnpm -r build && pnpm -r test && pnpm lint` + hidden
      e2e.
- [ ] HUMAN-TESTING entry appended at merge by the lead.

### Acceptance Criteria

**GIVEN** a messy multi-selection and a right-click
**THEN** arrange and normalize verbs are present and work
**AND** align center on spread mixed-size items behaves like the
reference tools (or the divergence is a recorded owner decision).

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->
