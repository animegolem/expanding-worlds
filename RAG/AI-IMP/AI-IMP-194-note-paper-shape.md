---
node_id: AI-IMP-194
tags:
  - IMP-LIST
  - Implementation
  - notes
  - design-pass
  - paper
kanban_status: cancelled
depends_on: [AI-IMP-134]
parent_epic: [[AI-EPIC-023-paper-note-lifecycle]]
confidence_score: 0.6
date_created: 2026-07-08
---


# AI-IMP-194-note-paper-shape

> SUPERSEDED (2026-07-12): the Note Paper kit rules the non-bound presentation this ticket was blocked on (postures, hardware law, open-as-flight; DESIGN-LETTER rulings 8-9). Re-scoped as AI-IMP-296 under AI-EPIC-029.

## Summary of Issue #1

Owner testing note (2026-07-08, v0.15.0): the note panel "does not
have the folds or general sort of UI shape defined in the design
documents" — The Two Materials defines the paper material's
anatomy (folds, torn/bound edges, the paper silhouette) and the
shipped panel still reads as a plain rounded card outside the
bound-page state (134 shipped the image-bound book; the pinned/
floating presentations lag the design). Done means the note
panel's remaining presentations wear the Two Materials paper
anatomy — token-only, using the AI-IMP-134 paper primitives
(BinderRings/TornEdge/Tape/PushPin in note/paper/) where they
apply — so every note state reads as PAPER, not chrome.

### Out of Scope

- The bound page (shipped, 134).
- Transitions (tear/tape animations — AI-IMP-135's scope; if this
  ticket's shapes change 135's assumptions, flag, don't build
  them).
- Editor internals/save model.

### Design/Approach

NORMATIVE VISUALS: RAG/design/The Two Materials.dc.html — read the
paper-material section fully and inventory which note
presentations exist in code (pinned panel, anchorless/board note,
big editor frame) vs which paper anatomy the doc assigns each.
Reuse note/paper/ primitives; add only what the doc demands (e.g.,
a fold), token-styled, shadows per the doc's material rules (paper
casts, chrome doesn't). Where the doc is ambiguous for a given
presentation, match the nearest drawn state and list the judgment
in Issues Encountered — if a presentation has NO drawn reference,
STOP and flag it for the design conversation.

### Files to Touch

`apps/desktop/src/renderer/note/NotePanel.svelte` + `note/paper/`
(new primitive(s) if the doc demands), theme.css tokens if needed.
E2e: presentation smoke (paper elements present per state);
existing note specs stay green.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [ ] Presentation inventory vs The Two Materials (table in Issues
      Encountered).
- [ ] Each presentation wears its doc-assigned paper anatomy;
      tokens only; 134 primitives reused.
- [ ] No behavior change; existing note e2e green.
- [ ] Gates: `pnpm -r build && pnpm -r test && pnpm lint` + hidden
      e2e.
- [ ] HUMAN-TESTING entry appended at merge by the lead (does it
      read as paper at a glance?).

### Acceptance Criteria

**GIVEN** each note presentation (pinned, board note, image-bound)
**THEN** each wears the paper anatomy The Two Materials assigns it,
and the panel never reads as a plain chrome card.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->
