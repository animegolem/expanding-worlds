---
node_id: AI-IMP-147
tags:
  - IMP-LIST
  - Implementation
  - rich-text
  - links
kanban_status: planned
depends_on: [AI-IMP-146]
parent_epic: [[AI-EPIC-018-rich-text-notes]]
confidence_score: 0.6
date_created: 2026-07-07
date_completed:
---


# AI-IMP-147-link-and-embed-atoms

## Summary of Issue #1

EPIC-018 FR-2. Wiki-links `[[Title]]`/`[[Title|label]]` and embeds
`![[...]]` render as ATOMIC decorated nodes in the TipTap editor —
serialize byte-exact (spike-proven), styled per §7.1 link states
(bound blue · unresolved purple · trashed grey · broken red
strikethrough per rev 0.55), Mod+Click activates per the existing
grammar, the `[[` suggestion popup ports (§7.2 completions —
custom list, never `<datalist>`), and every state carries the §8.2
hover chip. Done means link behavior in the new editor is
indistinguishable from shipped plus the ratified state styling.

### Out of Scope

- Embed RENDERING beyond the atom chip (image-embed display rides
  the EPIC-008 export/§4.2 activation).
- Link resolution semantics (§7.1 unchanged — display only).

### Design/Approach

Port the spike's atom nodes; `classFor` feeds from the existing
`linkDisplayState` read model; serialize parity tests from the
corpus guard the atoms forever. Suggestion popup: reuse the
existing suggestion data source; TipTap suggestion plugin renders
the same custom list component (or a port). Hover chip rides the
shipped tooltip singleton with the ratified state copy.

### Files to Touch

`apps/desktop/src/renderer/note/` atom extensions + suggestion
wiring (+ units).
Existing link e2e (notes/links specs) must pass; extend for
strikethrough-broken + hover chip states.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [ ] Atoms serialize byte-exact (corpus parity units).
- [ ] Four states styled per rev 0.55 incl. broken strikethrough;
      hover chip on every state; Mod+Click activates.
- [ ] `[[` suggestions: custom list, keyboard model, no datalist.
- [ ] Existing link e2e green; new state assertions added.
- [ ] Gates: `pnpm -r build`, `pnpm -r test`, `pnpm lint`, desktop
      e2e hidden.

### Acceptance Criteria

**GIVEN** a note with bound/unresolved/trashed/broken links
**THEN** each renders its atom state with the chip, activates on
Mod+Click, and the saved body is byte-identical to its source.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->
