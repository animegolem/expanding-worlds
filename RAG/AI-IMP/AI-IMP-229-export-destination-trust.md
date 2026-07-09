---
node_id: AI-IMP-229
tags:
  - IMP-LIST
  - Implementation
  - export
  - security
  - P1
kanban_status: planned
depends_on: []
parent_epic:
confidence_score: 0.8
date_created: 2026-07-09
---


# AI-IMP-229-export-destination-trust

## Summary of Issue #1

Sol audit CA-004 + CA-009 (P1 + P2, lead-verified, remediated
together per the audit's own recommendation). CA-004: main's
`export:run` accepts ANY renderer-supplied path and forwards it to
the utility, which mkdir-p's and `createWriteStream`s it —
truncating whatever exists. Nothing binds the path to the save
dialog's result: a renderer bug or compromise can overwrite the
live project.sqlite, settings, or any user-writable file (confused
deputy through the sandbox's capability surface). CA-009: export
also writes DIRECTLY to the final destination, so stream error/
disk-full/crash leaves a truncated .ewproj and a failed overwrite
destroys the previous good backup at stream-open. Done means the
renderer can no longer name an arbitrary path (choose-and-export
fuses in main, or a single-use opaque token binds run to the exact
dialog-picked path + requesting webContents); destinations inside
the active project dir are refused; and the archive streams to a
unique temp sibling, closes/fsyncs/validates, then atomically
renames — failure removes only the temp.

### Out of Scope

- Staging-dir isolation inside the project (AI-IMP-223 carries
  CA-010).
- Import-side limits (AI-IMP-234).

### Design/Approach

Preferred shape: fuse — `export:choose-and-run(activeOnly)` in
main owns dialog + forwards the picked path itself; renderer never
sees a path parameter (keep `chooseDest` only if some UI needs the
path STRING for display, but run no longer accepts one). Refuse
picks under the project dir (realpath prefix check) with a typed
refusal the UI can phrase. Utility side: write to
`${dest}.partial-${uuid}`, fsync + close, verify the manifest hash
it already computes, `renameSync` into place; unlink the partial
on any failure. Preload/protocol types updated; existing export
e2e reworked to the fused call + new failure-path test (inject a
stream error, assert old file intact + partial gone).

### Files to Touch

`apps/desktop/src/main/index.ts`, `preload/index.ts`, protocol
types, `packages/persistence/src/export/project-export.ts`, export
e2e + persistence spec.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [ ] Renderer cannot supply an arbitrary destination; in-project
      destinations refused (typed).
- [ ] Atomic finalization: temp sibling + fsync + validate +
      rename; failure preserves the prior file, removes the temp.
- [ ] E2e: happy path via the fused call; failure path proves the
      old backup survives.
- [ ] Gates: build, per-package units, lint, e2e in 4+ foreground
      shards.
- [ ] HUMAN-TESTING entry appended at merge by the lead.

### Acceptance Criteria

**GIVEN** an export whose stream dies mid-write over an existing
backup
**THEN** the existing backup is untouched and no partial file
remains — and no renderer path can ever aim the exporter at the
live project.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->
