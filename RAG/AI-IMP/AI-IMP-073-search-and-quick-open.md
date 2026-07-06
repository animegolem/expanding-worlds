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

- [x] SearchPanel opens from ⌕ (anchored, charm active) and Mod+P
      (quick-open mode); Escape closes; one instance.
- [x] Search mode: debounced searchProject, four kind groups,
      arrow/Enter keyboard model across groups.
- [x] Note result opens the note panel; tag result opens the tag
      panel; asset result expands using-nodes that navigate and
      center; canvas-text result navigates and centers the
      decoration after the scene applies.
- [x] Leading # switches to tag mode with listTags completion;
      Enter lands on the tag panel (third door).
- [x] Quick-open: title matches over notes and canvas-owning nodes,
      phantoms excluded; Enter opens note panel / navigates to
      canvas; canvas navigation is a history entry.
- [x] Mod+P suppressed while a takeover is open (068 guard); works
      from board focus and from an open note panel.
- [x] e2e: one scenario per result kind incl. cross-canvas text
      match; # tag mode; keyboard-only Mod+P round trip to a note
      and to a canvas.
- [x] `pnpm -r build`, full gates green.

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

- **New persistence query (deviation from Files to Touch):**
  `getNodeLocations` in `queries-structure.ts` (+3 unit tests).
  Nothing existing yields one node's placement locations by node id
  (getTagView is per-tag, getNoteUses per-note), and the asset rows
  need exactly that to navigate/center. Labels follow the tag-view
  conventions (note title else short code; root reads "Home"). The
  panel loads it lazily on asset-row expansion — no N+1 at search
  time.
- **Canvas-text centering needed no new seam.** The workspace
  `onCenterPlacements` handler matches `controller.items()` by id —
  decorations included — and `selection.marquee` doesn't validate
  item kinds, so `requestCenterPlacements([decorationId])` after
  `navigateTo` selects and centers the decoration with the seam's
  own bounded scene-wait. Verified in e2e: camera centers on the
  text AABB and `__ewDebug.selection()` holds the decoration id.
  The event name now understates what it does; left as-is rather
  than renaming a shared seam mid-wave.
- **Mod+P vs CodeMirror:** registered at the shell seam
  (attachNavigation) as a window CAPTURE listener with a first-line
  `takeoverActive()` guard; capture runs before CM's editor-DOM
  handlers, so no key eating. e2e proves it from `.cm-content`
  focus. Mod+P is not in CM's default keymap, but capture makes
  the ordering a non-issue.
- **shell.spec.ts updated:** its rail assertion pinned ⌕ as
  aria-disabled/deferred; moved 'search' to the live-charm list
  (same pattern as when outline/☰ went live in 068).
- **Not covered:** live re-query of open results on project-changed
  (results refresh per keystroke only); quick-open phantom
  exclusion is asserted at the persistence layer
  (queries-search.test.ts), not re-proven in e2e; the ⌕ charm click
  is not takeover-guarded (the rail stays interactive under a
  takeover — only Mod+P carries the 068 guard per this ticket), so
  a ⌕ click during a takeover opens the panel beneath the cover.
  Flagging for lead review rather than growing CharmRail scope.
