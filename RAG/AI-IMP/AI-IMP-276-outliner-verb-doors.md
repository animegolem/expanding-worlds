---
node_id: AI-IMP-276
tags:
  - IMP-LIST
  - Implementation
  - renderer
  - outline
  - menus
kanban_status: planned
depends_on: [AI-IMP-274, AI-IMP-275]
parent_epic: [[AI-EPIC-028-the-outliner-control-panel]]
confidence_score: 0.7
date_created: 2026-07-10
date_completed:
---


# AI-IMP-276-outliner-verb-doors

## Summary of Issue #1

Outliner Grammar §7: ONE verb inventory through THREE doors — the
preview's verb row (275), the ROW CONTEXT MENU
(right-click/long-press), and the KEYBOARD — no door offers a
verb another lacks. The inventory: dive · place · fly to · open
note / add a note… · tag… · move to trash. Plus §9's touch
dialect metrics behind the kit's touchMode shape. Done means: a
grammar-parity test can enumerate the three doors' inventories
and assert equality per row kind, trash routes ONLY shipped
commands (TrashNote for loose notes — the 260 path; TrashNode
for placed node rows per §9.6 with its standard impact notice),
and the keyboard map matches the kit's teaching line (↵ dive ·
␣ place · tab folds · esc returns).

### Out of Scope

- New commands or lifecycle semantics (shipped verbs only).
- The iPad portrait bottom sheet (V2 shell work; the kit draws
  it, this ticket ships pointer + touch-metrics only).
- Menu grammar changes (menus/inventory.ts rules apply as-is).

### Design/Approach

Row context menu via the shared menu machinery (MenuPopover
pattern; the §16 grammar — verbs only, destructive last alone,
shortcuts in mono, danger ink for trash). The menu builder is a
pure function of the row's kind + facts (the menus/inventory.ts
idiom — unit-testable with stub actions), sharing verb dispatch
with 275's row (one actions bag, two doors consume it; the
keyboard is the third). Keyboard: ↵ dive/open per kind, ␣ place,
tab folds (selected row), esc returns; ⌥↵ fly per the kit's
menu shortcut. tag… opens the completing tag field (the shared
§4.8 component). Trash: loose-note rows → TrashNote (existing
verdict flow); placed node rows → TrashNode with the §9 impact
summary confirm the board menu uses. touchMode: row padding and
verb-chip metrics per the kit's prop, threaded from the app's
existing platform/touch detection or a settings-tier flag
(smallest honest seam; document which).

### Files to Touch

- Outline menu builder module (+ unit tests, parity test).
- OutlineView/OutlinePreview wiring (one actions bag).
- Keyboard handling in the takeover (+e2e).
- e2e: three-door parity, trash routing, keyboard map.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [ ] One actions bag; menu builder pure + unit-tested; PARITY
      test asserting the three doors expose identical inventories
      per row kind.
- [ ] Context menu per §16 grammar (danger last, shortcuts mono,
      long-press on touch).
- [ ] Keyboard map = the teaching line; esc returns; tab folds.
- [ ] Trash routes shipped commands only, with the §9 impact
      confirm on node rows; e2e round trip.
- [ ] touchMode metrics behind the documented seam.
- [ ] Full check:ci + outline e2e green (pipefail).

### Acceptance Criteria

**GIVEN** any outline row
**WHEN** the user opens its context menu, reads the preview verb
row, and uses the keyboard
**THEN** all three doors expose the same verbs for that row kind
**AND** move-to-trash confirms with the standard §9 impact summary
on placed nodes and routes TrashNote on loose notes
**AND** ↵ dives boards / ␣ places nodes / tab folds / esc returns
exactly as the teaching line promises.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->
