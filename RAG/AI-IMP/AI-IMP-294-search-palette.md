---
node_id: AI-IMP-294
tags:
  - IMP-LIST
  - Implementation
  - search
  - chrome
  - design-adoption
kanban_status: completed
depends_on: [AI-IMP-286, AI-IMP-288]
parent_epic: [[AI-EPIC-029-the-kit-adoption-push]]
confidence_score: 0.7
date_created: 2026-07-12
date_completed: 2026-07-13
---

# AI-IMP-294-search-palette

## Summary of Issue #1

RFC §8.3 (rev 0.71) supersedes the anchored ⌕ panel: search is a
centered palette over the scrimmed board (board visible; exit
restores it exactly), two doors (keyboard chord + rail ⌕), results
grouped by kind with HEADERS naming their ↵ verb, leading # tag
mode with crystallized pills, fzf-shaped matching over the
NAME-SPACE (titles · tag names · filenames — space-separated fuzzy
subsequences, ANDed; plain terms also match tags; #-terms constrain
to tags, one pill each; note BODIES stay substring), and drag-out:
placeable rows drag onto the board as placements (palette folds
mid-drag; drop = ordinary place flow; only placeable rows offer
the affordance). Also closes G7's shipped defects: the
`asset.usingCanvases` type hole, the missing error state, and the
unhandled rejection leaving stale results. Done means: the palette
replaces SearchPanel's panel form, both doors work, fzf matcher
unit-tested, drag-out places, G7 defects fixed with tests.

### Lead clarifications (2026-07-12, pre-build)

- "Titles" in the fzf name-space explicitly includes CANVAS-OWNING
  node titles — a board result must fuzzy-match and its ↵ dives
  (owner confirmed the intent; it was always §8.3's quick-open
  contract).
- Tab is the crystallizer for EVERY typed resolution (tag pills
  today; the board-scope pill when it lands) — build completion
  commit on Tab, not Enter; Enter fires the ↵ verb. Tab is ALWAYS
  OPTIONAL: uncommitted fragments keep fuzzy-matching live (the
  fzf soul) — pills pin a resolution, never gate one.
- The board-scope pill ("on: <canvas>", tab-completed from a board
  name) is queued for the kit to draw — NOT in this ticket's scope;
  leave the pill row extensible (pills are a list of typed facets,
  not a tags-only array).
- Captions stay OUT of both paths (caption-FTS is deferred, rev
  0.68); when it lands it joins the SUBSTRING path, never fzf.

### Out of Scope

- Command verbs in the palette (open DESIGN-QUEUE conversation).
- Caption FTS (deferred with scope, §4.5).
- Rail recomposition (AI-IMP-293 — until it lands, the existing
  rail ⌕ button simply opens the new palette).
- Ranking sophistication beyond fzf-style subsequence scoring —
  tune later against real use.

### Design/Approach

New `chrome/SearchPalette.svelte` (centered, top flush with the
rail band per the kit, clamp viewport−160, scrim at the GR-2
ladder's rung; esc / scrim-tap / rail-⌕ toggle exits). The fzf
matcher is a pure module (`chrome/fzf-match.ts`): subsequence
match + score per term over a name-space snapshot (note titles,
tag names, asset filenames — the existing search.ts sources);
AND-combine; #-prefixed terms filter the tag axis and emit pills
on commit. Body search stays the FTS path, merged below name-space
hits under its kind group. Kind groups render headers with their
↵ verb copy from the kit; ↵ per kind reuses existing navigation/
open calls (dive, note panel, tag panel, node reveal, decoration
centering). Drag-out: image-node rows set the payload the board's
drop path already accepts (place-by-node), the palette folds on
dragstart and restores on drag-end-without-drop; rows without a
placeable payload render no drag affordance (the AI-IMP-269 #2
lesson — no dead drags). Type hole: extend the search result type
with `usingCanvases` where the IPC actually returns it (fix at the
source, not a cast).

### Files to Touch

`apps/desktop/src/renderer/chrome/SearchPalette.svelte`: new.
`apps/desktop/src/renderer/chrome/fzf-match.ts` + tests: new.
`apps/desktop/src/renderer/chrome/SearchPanel.svelte` +
  `search.ts`: retire the panel form into the palette; fix type
  hole, error state, rejection handling.
`apps/desktop/src/renderer/chrome/CharmRail.svelte`: ⌕ opens the
  palette.
`apps/desktop/src/renderer/keys/`: the summon chord.
Board drop path (`canvas/import-surfaces.ts` region): accept the
  palette's place payload if not already generic.
e2e: palette doors/verbs/pills/drag-out; existing quick-open specs
  updated.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [x] Round-1: verify SearchPanel/search.ts current shape, the G7
      defects (type hole at :32/:194, rejection path), the summon
      chord, the board's drop payload contract, and the Search
      kit + wireframes; record corrections here.
- [x] fzf-match.ts: subsequence scoring, multi-term AND, tag-axis
      terms; unit tests incl. the letter's example ("chi lif" →
      #chieftain ∧ #life-debt) and non-matches.
- [x] Palette component: centered geometry, scrim, three exits,
      rest state teaches (kit copy), no-match names the trash
      exclusion, error state distinct from empty (GR-1).
- [x] Kind groups with ↵-verb headers; each verb wired to its
      existing action; keyboard walk (arrows + enter) works.
- [x] # tag mode: completion, pills with ✕, backspace eats last,
      AND filtering.
- [x] Drag-out on placeable rows only; palette folds mid-drag;
      drop places via the ordinary flow; no affordance on
      non-placeable rows.
- [x] G7 fixes: type extended at source; unhandled rejection
      handled with the error state; stale-results test.
- [x] Both doors toggle the same surface; exit restores board
      exactly (camera untouched).
- [x] Unit + e2e green; full local gate green with counts read.

### Acceptance Criteria

**Scenario:** fzf tag resolution.
**GIVEN** tags #chieftain and #life-debt exist
**WHEN** the user opens the palette and types `#chi #lif` (or
`chi lif` in tag mode)
**THEN** committed pills resolve to both tags and results AND them
**AND** ✕ on a pill re-widens results.
**Scenario:** drag-out places.
**GIVEN** an image result under the images group
**WHEN** the user drags it onto the board
**THEN** the palette folds, the drop creates a placement via the
ordinary place flow, and one undo removes it
**AND** a tag row offers no drag affordance.
**Scenario:** search fails.
**GIVEN** the search IPC rejects
**WHEN** the user types
**THEN** the palette shows its error sentence (distinct from
no-match) and recovers on retry.

### Issues Encountered

- Round-1 correction: persistence already returned `usingCanvases`; the
  type hole lived only in SearchPanel's renderer-local `SearchResults`.
  The replacement type now models the IPC result without a cast or a
  persistence change.
- Round-1 correction: the board drop surface already accepts
  `NODE_DRAG_MIME` and performs the ordinary `CreatePlacement` flow. The
  palette therefore emits that existing payload only for unambiguous
  node-backed image rows; it adds no placement command or drop path.
- `listNodeLibrary`, `listLooseNotes`, and `listTags` are loaded as one
  epoch-gated name-space snapshot. `searchProject` remains the note-body
  and canvas-text path. Both paths reject stale completions, distinguish
  failure from zero results, and recover on a later clean request.
- The old anchored search/quick-open split is retired. Rail ⌕ and Mod+K
  open the same centered palette; the retained `quick-open` registry id
  is a stable internal identifier only.
- Tab crystallizes tag resolutions while Enter always runs the row's
  named verb. The pill list is typed (`kind: 'tag'`) so the deferred
  board-scope facet can join without changing its shape.
- Validation: commands 19/19, domain 60/60, shared-ui 1/1, protocol
  1/1, canvas-engine 409/409, persistence 658/658, desktop units
  549/549, and desktop e2e 267/270 first-pass with all three
  environment launch/reopen flakes green on retry (final conclusion
  green). Lint and spike typecheck passed.
