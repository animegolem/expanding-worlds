---
node_id: AI-IMP-148
tags:
  - IMP-LIST
  - Implementation
  - rich-text
  - notes
kanban_status: planned
depends_on: [AI-IMP-146]
parent_epic: [[AI-EPIC-018-rich-text-notes]]
confidence_score: 0.65
date_created: 2026-07-07
date_completed:
---


# AI-IMP-148-heading-folding

## Summary of Issue #1

EPIC-018 FR-3 (rev 0.55 §7.1 outliner presentation). Headings
fence the content below them and FOLD: a gutter chevron affordance
per heading, a `[...]` marker on the folded line, heading levels
1–6 mapping to org-style nesting (folding h2 hides to the next
h2/h1). Folding is DECORATION-ONLY (spike-proven: source stays
byte-identical while folded) and view-only state — never durable,
reset per open. Done means folding works in panel and big editor,
the caret never strands inside a fold (caret-out handling per the
spike), and saves while folded are byte-faithful.

### Out of Scope

- Settings-sheet section folds (already shipped rev 0.55 UI work
  or rides its own surface).
- Fold persistence (explicitly view-only).

### Design/Approach

Port the spike's HeadingFold; gutter chevron per the wireframe 1f
direction on theme tokens; folded-line `[...]` marker; caret
handling: editing commands that would land inside a folded region
unfold it. Unit: fold map for a 6-level fixture; e2e: fold, type
elsewhere, save, body unchanged; fold marker visible.

### Files to Touch

`apps/desktop/src/renderer/note/` fold extension (+ units).
Note e2e extension.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [ ] Fold/unfold per heading with chevron + [...] marker; levels
      nest org-style; unit fixture.
- [ ] Decoration-only proven (save while folded = byte-identical).
- [ ] Caret never strands in a fold (edit unfolds).
- [ ] Gates: `pnpm -r build`, `pnpm -r test`, `pnpm lint`, desktop
      e2e hidden.
- [ ] HUMAN-TESTING entry appended at merge by the lead (does
      folding read as the outline grammar; chevron weight).

### Acceptance Criteria

**GIVEN** a long structured note
**WHEN** an h2 folds
**THEN** its region hides to the next h2/h1 with the marker, the
saved body is unchanged, and clicking the chevron restores it.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->
