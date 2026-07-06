---
node_id: AI-IMP-094
tags:
  - IMP-LIST
  - Implementation
  - library
  - onboarding
kanban_status: planned
depends_on: [AI-IMP-089]
parent_epic: [[AI-EPIC-015-library-and-cross-project-sourcing]]
confidence_score: 0.65
date_created: 2026-07-06
date_completed:
---

# AI-IMP-094-first-open-seed

## Summary of Issue #1

§14.4: the first time the library surface opens, it is pre-seeded
with a small public-domain art set arranged the intended way — a
root board of artists whose nodes dive into per-artist boards with
placed works, notes, and tags. The explainer is an ordinary pinned
note whose one power is "clear the example" — an ordinary trash
command over the example records and itself. The tutorial is made
of the app's own furniture. Done = creating the library project
(089's designation flow, create-new path) seeds the example;
clearing removes every example record through ordinary trash; e2e.

### Out of Scope

- Seeding EXISTING projects designated as library (seed only on
  create-new — designating an existing project must not inject
  content into it).
- Any tutorial UI beyond the explainer note.
- Large asset sets: ≤ ~12 images, small files, bundled.

### Design/Approach

Seed assets bundle as app resources (public-domain works — small
JPEG/WebP re-encodes, a few MB total; OWNER EYEBALL invited on the
set before ship, queued in HUMAN-TESTING). Seeding runs through
the ORDINARY import pipeline + commands (no SQL fixtures): stage
each file, create nodes, boards, placements, notes, tags exactly
as a user would — so clear-the-example is nothing but trash
commands. The example records carry one shared tag (e.g.
`example`) so the explainer's clear action can enumerate them
honestly; the explainer note lists what it will do. Clear = trash
every example-tagged node/board + the explainer itself, through
DeleteContent.

### Files to Touch

Seed assets under `apps/desktop/resources/seed/`; a seeding module
in the renderer or utility (decide with 089's create-library flow);
`apps/desktop/e2e/library-seed.spec.ts` (new).

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and
**think**. Have you validated all aspects are **implemented** and
**tested**?
</CRITICAL_RULE>

- [ ] Seed asset set chosen (public domain, license notes in the
      seed dir) and bundled; owner eyeball queued.
- [ ] Create-new-library seeds through ordinary commands: artist
      root board, per-artist boards, placed works, notes, tags,
      pinned explainer.
- [ ] Clear-the-example trashes every example record + explainer in
      one action; nothing else touched; empty-trash purges cleanly.
- [ ] Designating an EXISTING project as library seeds nothing.
- [ ] e2e: create library → example present → clear → gallery
      empty except user content.
- [ ] Full gates.

### Acceptance Criteria

**GIVEN** a fresh library created through the designation flow
**WHEN** it first opens
**THEN** an example world of artists/boards/notes/tags is present
with a pinned explainer note.
**WHEN** the artist clicks clear-the-example
**THEN** all example records and the explainer land in Trash via
ordinary commands, and undo restores them like any trash.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->
