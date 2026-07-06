---
node_id: AI-IMP-073
tags:
  - IMP-LIST
  - Implementation
  - search
kanban_status: planned
depends_on: [AI-IMP-068, AI-IMP-071]
parent_epic: [[AI-EPIC-013-global-views]]
confidence_score: 0.75
date_created: 2026-07-05
date_completed:
---

# AI-IMP-073-search-and-quick-open

## Summary of Issue #1

The FTS read models (`searchProject` over the four §8.3 corpora,
`quickOpen` over title_key) shipped with migration 0003 but have no
UI: the ⌕ charm is inert and there is no keyboard way to reach
anything by name. This ticket builds the ⌕ panel (panel physics,
anchored to the rail charm): a field over kind-grouped results —
note → note panel, tag → tag panel (the third §4.8 door), asset
filename → the nodes using it, canvas text → navigate to the
containing canvas centered on the decoration — with a leading `#`
switching the field to tag mode with name completion. Mod+P
summons the same panel in quick-open mode: title matches across
notes and canvas-owning nodes, phantoms excluded; Enter opens the
note panel or navigates to the canvas. Covers EPIC-013 FR-7 and
FR-8. Done when: all four result kinds navigate correctly, tag mode
lands on the tag panel, Mod+P round-trips both target kinds
keyboard-only, and a search e2e spec passes.

### Out of Scope

Index changes (0003's corpora stand). Search-in-note (CM6's own
find). Result ranking work beyond FTS defaults. Fuzzy matching.

### Design/Approach

`chrome/SearchPanel.svelte` + a small store, opened by the ⌕ charm
(anchored, like the bookmark menu) or Mod+P; one instance, Escape
closes, the charm shows active while open. Debounced `searchProject`
drives four labeled groups with the shared row look where a node is
involved; full keyboard model — arrows move a flat cursor across
groups, Enter activates. Activation per kind: note →
requestOpenNote; tag → tag-panel store (071's door, anchored to the
result row); asset → expand the row's using-nodes (each navigates
and centers via the onCenterPlacements seam, cross-canvas through
navigateTo); canvas text → navigateTo the containing canvas then
center the decoration (scene-wait bounded, same pattern as 065 —
anything reading items() right after navigateTo must wait for the
scene). Leading `#` flips the field to tag mode: completion rows
from listTags, Enter opens the tag panel. Mod+P opens in quick-open
mode — same panel, `quickOpen` query, no groups, no `#` handling;
plain ⌕ opening starts in search mode. Trashed exclusion is already
query-side. The Mod+P binding registers at the shell seam with the
068 takeover guard.

### Files to Touch

`apps/desktop/src/renderer/chrome/SearchPanel.svelte` +
`chrome/search.ts`: new — panel, store, keyboard model.
`apps/desktop/src/renderer/chrome/CharmRail.svelte`: ⌕ goes live
with active state.
`apps/desktop/src/renderer/chrome/navigation.ts` (or shortcut
seam): Mod+P.
`apps/desktop/src/renderer/tags/tag-panel.ts`: door from search
results/tag mode.
`apps/desktop/e2e/search.spec.ts`: new.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and
**think**. Have you validated all aspects are **implemented** and
**tested**?
</CRITICAL_RULE>

- [ ] SearchPanel opens from ⌕ (anchored, charm active) and Mod+P
      (quick-open mode); Escape closes; one instance.
- [ ] Search mode: debounced searchProject, four kind groups,
      arrow/Enter keyboard model across groups.
- [ ] Note result opens the note panel; tag result opens the tag
      panel; asset result expands using-nodes that navigate and
      center; canvas-text result navigates and centers the
      decoration after the scene applies.
- [ ] Leading # switches to tag mode with listTags completion;
      Enter lands on the tag panel (third door).
- [ ] Quick-open: title matches over notes and canvas-owning nodes,
      phantoms excluded; Enter opens note panel / navigates to
      canvas; canvas navigation is a history entry.
- [ ] Mod+P suppressed while a takeover is open (068 guard); works
      from board focus and from an open note panel.
- [ ] e2e: one scenario per result kind incl. cross-canvas text
      match; # tag mode; keyboard-only Mod+P round trip to a note
      and to a canvas.
- [ ] `pnpm -r build`, full gates green.

### Acceptance Criteria

**Scenario:** Finding a phrase that lives in canvas text on another
board.
**GIVEN** canvas B holds a text decoration containing "sunken
gate", with canvas A active.
**WHEN** the user presses Mod+P, types "sunken", switches nothing
else.
**THEN** quick-open shows no phantom titles; typing the phrase in
the ⌕ panel's search mode instead lists it under canvas text.
**WHEN** the user presses Enter on that result.
**THEN** the app navigates to B (Back returns to A) centered on the
matching decoration.
**WHEN** the user types "#ru" in the field.
**THEN** tag completion offers "ruins" and Enter opens the tag
panel on it.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->
