---
node_id: AI-IMP-121
tags:
  - IMP-LIST
  - Implementation
  - backup
  - restore
kanban_status: planned
depends_on: [AI-IMP-120]
parent_epic: [[AI-EPIC-008-export-import-signoff]]
confidence_score: 0.7
date_created: 2026-07-06
date_completed:
---


# AI-IMP-121-restore-from-backup

## Summary of Issue #1

Rev 0.52 §11.4 promotes restore from external-only to a minimal
in-app surface: Restore from backup… lists snapshots by date (with
their generated messages) and materializes the chosen snapshot as a
NEW project directory — never in-place; destroy-nothing applies to
time travel. Done means: from a project with snapshot history, the
user can pick a snapshot, choose/confirm a destination, and the app
creates a sibling project directory from that snapshot (db, assets,
notes tree), then offers to open it; the original project is
untouched throughout.

### Out of Scope

- In-place rollback of any kind.
- History diff/browse UI beyond the dated list.
- Partial restore (single note/asset).
- Snapshot deletion or retention management.

### Design/Approach

Entry point rides the ☰ inventory near Trash… (system safety
surface, §8.2 geography) — exact row placement is a lead review
call at merge. The list reads `git log` (date, message, short SHA)
via the same git mechanics layer AI-IMP-120 lands. Materialize =
`git archive`-style extraction of the chosen commit into a new
directory named `<project>-restored-<date>` beside the original
(collision-suffixed), then run the standard open path — startup
recovery (§11.2) rebuilds derivatives lazily, and the imported
project coexists per §16 (locks scope to the directory). Confirm
copy follows §9 grammar: states what will be created and that the
current project is untouched. Restoring while the current project
has unsaved/unsnapshotted changes is fine — nothing about the
current project changes.

### Files to Touch

`apps/desktop/src/main/` restore handler beside the snapshot
service (extract + validate).
`apps/desktop/src/preload/index.ts`: bridge.
`packages/protocol/src/index.ts`: snapshot-list + restore calls.
`apps/desktop/src/renderer/chrome/MenuPopover.svelte`: row.
`apps/desktop/src/renderer/views/` restore picker (new, takeover or
dialog per §8.2 — leaving is not browsing suggests a dialog).
`apps/desktop/e2e/restore.spec.ts` (new).

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [ ] Snapshot list query: date + message + SHA over the 120
      mechanics layer; empty/short history states.
- [ ] Materialize: extract chosen commit to
      `<project>-restored-<date>` (collision-suffixed), validate
      the extracted db opens (schema-ahead guard applies), never
      write inside the source project.
- [ ] Picker UI: dated list, §9-grammar confirm naming the new
      directory, then offer Open Restored Project.
- [ ] ☰ row wired; disabled with explanation when snapshots are
      off or history is empty.
- [ ] E2E: create snapshots, restore an older one, assert the new
      directory opens with that snapshot's content and the
      original is byte-untouched (mtime/hash spot check).
- [ ] Gates: `pnpm -r build`, `pnpm -r test`, `pnpm -r lint`,
      desktop e2e hidden.
- [ ] HUMAN-TESTING entry appended (does the confirm read as
      safe-copy, not rollback?).

### Acceptance Criteria

**Scenario:** Recovering yesterday's state.
**GIVEN** a project with several snapshots
**WHEN** the user opens ☰ → Restore from backup… and picks an older
snapshot
**THEN** a confirm states a NEW directory will be created and the
current project is untouched
**AND** accepting creates the sibling directory from that snapshot
and offers to open it.
**WHEN** the restored project opens
**THEN** its content matches the snapshot and derivatives rebuild
lazily.
**AND** the original project's files are unmodified.
**GIVEN** snapshots are off or history is empty
**THEN** the row is visibly disabled with the reason.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->
