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

- [x] Seed asset set chosen (public domain, license notes in the
      seed dir) and bundled; owner eyeball queued.
- [x] Create-new-library seeds through ordinary commands: artist
      root board, per-artist boards, placed works, notes, tags,
      pinned explainer.
- [x] Clear-the-example trashes every example record + explainer in
      one action; nothing else touched; empty-trash purges cleanly.
- [x] Designating an EXISTING project as library seeds nothing.
- [x] e2e: create library → example present → clear → gallery
      empty except user content.
- [x] Full gates.

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

- **Clear-action deviation from the RFC's shape (record for the
  epic-close RFC consistency pass).** §14.4 wants the clear to be
  "the explainer note's one power" — but the explainer note lives IN
  the library while the user stands in a primary project
  (switch-project is deferred), and executing commands against a
  secondary has no cross-process verb. Shipped shape: the explainer
  BODY instructs, and the actual action is a "Clear the example set"
  button in the gallery's everything-scope header, visible only
  while example-tagged content exists. It rides a narrow new utility
  verb `clear-library-example` (deliberately not a general
  secondary-execute door) that enumerates by the shared `example`
  tag and trashes via ordinary TrashNode commands. Consequence: the
  acceptance line "undo restores them like any trash" holds only via
  the library's Trash (RestoreRecord) — the primary's renderer undo
  stack never saw these commands, so Cmd+Z in the current world does
  not restore the example. Restore-from-trash works once the user
  can stand in the library.
- **Seed images are GENERATED placeholders, not public-domain works
  yet** (no network access in the implementation environment): nine
  distinct gradient/pattern PNGs (`scripts/generate-seed.mjs`,
  committed output, 83 KB total) grouped under three FICTIONAL
  artist names so no real artist is misattributed.
  `resources/seed/LICENSE.md` records provenance (CC0, generated)
  and queues the curated public-domain swap — content, not code
  (the seeder reads whatever images live in the directory).
  HUMAN-TESTING entry is the lead's to add (file outside this
  ticket's fence).
- **Seeding runs inside the utility at creation time** against the
  fresh service directly (`open-secondary` gained `createIfMissing`
  + `title` + `seedDir`, library target only; source refuses
  INVALID_TARGET) — the alternative, a general secondary-execute
  verb, is a much wider protocol door than this ticket justifies.
  Main resolves `seedDir` because the utility knows no app paths.
- **Resources path**: `app.getAppPath()` resolves to `out/main`
  when Electron is launched pointing at the entry file (how e2e
  launches), so the seed dir resolves `__dirname/../../resources/
  seed` unpackaged. PACKAGED BUILDS NEED A ONE-LINE
  electron-builder addition (out of this ticket's file fence):
  `extraResources: [{ from: resources/seed, to: seed }]` — main
  already looks in `process.resourcesPath/seed` when packaged.
- **"Empty-trash purges cleanly" is validated by composition, not
  directly**: the clear produces perfectly ordinary trashed nodes
  (e2e asserts all 13 appear in the library's `getTrashView`), and
  PurgeRecord over ordinary trashed nodes is covered by existing
  persistence lifecycle tests. It cannot be exercised end-to-end
  over the seam today for the same reason as the clear deviation —
  no execute verb against a secondary.
- The clear borrows the WRITABLE library slot for the duration
  (open → clear → close) while the everything scope keeps browsing
  through the read-only source slot; a read-only open holds no lock,
  so the two coexist on the same directory by design (AI-IMP-088).