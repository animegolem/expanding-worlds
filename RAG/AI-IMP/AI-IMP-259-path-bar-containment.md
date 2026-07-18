---
node_id: AI-IMP-259
tags:
  - IMP-LIST
  - Implementation
  - renderer
  - navigation
  - field-report
kanban_status: planned
depends_on: []
parent_epic:
confidence_score: 0.6
date_created: 2026-07-10
date_completed:
---


# AI-IMP-259-path-bar-containment

## Summary of Issue #1 — superseded by source verification

alph, v0.20.0, 2026-07-10: after navigating via the outline his
breadcrumb included the raw id slug `2xajxshy`. The original ticket
interpreted the whole entry route as a containment defect. Round-1
review rejected that diagnosis: canvases form a graph with legal
cycles, and RFC §8.1 explicitly makes PathBar an entry-route history,
not structural ancestry. Repeated visits therefore remain truthful.

The convicted defect is inconsistent display naming. Navigation
stored caller-provided labels, so different doors could expose raw
ids, generic `Board`, stale bookmark text, or the canonical live name
for the same canvas. The accepted repair establishes one persistence
display-label seam and makes live read models/navigation resolve
through it: root = `Home`; a titled board/node = note title; an
untitled board = `unnamed · N items`; an image = original filename;
other bare nodes = `untitled node`. Generated identities remain
searchable storage keys where required, but never render as names.

### Out of Scope

- Back-stack semantics, nav arrows, and bookmark ordering/commands.
- The PathBar segment set or entry-route semantics.
- Schema or stored bookmark-label migration. Stored text remains
  recovery context for a degraded/dangling target only.

### Design/Approach

- Centralize node/canvas display grammar in persistence and use it
  across outline, tags, gallery, search, note metadata, location rows,
  and bookmark projections.
- Resolve the target's live label before a navigation entry is pushed;
  refresh visible history labels after project changes so note-title
  and item-count changes cannot leave stale crumbs.
- Resolve live bookmark labels at query time. Preserve the stored label
  for trashed/purged targets so §8.1 degradation remains intelligible.
- Regression-test that caller and stored slugs are ignored for live
  targets, item counts update, and a later note attachment renames both
  the path and bookmark menu without navigation-history rewrites.

### Files to Touch

- `packages/persistence/src/display-labels.ts`
- Persistence structural/search/gallery/note-metadata read models and
  their focused tests.
- Desktop navigation/search/tag projections and unit tests.
- `apps/desktop/e2e/navigation.spec.ts`.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [x] Pre-implementation review records and rejects the containment
      premise with RFC/source citations; raw-slug origin convicted.
- [x] One canonical live display-label seam covers navigation and the
      affected app read models; generated identities never render.
- [x] Navigation ignores caller naming authority and refreshes live
      history labels after project changes.
- [x] Live bookmarks resolve canonically; stored labels survive only
      for trashed/purged degradation.
- [x] Persistence/unit/e2e regressions cover Home/title/unnamed-count,
      raw caller/stored slugs, live count refresh, and title promotion.
- [ ] HUMAN-TESTING entry for alph.

### Acceptance Criteria

**GIVEN** the same live canvas is reached through outline, search,
tag/location, direct navigation, or a bookmark carrying stale text
**WHEN** a surface renders its name
**THEN** every door uses the current canonical display label
**AND** raw ids and caller-provided generic labels never render
**AND** PathBar continues to show the RFC §8.1 entry route unchanged
**AND** trashed/purged bookmarks retain stored text only as degraded
recovery context.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->

#### Round-1 source verification (2026-07-17)

- **The containment diagnosis is rejected.** Canvas containment is a
  graph and cycles are legal (`RFC:389-392,1083`), so there is no
  canonical parent chain. RFC 8.1 explicitly defines the PathBar as
  project-scoped entry-route history and says it is never structural
  ancestry (`RFC:2005-2021,2027-2036`). Current source correctly appends
  visits in `navigateTo`, exposes the stack through the cursor, and
  renders it (`navigation.ts:87-100,175-177`; `PathBar.svelte:53-55,
  177-211`). The `Home -> Harbor -> Keep` e2e is the existing normative
  pin (`e2e/navigation.spec.ts:29-38`). A repeated canvas is valid when
  it was visited twice; no recursive containment query may be built.
- **The assigned display residual is convicted.** `navigateTo` trusts
  and stores caller labels verbatim (`navigation.ts:87-100`), so arrival
  doors decide crumb text. The outliner already fixed its door to Home,
  note title, or `unnamed · N items` (`queries-structure.ts:838-852`),
  but tag/node locations and search background locations still emit
  short codes (`queries-structure.ts:534-539,623-628`;
  `queries-search.ts:120-138`), and some search flights emit generic
  `Board` (`SearchPalette.svelte:256`).
- Corrected acceptance: preserve the arrival-route crumb **set**, while
  every occurrence of a canvas uses one canonical live display label,
  independent of the arrival door. Root is Home; titled boards use the
  title; untitled boards use `unnamed · N items`; raw ids never surface.
  Canonical label ownership belongs at the navigation/read-model
  boundary rather than another caller-by-caller sweep, and it must
  refresh after project changes so the item count stays truthful.
- **Ruling requested:** bookmarks persist and display their stored
  label (`bookmarks.ts:39-53`; `queries-structure.ts:688-702`).
  Canonicalizing navigation protects the crumb from old slug bookmarks,
  but not the bookmark menu. Confirm whether this ticket's no-slug
  display half includes that menu or leaves it to an app-wide sweep.
  No schema change is needed.

#### Round-1 ruling and implementation outcome

- Lead ruling included the bookmark menu and confirmed persisted labels
  are fallback-only for degraded targets. No schema change was made.
- `display-labels.ts` is the canonical naming seam. Renderer callers no
  longer choose live canvas names; navigation resolves before pushing
  and refreshes the route after project changes. Structural, search,
  gallery, tag, outline-preview/filmstrip, and note-metadata projections
  share the same grammar.
- Validation at implementation checkpoint: workspace build passed;
  persistence 662/662; desktop unit 578/578; navigation+search e2e
  16/16; gallery e2e 22/22. The desktop unit run retains the known jsdom
  canvas diagnostic while all tests pass.
