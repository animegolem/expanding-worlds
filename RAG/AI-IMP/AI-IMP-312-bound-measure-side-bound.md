---
node_id: AI-IMP-312
tags:
  - IMP-LIST
  - Implementation
  - note-paper
  - proportion-law
kanban_status: planned
depends_on:
parent_epic: [[AI-EPIC-031-the-notes-epic]]
confidence_score: 0.8
date_created: 2026-07-19
date_completed:
---

# AI-IMP-312-bound-measure-side-bound

## Summary of Issue #1

The bound page's free axis is a feel constant — `DEFAULT_PAGE_EXTENT
= 300` world units (`note/paper/bound-geometry.ts:19-23`) — not the
ratified sovereign measure (RFC §8.8.5: page width derives from
~45–65ch at the page's own type size, NEVER from the image; RFC
lines 2641-2647). The round-0 census (notes-census r2, settled
2026-07-19) convicted this as a law violation: 300 units sits below
the 45ch floor at the shipped editor scale, and the existing unit
tests pin the stale constant rather than the law
(`bound-geometry.test.ts:44-60`). SIDE-BOUND HALF ONLY: the
below-calendar horizontal seam is unruled and design-queued. Done
means: a side-bound page's width is derived from its type measure
with a minimum-measure floor, equal-height binding is untouched, and
tests pin the law (ch-derived width) instead of the constant.

### Out of Scope

Below-calendar binding (unruled — DESIGN-QUEUE 2026-07-19); rotated
images (fallback to tethered card is PERMANENT-FOR-NOW per the
census verdict — record only); the reading-flight trigger (owner's
tiny-image cap holds that lane); shrink-ladder rungs (AI-IMP-313).

### Design/Approach

Derive the page's world-unit width from the editor's rendered type:
measure the page's em/ch size at its shipped type scale once (a
constant derived FROM type metrics with the derivation shown in a
comment, not a bare magic number), target the 45–65ch band, and
enforce the minimum-measure floor when the layout would starve it.
Side-bound geometry keeps: page height = image height exactly
(`bound-geometry.ts:64-74`), stable side selection, seam rings.
Census notes already-compliant behavior (equal height, flat depth,
seam rings, internal overflow, byte-exact return —
`e2e/note-lifecycle.spec.ts:87-108,111-140,160-183,303-340`) must
stay green — those are regression fences, not targets.

### Files to Touch

`apps/desktop/src/renderer/note/paper/bound-geometry.ts`: measure
derivation replaces the 300 constant.
`apps/desktop/src/renderer/note/paper/bound-geometry.test.ts`:
retire stale-constant pins; pin the ch-band law + floor.
`apps/desktop/src/renderer/note/NotePanel.svelte`: consume the new
width; no other behavior.
`apps/desktop/e2e/note-lifecycle.spec.ts`: measured-column
assertion on the side-bound page (NOTE-PROP-01's evidence shape).

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and
**think**. Have you validated all aspects are **implemented** and
**tested**?
</CRITICAL_RULE>

- [ ] Round-1 review: verify the census citations against current
      source; record corrections here before code.
- [ ] Measure derivation in bound-geometry: 45–65ch at the page's
      type scale, derivation commented, minimum-measure floor.
- [ ] Side-bound page consumes measure width; equal-height and
      side-stability behavior unchanged (existing e2e green).
- [ ] Unit tests pin the band and the floor, not a constant; the
      stale pins are gone.
- [ ] e2e: rendered column measured in ch at aspects 1:1, 1:1.4,
      ≥1:3 (tall portrait) — needle case unproducible.
- [ ] Ticket body records the rotated-image PERMANENT-FOR-NOW
      ruling and the below-calendar exclusion.

### Acceptance Criteria

**Scenario:** A tall-portrait image with a bound note.
**GIVEN** a side-bound note on an image of aspect ≥1:3.
**WHEN** the book renders at 960 and at full width.
**THEN** the page column measures within ~45–65ch of its own type,
**AND** page height equals image height exactly,
**AND** no aspect can starve the column below the minimum measure.

**Scenario:** The shipped book behaviors hold.
**WHEN** the full note-lifecycle e2e runs.
**THEN** equal-height, seam rings, internal scroll, and byte-exact
reading-flight return all remain green.

### Issues Encountered

<!--
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->
