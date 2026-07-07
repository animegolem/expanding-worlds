---
node_id: AI-IMP-119
tags:
  - IMP-LIST
  - Implementation
  - notes
  - persistence
  - note-panel
kanban_status: completed
depends_on:
parent_epic:
confidence_score: 0.7
date_created: 2026-07-06
date_completed: 2026-07-06
---


# AI-IMP-119-note-metadata-block

## Summary of Issue #1

Rev 0.51 §7.8 ratifies the system metadata block: derived,
system-written metadata persisted into the tail of a note's body so
exports are self-documenting, rendered in-app as a structured card
below the editor (never raw text). V1 sections: Placements tree
(default ON — boards grouped respecting nesting, counts, fly-to
entries), Provenance (default ON for image-backed nodes — original
filename, import date, source URL when present), Timestamps
(default OFF). Freshness is lazy: display always computes live; the
persisted block rewrites only when the system touches the body
anyway (rename re-keying today; export/backup hooks when EPIC-008
lands). Done means: a note on a multi-board node shows a live
placements card whose entries fly to their placement, the persisted
body carries the block after a system touch, the block renders as
plain markdown outside the app, hand-edits inside it are replaced
wholesale on refresh, and per-note + Settings toggles govern it.

### Out of Scope

- Export/backup refresh hooks (EPIC-008 — the refresh function
  ships here, its export call sites land there).
- Connector-named provenance and connector-added sections
  (EPIC-020 surface, explicitly future).
- Any schema change: provenance uses existing asset columns
  (original_filename, source_url, created timestamps). No
  migration is reserved for this ticket.
- Card visual design (Design-letter-3 item 16) — ship legible
  placeholder styling on theme tokens.

### Design/Approach

A pure block module (`packages/persistence` or shared util) owns
the marker grammar: `stripMetadataBlock(body)` →
`{prose, hadBlock}` and `renderMetadataBlock(sections)` → markdown
under a horizontal rule + HTML-comment fence. Regeneration is
always wholesale — parse never preserves inner content. The editor
loads ONLY the prose half; the block never appears in the editing
surface; system saves reassemble prose + fresh block. Refresh rides
the rename-rewrite discipline: no undo entry, deferred when the
editor is dirty. Live data: a placements-by-board query (existing
structure queries likely cover most of it) grouped by board
nesting; provenance from the node's asset row. The note panel
mounts a MetadataCard below the editor: sections per registry,
fly-to per placement entry (reuses panel-aware flights), per-note
toggle in panel chrome; per-section global defaults in Settings.
Per-note toggle state is note presentation state (existing
presentation storage, not a migration). Toggle-off strips the block
at the next system touch.

### Files to Touch

`packages/persistence/src/note-metadata.ts` (+ test): new — marker
grammar, strip/render, section registry.
`packages/persistence/src/queries-structure.ts` (or new query):
placements-by-board tree for a note's nodes.
`packages/persistence/src/handlers/note.ts` (rename-rewrite path):
regenerate block during system body rewrites.
`packages/protocol/src/index.ts`: query + toggle surface additions.
`apps/desktop/src/renderer/notes/MetadataCard.svelte`: new — card,
sections, fly-to entries, toggle.
`apps/desktop/src/renderer/notes/NotePanel*` / editor loader: strip
block before editor mount, reassemble on save.
`apps/desktop/src/renderer/views/SettingsView.svelte`: per-section
global defaults.
`apps/desktop/e2e/note-metadata.spec.ts`: new.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [x] Block module: marker grammar, `stripMetadataBlock`,
      `renderMetadataBlock`; units cover round-trip, wholesale
      replacement of hand-edited content, body-without-block,
      block-only body, and idempotent re-render.
      (`packages/domain/src/note-metadata.ts` + `.test.ts`, 10 tests.)
- [x] Placements-by-board query: boards grouped respecting
      nesting, per-board counts, placement ids for fly-to; unit
      coverage including a node placed on nested boards.
      (`getNoteMetadata` in queries-notes; `computeNoteMetadata` in
      `note-metadata-db.ts` + `.test.ts`.)
- [x] Editor seam: the editor NEVER shows the block — prose is
      stripped on load, block reassembled on system-side save; a
      user save of prose does not duplicate or destroy the block.
      (`note-editor.ts`; e2e asserts editor never contains
      "Placements".)
- [x] Refresh discipline: block regenerates during rename-rewrite
      body touches; no undo entry; deferred while the editor is
      dirty (unit or integration proof). (`refreshNoteMetadataBlock`
      folded into RenameNote — same transaction, no separate inverse,
      does not bump updated_at; §10.2 flush-first keeps a dirty
      editor from being clobbered. Persistence tests cover rename of
      the note and of a re-keyed source.)
- [x] MetadataCard below the editor: live-computed sections,
      fly-to entries navigate to the placement, per-note toggle;
      toggle-off strips block on next system touch. (`MetadataCard.svelte`
      + NotePanel wiring; e2e drives fly-to + toggle-off strip.)
- [x] Settings: per-section global defaults (Placements ON,
      Provenance ON, Timestamps OFF). (SettingsView "Note metadata"
      section → `note_metadata_defaults` project setting.)
- [x] E2E: multi-board placements card + fly-to; persisted block
      appears in the body after a system touch; toggle-off strips.
      (`e2e/note-metadata.spec.ts`, 2 tests.)
- [x] Gates: `pnpm -r build`, vitest, lint, desktop e2e hidden;
      pandoc untouched (doc-side landed in rev 0.51 commit). (Build
      green; `pnpm lint` clean; packages vitest green; desktop e2e
      132/132 including the flake source-panel:68 on first try.)
- [x] Append HUMAN-TESTING.md entry (card feel, tree scannability,
      "does the export read right in Obsidian"). (Appended by the
      lead at merge, per the agent-fence protocol.)

### Acceptance Criteria

**Scenario:** A note whose node is placed on several boards.
**GIVEN** a note attached to a node placed 3 times across 2 boards
**WHEN** the note panel opens
**THEN** a metadata card below the editor shows a placements tree
grouped by board with counts
**AND** clicking an entry flies the canvas to that placement.
**WHEN** the system next rewrites that note body (e.g. a rename
re-key) or an explicit refresh runs
**THEN** the persisted body ends with the metadata block as plain
markdown under the marker.
**WHEN** the user edits text inside the block on disk and a refresh
runs
**THEN** the block is regenerated wholesale.
**WHEN** the per-note toggle is switched off
**THEN** the card hides and the next system touch strips the block.
**GIVEN** an image-backed node's note
**THEN** the provenance section lists original filename, import
date, and source URL when present.
**GIVEN** the editor holds unsaved text
**THEN** no system refresh clobbers it (refresh defers).

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->

- **Pure grammar lives in `@ew/domain`, not `packages/persistence`.**
  The ticket suggested `packages/persistence/src/note-metadata.ts`, but
  the renderer's editor (`note-editor.ts`) needs `stripMetadataBlock`
  to strip on load / reattach on save, and the renderer never imports
  `@ew/persistence` values (its Node/SQLite deps). The marker grammar
  is pure, so it belongs in `@ew/domain` (already a renderer dep). The
  DB read model + lazy refresh stay in persistence
  (`note-metadata-db.ts`).

- **Placements "respecting nesting" is rendered as indent-by-depth,
  not a full parent→child tree.** Each board carries its shortest
  containment distance from the root canvas (BFS with a visited set,
  invariant 19) and the markdown/card indents by that depth. Two
  boards at the same depth under different parents are not visually
  distinguished — a faithful V1 of "grouped by board respecting
  nesting"; a true ancestry tree can come with the design pass if
  wanted.

- **Lazy refresh is wired to the RenameNote path only** (plus the
  exported `refreshNoteMetadataBlock` for EPIC-008 export/backup). A
  rename refreshes the renamed note's own block AND every source note
  whose body it re-keys — both are "the system rewrites that note body"
  moments (§7.8). Refresh runs inside the command transaction (no
  separate undo step) and deliberately does NOT bump `updated_at` (the
  derived block is a cache, not a user edit).

- **Pre-existing test updated, not broken.** `notes.spec.ts:235`
  asserted a placed source note's body equalled its prose exactly;
  after this change that note correctly carries a metadata block at the
  tail once its tokens are re-keyed. Updated the assertion to check the
  re-keyed prose prefix + the presence of the block, and to assert the
  editor still shows prose only. This is spec-correct behavior, not a
  regression.

- **Per-note toggle + per-section defaults ride the settings table**
  (`note_metadata_note:<id>` and `note_metadata_defaults`) — existing
  project-tier presentation storage, NO migration. Toggling a note off
  hides the card live and strips the persisted block at the next system
  touch (not immediately), per §7.8.

- **Known cosmetic edge (not fixed, low priority):** a `card`-appearance
  node's board excerpt is `substr(body, 1, 140)` server-side; for a very
  short note whose prose is under ~140 chars, the excerpt could bleed
  into the `---` rule / block. Out of scope here (card design is
  Design-letter-3 item 16); flagged for the design pass.

- All gates green from the worktree: `pnpm -r build`, `pnpm lint`,
  package vitest (domain 10 + persistence 10 new, plus existing),
  desktop e2e 132/132 (hidden windows; the source-panel:68 flake
  passed on first try).
