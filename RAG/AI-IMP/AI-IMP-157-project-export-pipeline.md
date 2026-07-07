---
node_id: AI-IMP-157
tags:
  - IMP-LIST
  - Implementation
  - export
  - persistence
kanban_status: planned
depends_on: [AI-IMP-120]
parent_epic: [[AI-EPIC-008-export-import-signoff]]
confidence_score: 0.75
date_created: 2026-07-07
date_completed:
---


# AI-IMP-157-project-export-pipeline

## Summary of Issue #1

EPIC-008 FR-1/FR-2/FR-4 (+ absorbs deferred AI-IMP-093). RFC §16
requires a portable project export; rev 0.57 decided the container:
one `.ewproj` ZIP — `manifest.json` (export version, schema version,
project ID, root node ID, creation time, active-only flag, content
inventory with hashes), checkpointed `project.sqlite`, readable
`notes/` tree, original `assets/` under content-addressed paths —
the same layout the §11.4 snapshot repo writes. Export runs in the
utility process with progress reporting and streams at constant
memory (stored media entries, deflated db/notes). An
active-content-only variant excludes trashed records and assets
referenced only by trash. The rev 0.18 size doctrine rides along:
computed size is a live footer fact on the export surface; first
export over the warn threshold adds one acknowledge line, confirmed
once per project, never a gate. Done means: Settings › Backups &
export gains "Export project…" producing a valid `.ewproj` whose
manifest inventory verifies, with progress, size footer, and the
active-only toggle.

### Out of Scope

- Import (AI-IMP-158 proves the roundtrip; this ticket may include
  a manifest-level self-check only).
- The escape-hatch exports (Obsidian vault, JSON Canvas, rendered
  boards) — deferred with scope in §16.
- Media filename policy (rev 0.35 musing — export-selection, not
  project export).

### Design/Approach

Utility-process job (the snapshot writer's home): WAL-checkpoint
the db to a temp copy (reuse the snapshot checkpoint path), write
the notes tree (reuse `snapshot-write-notes`), then stream a ZIP:
`yazl` (or hand-rolled stored-entry writer if the dep is declined)
with STORE for `assets/**` (already-compressed media) and DEFLATE
for `project.sqlite` + `notes/**` + `manifest.json`. Manifest
written LAST but placed FIRST in the archive is unnecessary — the
central directory serves lookup; write order is free. Active-only:
export from a filtered temp db (SQL delete of trashed rows +
orphaned asset rows inside the temp copy — never the live db), and
the asset set recomputed from the filtered references. Progress:
per-entry byte counts over a precomputed total, reported over the
existing utility progress channel. Size footer: sum of file sizes
(stored) + estimate for deflated members computed live on the
Settings surface; warn-threshold acknowledge is an app preference +
per-project "acknowledged" project setting. IPC: one `export-project`
utility request mirroring the snapshot request shape; renderer
surface in SettingsView's Backups & export tenant with a save
dialog (main process `dialog.showSaveDialog`, `.ewproj` filter).

### Files to Touch

`apps/desktop/src/utility/` export job + zip writer (+ vitest for
manifest shape, stored-vs-deflate policy, active-only filter).
`apps/desktop/src/main/index.ts`: save-dialog + utility relay.
`packages/protocol`: the export request/response + progress types.
`apps/desktop/src/renderer/views/SettingsView.svelte`: the row,
size footer, active-only toggle, acknowledge line.
`apps/desktop/e2e/export-import.spec.ts` (new): export produces a
zip whose manifest inventory matches on-disk hashes; active-only
excludes a trashed record.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [ ] Utility export job: checkpointed db + notes tree + assets +
      manifest streamed into `.ewproj`; STORE/DEFLATE policy per
      rev 0.57; constant-memory (no whole-file buffering).
- [ ] Manifest carries export version, schema version, project ID,
      root node ID, created_at, active_only, inventory with hashes;
      unit-tested shape.
- [ ] Active-only variant: filtered temp db, recomputed asset set;
      live db never touched; unit + e2e coverage.
- [ ] Progress events over the utility channel; Settings surface
      shows live size footer + one-time warn acknowledge.
- [ ] E2E: export → manifest inventory verifies against archive
      contents; hashes match source assets.
- [ ] Gates: `pnpm -r build`, `pnpm -r test`, `pnpm lint`, desktop
      e2e hidden.
- [ ] HUMAN-TESTING entry appended at merge by the lead.

### Acceptance Criteria

**GIVEN** a project with notes, assets, placements, and trash
**WHEN** Export project… runs
**THEN** a `.ewproj` ZIP exists whose manifest validates, whose
asset hashes match the store, and whose creation streamed without
loading whole assets into memory
**AND** the active-only variant omits trashed records and
trash-only assets.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->
