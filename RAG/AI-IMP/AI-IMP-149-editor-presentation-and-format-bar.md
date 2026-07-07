---
node_id: AI-IMP-149
tags:
  - IMP-LIST
  - Implementation
  - rich-text
  - typography
kanban_status: planned
depends_on: [AI-IMP-146, AI-IMP-131]
parent_epic: [[AI-EPIC-018-rich-text-notes]]
confidence_score: 0.65
date_created: 2026-07-07
date_completed:
---


# AI-IMP-149-editor-presentation-and-format-bar

## Summary of Issue #1

EPIC-018 FR-4. The LOUD presentation on the TipTap engine: typed
Markdown styles render live (headings sized AND colored per the
§7.1 tokens, bold/italic/code as they type), and rich-text
controls appear as a FLOATING BAR on selection only — no standing
chrome (rev 0.55 wireframe 1d). The bar offers the Markdown-backed
set (bold · italic · code · heading level · list · link) as
verbs, applies as typed-Markdown edits (carrier stays §7.1
canonical), and follows the §8.8 clamp + one-clock rules. Done
means a naive user can style without knowing Markdown while the
file stays plain Markdown.

### Out of Scope

- Maple font bundling (131 ships it; this consumes).
- New marks beyond CommonMark + the frozen dialect (150).

### Design/Approach

Live styling: TipTap marks/nodes styled from the 130/131 tokens
(headings per --ew-note-h*, editor scale). Format bar: selection-
driven bubble at the popover rung, MenuPopover-kin styling, verbs
dispatch TipTap commands whose serialization is the frozen dialect
(corpus-guarded). Keyboard shortcuts per platform convention
(Mod+B/I) declared in the keymap registry as editor-scope entries
(display; dispatch stays editor-local per §10.2).

### Files to Touch

`apps/desktop/src/renderer/note/` presentation styles + format-bar
component (+ units where logic).
`keys/bindings.ts` editor-scope declarations.
Note e2e: select → bar appears → bold applies → body carries
`**…**`.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [ ] Live typed-Markdown styling on tokens (headings colored/
      sized; marks live).
- [ ] Selection format bar: appears on selection only, clamps,
      applies Markdown-backed edits; e2e round-trip.
- [ ] Editor-scope shortcut declarations listed in Settings.
- [ ] Gates: `pnpm -r build`, `pnpm -r test`, `pnpm lint`, desktop
      e2e hidden.
- [ ] HUMAN-TESTING entry appended at merge by the lead (LOUD
      headings feel; bar timing on selection).

### Acceptance Criteria

**GIVEN** a selection in a note
**THEN** the floating bar appears, bold applies visually AND as
`**…**` in the saved body, and no standing chrome exists when
nothing is selected.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->
