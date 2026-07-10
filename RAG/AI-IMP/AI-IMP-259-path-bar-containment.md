---
node_id: AI-IMP-259
tags:
  - IMP-LIST
  - Implementation
  - renderer
  - navigation
  - field-report
kanban_status: planned
depends_on: []
parent_epic:
confidence_score: 0.6
date_created: 2026-07-10
date_completed:
---


# AI-IMP-259-path-bar-containment

## Summary of Issue #1

alph, v0.20.0, 2026-07-10: after navigating via the outline his
breadcrumb read `Home ▸ Robeau ▸ black mansion ▸ 2xajxshy ▸
Robeau` — Robeau twice, plus a raw id-slug segment. OWNER RULING
(chat, 2026-07-10): the path bar shows CONTAINMENT, not a
navigation trail — "it should just be Home ▸ Robeau." Done means:
the crumb list is always the current canvas's containment chain
from the root down (⌂ glyph = the root segment), independent of
how the user got there; a canvas never appears twice; navigation
history stays the back-stack's business (the nav arrows).

SCOPE FENCE: how untitled boards DISPLAY (id-slug vs "Board N" vs
note-title) and whether Home is a board at all are in ACTIVE
design debate (DESIGN-QUEUE: home-as-launcher cluster, parked
2026-07-10). This ticket changes the SEGMENT SET only; it renders
each segment with whatever the current display rule is and picks
up the ruling later for free.

### Out of Scope

- Root/untitled naming display rules (parked design).
- Back-stack semantics, nav arrows, bookmarks.
- Outline view structure.

### Design/Approach

Pre-implementation review: read the current path-construction
source (does it append visited segments? where does the id-slug
come from?) and record the actual mechanism here before repair.
Expected shape: derive crumbs by walking parent containment from
the current canvas's node to the root (the tree the persistence
layer already owns — likely an existing query), replacing whatever
trail accumulation exists. Unit-test the derivation (deep nesting,
canvas reached from outline/search/bookmark all yield the same
crumbs); e2e asserts the alph reproduction: outline-jump to a
sibling board yields that board's containment, no duplicates.

### Files to Touch

(Census in review; expected:)
- `apps/desktop/src/renderer/chrome/PathBar.svelte` + its data
  source (navigation store or a containment query).
- Possibly a persistence query for the containment chain.
- e2e navigation spec addition.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [ ] Pre-implementation review: current mechanism recorded; the
      2xajxshy segment's origin explained.
- [ ] Crumbs = containment chain from root; trail accumulation
      removed; no canvas appears twice.
- [ ] Same crumbs regardless of arrival route (unit-tested).
- [ ] e2e: the alph reproduction (outline jump) shows containment.
- [ ] HUMAN-TESTING entry for alph.

### Acceptance Criteria

**GIVEN** a canvas nested `Home → Robeau`
**WHEN** the user reaches it via outline, search, or a bookmark
**THEN** the path bar reads `⌂ ▸ Robeau` in every case
**AND** clicking a crumb navigates to that containment level.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->
