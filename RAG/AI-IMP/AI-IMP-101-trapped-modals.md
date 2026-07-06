---
node_id: AI-IMP-101
tags:
  - IMP-LIST
  - Implementation
  - chrome
  - hardening
kanban_status: backlog
depends_on:
parent_epic: [[AI-EPIC-010-hands-on-hardening]]
confidence_score: 0.85
date_created: 2026-07-06
date_completed:
---

# AI-IMP-101-trapped-modals

## Summary of Issue #1

Bugfix-grade extract from the §8.8 occlusion audit: the big editor
(scrim+sheet z:40/41) and TitleConflictDialog (z:40) are trapped
inside the note-panels stacking context (outer z:8) — the dock,
charm rail, toasts, source panel, and node menu all render OVER
the "modal" backdrop. Done = both mount at a root overlay host
(portal above every stacking context), and a unit/e2e proves the
backdrop actually covers chrome. Full §8.8 law-2 infrastructure is
EPIC-016's; this ticket only frees the two live prisoners.

### Out of Scope

- The z-ladder, clamp helper, bands (EPIC-016).
- Any behavior change beyond stacking.

### Design/Approach

Minimal portal: a root-level overlay host element beside
ChromeLayer in the app shell; big editor + conflict dialog render
into it (Svelte portal idiom or manual DOM reparenting like the CM
buffer move). Escape/click-off/focus semantics unchanged. The 083
buffer-move machinery already survives reparenting.

### Files to Touch

App shell root (Workspace/App component), note/NotePanels.svelte
(big editor mount), note/TitleConflictDialog.svelte; e2e assertion
in panels.spec.ts: with the big editor open, the dock/rail
elements are underneath the backdrop (z comparison or click-eat
proof).

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and
**think**. Have you validated all aspects are **implemented** and
**tested**?
</CRITICAL_RULE>

- [ ] Root overlay host; big editor + conflict dialog portal into
      it; all existing panel/big-editor e2e stay green.
- [ ] e2e: open big editor → a dock click lands on the backdrop
      (closes the editor), not the dock.
- [ ] Full gates.

### Acceptance Criteria

**GIVEN** the big editor open
**WHEN** the artist clicks where the dock sits
**THEN** the click hits the modal backdrop (Done semantics), and
no chrome renders above the scrim.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->
