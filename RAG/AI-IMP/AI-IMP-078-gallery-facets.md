---
node_id: AI-IMP-078
tags:
  - IMP-LIST
  - Implementation
  - gallery
  - facets
kanban_status: completed
depends_on: [AI-IMP-077]
parent_epic: [[AI-EPIC-014-gallery]]
confidence_score: 0.65
date_created: 2026-07-06
date_completed: 2026-07-06
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

- [x] Facet-parameterized gallery query: sort × kind × tags ×
      cleanup flags compose; units cover each alone and a stacked
      combination.
- [x] galleryTagCounts scoped to the active kind mask; orderable
      name/count (units).
- [x] Facet strip UI: sort segmented, kind chips, tag completion
      with counts (custom list), removable active chips,
      untagged · unplaced toggles; grid updates live (e2e).
- [x] Non-date sorts drop buckets for a flat grid; returning to
      date sort restores them (e2e).
- [x] Text posts: note-kind cell shows title + excerpt, tags on
      hover; readable under both themes (e2e presence check).
- [x] `pnpm -r build`, full gates green.

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

**Size-sort decision (recorded per ticket).** Assets store no byte
size and adding a column or stat()ing files was out of proportion
for a sort facet, so the size key is
`COALESCE(asset.width * asset.height, length(note.body), 0) DESC`:
pixel area is the honest cheap proxy for anything with an image
appearance, noted entries fall back to body length, bare nodes sink
to 0. Ties break on created_at. If real byte-size sorting is ever
wanted, it is a schema turn (a `byte_size` column filled at import),
not a query tweak.

**Name-sort fallback sorts untitled FIRST, not last.** The label's
fallback is shortCode(node id), so the sort key is
`COALESCE(note.title_key, n.id)` — but uuidv7 hex leads with digits,
which collate BEFORE letters, so untitled entries group together
ahead of the titled ones (in creation order). Documented in the
query header; deliberate: grouping them beats pretending they have
names, and which end they land on is presentation nobody specified.

**Tag intersection semantics.** Several active tag chips AND
together (each additional chip narrows). §4.8 defers multi-tag
AND/OR to a future turn for the tag panel's query field; the gallery
chips are filters, not a query language, so intersection is the
only sane default. galleryTagCounts omits tags with zero in-scope
carriers — suggesting a filter that empties the grid helps nobody.

**Untagged counts trashed-tag assignments as untagged** (assignment
rows to a trashed tag are invisible everywhere else too, matching
listTags/getTagView), and unplaced uses listNodeLibrary's exact
clause: active placement on an active canvas.

**Theme readability** is carried by the token system (all text-post
and facet colors are var(--ew-*) tokens); the e2e is the presence
check the checklist names, not a per-theme screenshot diff.

No blockers. Full gates: `pnpm -r build`, persistence units 404
(7 new), desktop units 19, e2e 72 (71 base + 1 new facet spec),
lint clean.
