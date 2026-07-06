---
node_id: AI-IMP-069
tags:
  - IMP-LIST
  - Implementation
  - outline
  - library
kanban_status: completed
depends_on: [AI-IMP-068]
parent_epic: [[AI-EPIC-013-global-views]]
confidence_score: 0.7
date_created: 2026-07-05
date_completed: 2026-07-06
---

# AI-IMP-069-outline-view

## Summary of Issue #1

The node-library MUST (§14.1) has no surface: unplaced material is
invisible and the world's containment structure can only be seen by
diving. This ticket fills the ▤ takeover with the outline view: the
world as canvas ▸ children rows using the §8.4 page/frame glyphs,
bare images as their own row kind, alias rows where containment
cycles back onto the current expansion path (click flies to the
real entry instead of unfolding again), a root-level loose bin
gathering unplaced nodes and loose notes, inline tag chips, and the
filter chips — hide content-less · disconnected (orphan ∪ loose,
§14.1 vocabulary) · one tag. Rows carry appearance thumbnail or
glyph, note title when present, tags, and placement count including
zero. Covers EPIC-013 FR-2. Done when: a project with nested and
cyclic canvases renders a correct outline with alias rows, the
loose bin lists every unplaced node and loose note, all three
filters work, and a new outline e2e spec passes.

### Out of Scope

Placement flows from outline rows — drag-to-canvas and Place on
Current Canvas are 070, which also retires PlacementSourcePanel.
Row activation beyond expand/collapse and alias-fly is minimal:
open-note and dive land with 070's row actions. Multi-facet
sorting, note browsing, and the graph (§14.2) stay future.

### Design/Approach

Read model first: a new `getOutlineTree` query in
queries-structure.ts projects the containment tree in one pass —
root canvases (canvas whose owning node has no active placement, or
the project root), each canvas's placements joined to node
appearance, note title, tags, child-canvas id — plus `listLooseNotes`
(active notes attached to no node) for the loose bin; unplaced
nodes come from the existing `listNodeLibrary` with filter
'unplaced'. Cycle handling is presentation, not query: the Svelte
tree tracks the canvas-id path per branch and renders an alias row
when a child canvas already appears on its own ancestry; alias
click scrolls/expands to the first real occurrence. Rows: extract
the §7.4 row grammar out of UsesList.svelte into a shared
`rows/NodeRow.svelte` (thumbnail-or-appearance swatch, title, tag
chips, count) and consume it in both places — UsesList keeps its
testids. Filter chips are local view state: content-less hides
bare-image rows with no note and no canvas; disconnected shows only
orphan/loose-badged rows; one tag filters rows to a picked tag
(completion against listTags). Orphan/loose badges render per
§14.1: orphan = no note, loose = no active placement.

### Files to Touch

`packages/persistence/src/queries-structure.ts`: getOutlineTree,
listLooseNotes.
`packages/persistence/src/queries-structure.test.ts` (or sibling
test file): projection units incl. cycle and loose fixtures.
`apps/desktop/src/renderer/views/OutlineView.svelte`: new — the ▤
takeover content.
`apps/desktop/src/renderer/rows/NodeRow.svelte`: new — shared row
grammar extracted from UsesList.
`apps/desktop/src/renderer/note/UsesList.svelte`: consume NodeRow;
testids stable.
`apps/desktop/src/renderer/chrome/TakeoverLayer.svelte`: mount
OutlineView for kind 'outline'.
`apps/desktop/e2e/outline.spec.ts`: new.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and
**think**. Have you validated all aspects are **implemented** and
**tested**?
</CRITICAL_RULE>

- [x] getOutlineTree query + units: roots, children with
      appearance/noteTitle/tags/childCanvasId, cyclic fixture
      returns each canvas once as data (cycles resolved in view).
- [x] listLooseNotes query + units: unattached active notes only;
      trashed excluded.
- [x] NodeRow.svelte extracted; UsesList renders through it with
      zero e2e diffs (notes.spec, panels.spec stay green).
- [x] OutlineView: expandable canvas ▸ children tree, page/frame
      glyphs, bare-image row kind, inline tag chips, placement
      count including zero.
- [x] Alias rows: a canvas already on its branch's ancestry renders
      as alias; click expands/scrolls to the real entry.
- [x] Loose bin at root: unplaced nodes (listNodeLibrary unplaced)
      + loose notes; orphan and loose badges per §14.1.
- [x] Filter chips: hide content-less · disconnected · one tag
      (with tag-name completion); combinable with the bin and tree.
- [x] e2e: nested + cyclic project shows alias row; unplaced node
      appears in the loose bin and survives the disconnected
      filter; content-less filter hides a bare image.
- [x] `pnpm -r build`, full gates green.

### Acceptance Criteria

**Scenario:** Reviewing world structure and stashed material.
**GIVEN** a project where canvas A contains canvas B, B contains A
(cycle), plus one unplaced image node and one loose note.
**WHEN** the user opens ▤.
**THEN** A ▸ B renders, and B's child A renders as an alias row
that flies to the top-level A entry when clicked.
**AND** the loose bin lists the unplaced node with a loose badge
and the loose note.
**WHEN** the user applies the "disconnected" filter chip.
**THEN** only orphan or loose rows remain visible.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->

Typing into the tag filter deterministically SEGFAULTED Electron's
main process — root cause was the `<datalist>` completion: its
native autocomplete popup cannot open against a hidden window
(EW_TEST_HIDDEN_WINDOWS e2e mode). Replaced with a custom
completion list and left a loud comment; this is a repo-wide rule
now — no `<datalist>` anywhere. (The crash burst also explained
the owner's "reopen Electron?" dialog spam, and matching crash
reports exist from yesterday's suite runs.)

The loose bin initially listed the project ROOT node: it is
unplaced by construction and an existing unit pins it INSIDE
listNodeLibrary ("every active node"), so the exclusion lives in
the view — the root board heads the outline and is not stashed
material. Canvas-owning unplaced nodes are likewise excluded from
the bin because they already surface as root-level canvas entries.

Ordering: the NodeRow extraction was deliberately held until the
AI-IMP-075 token sweep merged (UsesList would have conflicted),
then done against the token palette; a protective WIP commit
(f75b41c) landed mid-ticket when an orphaned agent directory
briefly put the main tree at risk — final state squashes nothing
and the full 56-test suite is green.
