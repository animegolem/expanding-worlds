---
node_id: AI-IMP-078
tags:
  - IMP-LIST
  - Implementation
  - gallery
  - facets
kanban_status: planned
depends_on: [AI-IMP-077]
parent_epic: [[AI-EPIC-014-gallery]]
confidence_score: 0.65
date_created: 2026-07-06
---

# AI-IMP-078-gallery-facets

## Summary of Issue #1

The 077 grid shows everything in date order and nothing else.
§14.4 gives the gallery its retrieval half: sort facets (date ·
name · size), the kind facet (image · note · board), a flat tag
filter with counts orderable by name or by count, and the two
cleanup filters the model already owns (untagged · unplaced).
Plus FR-8: note-kind entries render as text posts — title visible,
body excerpt as the cell, tags on hover — so clippings sit beside
pictures. Done when: every facet combination filters the grid
live, tag counts reflect the active scope, cleanup filters find
exactly the §14.1 vocabulary's records, and a note-kind entry is
readable in the grid.

### Out of Scope

Selection/actions (079), keyboard (080). Composed/saved views
(future RFC turn). The this-world/everything scope toggle
(EPIC-015). Any new records — facet state is view state.

### Design/Approach

Query: extend getGalleryView (or its hydrate) with the facet
arguments: sort key, kind mask, tagIds filter, untagged/unplaced
flags — one query surface, filters compose in SQL; add a
`galleryTagCounts` projection (tag → count within current kind
mask) reusing the §4.8 tag machinery. Sorts: date (bucketed, from
077), name (label collation), size (asset bytes; notes sort by
body length or last-edit — pick and record). Non-date sorts render
the flat grid (buckets are date sort's presentation per §14.4).
UI: a facet strip pinned above the grid inside the takeover —
sort segmented control, kind chips, tag completion field with
count-ordered suggestions (custom completion, NEVER datalist),
active tag chips removable, untagged · unplaced toggles. Text
posts: note-kind cells render title + clamped body excerpt in
theme tokens; tags appear on hover (title attribute or a hover
chip row — match the engagement idiom); the §14.4 amendment
sentence for this presentation is folded by the LEAD at merge, not
by this ticket's agent (RFC edits are lead work).

### Files to Touch

`packages/persistence/src/queries-gallery.ts` (+units): facet
args + tag counts.
`apps/desktop/src/renderer/views/GalleryView.svelte`: facet strip,
text-post cells.
`apps/desktop/e2e/gallery.spec.ts`: facet scenarios.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and
**think**. Have you validated all aspects are **implemented** and
**tested**?
</CRITICAL_RULE>

- [ ] Facet-parameterized gallery query: sort × kind × tags ×
      cleanup flags compose; units cover each alone and a stacked
      combination.
- [ ] galleryTagCounts scoped to the active kind mask; orderable
      name/count (units).
- [ ] Facet strip UI: sort segmented, kind chips, tag completion
      with counts (custom list), removable active chips,
      untagged · unplaced toggles; grid updates live (e2e).
- [ ] Non-date sorts drop buckets for a flat grid; returning to
      date sort restores them (e2e).
- [ ] Text posts: note-kind cell shows title + excerpt, tags on
      hover; readable under both themes (e2e presence check).
- [ ] `pnpm -r build`, full gates green.

### Acceptance Criteria

**Scenario:** Refinding by tag.
**GIVEN** a seeded gallery holding tagged and untagged images and
a text note.
**WHEN** the user types in the tag field and picks a tag with the
highest count.
**THEN** the grid shows exactly that tag's carriers within the
current kind facet, and the count matched the suggestion.
**WHEN** the user toggles 'untagged'.
**THEN** only untagged entries remain.
**WHEN** the kind facet is set to note.
**THEN** the text post renders with its title visible and tags on
hover.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->
