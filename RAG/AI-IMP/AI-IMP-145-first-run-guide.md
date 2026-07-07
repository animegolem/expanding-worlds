---
node_id: AI-IMP-145
tags:
  - IMP-LIST
  - Implementation
  - design-pass
  - onboarding
kanban_status: planned
depends_on: [AI-IMP-131]
parent_epic: [[AI-EPIC-019-public-face]]
confidence_score: 0.7
date_created: 2026-07-07
date_completed:
---


# AI-IMP-145-first-run-guide

## Summary of Issue #1

EPIC-019's first-run walkthrough has final-candidate content (rev
0.55; First-Run Document t1): seven pages in the taped-paper
voice — 1 "A board for your pictures" · 2 "Your pictures are safe"
(LOAD-BEARING, never cut) · 3 cursor zones + tooltips-teach · 4
notes + [[links]] · 5 boards-in-boards · 6 tags/search/gallery/
trash-keeps-whole · 7 the optional "What do you plan to make?"
pick (three workflows, filters example ideas only). Arc rules: one
idea per page, ≤3 sentences, no feature names, no "node"; skip on
every page, never nags, never shows again (a settings action
replays); "start" lands INSIDE the seeded example. Done means the
guide runs exactly once on true first open, renders the ratified
copy verbatim on paper styling (Maple, dot progress, board visible
behind), and lands in the seeded example.

### Out of Scope

- Workflow picks seeding real starter worlds (deferred, queued).
- Seed-content changes (owner + tester curate).
- Marketing/public-face beyond this surface.

### Design/Approach

A first-open overlay in the takeover family (board visible
behind, per the mock): paper card, Maple text (131), dot progress,
`next ›`/`start ›`/`skip` grammar. Copy from the ratified verbatim
set — a `first-run-copy.ts` module holding the exact strings so
tests assert verbatim (content drift = test failure). Shown-once
rides an app-tier setting; Settings gains "replay the guide" in
Behavior. Page 7's pick stores the choice app-tier for the
example-ideas filter (consumer may be future; store the fact).
E2E: fresh profile shows the guide; skip → never again; replay
action works; page-2 copy asserted verbatim.

### Files to Touch

`apps/desktop/src/renderer/chrome/FirstRunGuide.svelte` (new) +
`first-run-copy.ts` (+ vitest verbatim).
App boot seam for true-first-open detection (app settings).
`views/SettingsView.svelte`: replay row.
`apps/desktop/e2e/first-run.spec.ts` (new; fresh-profile launch
pattern exists in e2e helpers).

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [ ] Seven pages, ratified copy verbatim (unit), paper voice on
      tokens + Maple, dot progress.
- [ ] Shows exactly once; skip everywhere; settings replay; e2e
      covers all three.
- [ ] "start" lands inside the seeded example (e2e asserts the
      example board is active).
- [ ] Page-7 pick stored; no other effect yet (recorded).
- [ ] Gates: `pnpm -r build`, `pnpm -r test`, `pnpm lint`, desktop
      e2e hidden.
- [ ] HUMAN-TESTING entry appended at merge by the lead (does the
      arc teach without preaching; page-2 trust moment).

### Acceptance Criteria

**GIVEN** a fresh profile's first open
**THEN** the guide walks seven pages with the ratified copy, skip
always available, and start drops into the seeded example
**AND** no subsequent launch ever shows it unbidden.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->
