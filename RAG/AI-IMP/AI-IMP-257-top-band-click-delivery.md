---
node_id: AI-IMP-257
tags:
  - IMP-LIST
  - Implementation
  - shell
  - renderer
  - field-report
kanban_status: in-progress
depends_on: [AI-IMP-255]
parent_epic:
confidence_score: 0.7
date_created: 2026-07-10
date_completed:
---


# AI-IMP-257-top-band-click-delivery

## Summary of Issue #1

alph, v0.20.0 Windows, 2026-07-10: "this entire section is dead
can't click anything" — the revealed title strip's path bar (Home
▸ Robeau ▸ black mansion) takes no clicks. AI-IMP-255 fixed the
band's REVEAL; click delivery inside it is the next layer of the
same disease: Chromium computes the OS drag region from every
`app-region: drag` rect and only `no-drag` descendants subtract
back out. LEAD HYPOTHESIS (pre-implementation review verifies): the
strip root is the drag handle (`TitleStrip.svelte:377`), its Board
button and window controls carve out, PathBar's pin carves out
(`PathBar.svelte:199`) — but the breadcrumb segments and possibly
other strip children DON'T, so their clicks resolve as window-move.
Never reachable before .20 because the strip never revealed on
packaged builds. Done means: every interactive element that can sit
inside the top band takes clicks on packaged mac AND Windows
builds, with a guard against future band children forgetting the
carve-out.

### Out of Scope

- The breadcrumb's CONTENT (trail vs containment — AI-IMP-259).
- Reveal/engagement behavior (AI-IMP-255, shipped).
- Moving chrome out of the band (design change; carve-outs first).

### Design/Approach

Pre-implementation review first: on a packaged build, map exactly
which top-band elements are click-dead (crumbs, home glyph, nav
arrows?, anything else) and confirm via the drag-region mechanism
(a no-drag override on one crumb proving delivery returns).
Then: `no-drag` on every interactive descendant of the band —
prefer one structural rule (e.g. the strip's interactive container
carries no-drag, drag lives only on the explicit grip/spacer
rects) over per-element whack-a-mole, so a new button next month
is born clickable. Guard: a vitest scan or component test
asserting every focusable element rendered by TitleStrip/PathBar
sits inside a no-drag ancestor. E2E cannot prove the OS layer
(synthetic clicks bypass it) — HUMAN-TESTING entries for owner
(mac) and alph (Windows) are the proof.

### Files to Touch

- `apps/desktop/src/renderer/chrome/TitleStrip.svelte`,
  `PathBar.svelte`: carve-out restructure.
- Guard test (desktop vitest).
- `RAG/HUMAN-TESTING.md`: both-platform validation entry.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [x] Pre-implementation review: SOURCE census superseded the
      hypothesis with a sharper cause — `-webkit-app-region` exists
      ONLY in TitleStrip.svelte's scoped styles; PathBar's
      `class="pin no-drag"` (AI-IMP-165) had NO backing rule, so
      the ENTIRE bar (pin included) was click-dead in the band,
      matching alph's "can't click anything" exactly. Svelte style
      scoping is the mechanism: a borrowed no-drag class is a
      carve-out that does not exist.
- [x] Structural no-drag: `.path-bar` container carries the rule
      (PathBar.svelte) — home, arrows, crumbs, pin, and all future
      children carved; empty band space still drags the window.
- [x] Guard test (drag-region-guard.test.ts): fails on any chrome
      component using a no-drag class without a backing rule in
      its OWN file (the exact failure mode), and pins both known
      band residents' rules. 3/3 green.
- [x] Desktop vitest 404 green + shell e2e 7/7 green.
- [ ] HUMAN-TESTING entries (owner mac / alph Windows) — the OS
      layer is unprovable from the suite; the packaged-build click
      is the real proof.

### Acceptance Criteria

**GIVEN** a packaged v0.20.x build on macOS or Windows
**WHEN** the title strip is revealed and a breadcrumb segment is
clicked
**THEN** navigation fires (no window drag, no dead click)
**AND** dragging from the strip's empty area still moves the window.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->
