---
node_id: AI-IMP-204
tags:
  - IMP-LIST
  - Implementation
  - gallery
  - design-first
kanban_status: planned
depends_on: []
parent_epic:
confidence_score: 0.5
date_created: 2026-07-08
---


# AI-IMP-204-gallery-preview-inspector

## Summary of Issue #1

First alph field report (2026-07-08, Discord): in the gallery he
"instinctually" double-clicked a tile expecting the image to
expand — nothing happened. His ask, in his words: "or at least
have a side panel open up with a larger preview," citing
Allusion's pattern with screenshots: **single click opens
data + tags in a side panel, double click shows the whole image.**
Today gallery tiles select but offer no larger look at anything —
no preview, no metadata surface (his Allusion shots show
filename/dimensions/size/imported/created/EXIF plus tags; we have
our own equivalents: node identity, tags, placements/uses, asset
facts). DESIGN-FIRST: opening a side panel reflows the gallery
grid, and the owner has ruled the reflow and the panel's look need
a design conversation before any build (see DESIGN-QUEUE). Done
means the design conversation has produced a ratified interaction
spec (what single click, double click, and Escape each do; what
the panel shows; how the grid reflows; how double-click full view
presents and dismisses) — and then that spec is implemented with
each behavior pinned by e2e.

### Out of Scope

- Building ANYTHING before the design conversation lands — this
  ticket parks the capture; the conversation defines the build.
- Gallery bulk tag operations (separate uncaptured item in
  DESIGN-QUEUE's tag cluster).
- Click-away deselect (AI-IMP-188 — coordinate: single-click
  semantics must not collide).

### Design/Approach

Inputs to the design conversation, captured from alph: Allusion as
the reference model (single = inspector, double = full view); the
inspector carries a larger preview + metadata + tags. Questions
the conversation must answer: inspector as overlay vs grid-reflow
split (he said "side panel"; grid reflow is the owner's named
concern — capture what the reflow looks like); what our metadata
set is (asset facts vs node facts vs both); whether tags are
editable in the inspector or read-only at first; double-click full
view — lightbox over the gallery vs jump to the item; how this
relates to 188's deselect (click empty = close inspector +
deselect?). Owner may bring alph into this conversation directly
(his first design involvement — keep the framing concrete and
visual).

### Files to Touch

None until the design conversation ratifies scope; then gallery
components + e2e per the ratified spec (expect this section to be
rewritten at that point).

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [ ] Design conversation held; interaction spec ratified into
      this ticket (and RFC if it touches normative gallery
      semantics); DESIGN-QUEUE entry pruned.
- [ ] Single-click inspector implemented per spec.
- [ ] Double-click full view implemented per spec.
- [ ] Reflow behavior matches the ratified design at common
      window sizes.
- [ ] Gates: `pnpm -r build && pnpm -r test && pnpm lint` + hidden
      e2e.
- [ ] HUMAN-TESTING entry appended at merge by the lead (alph
      should get first pass — it's his ask).

### Acceptance Criteria

**GIVEN** the ratified design spec
**WHEN** a user single-clicks a gallery tile
**THEN** the inspector opens with larger preview, metadata, and
tags per spec
**AND WHEN** they double-click
**THEN** the full image presents per spec — no dead double-clicks
in the gallery.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->
