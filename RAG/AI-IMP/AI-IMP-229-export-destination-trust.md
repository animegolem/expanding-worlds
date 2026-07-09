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

- [x] Renderer cannot supply an arbitrary destination; in-project
      destinations refused (typed).
- [x] Atomic finalization: temp sibling + fsync + validate +
      rename; failure preserves the prior file, removes the temp.
- [x] E2e: happy path via the fused call; failure path proves the
      old backup survives.
- [x] Gates: build, per-package units, lint, e2e in 4+ foreground
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

**Surface shape — fused, not token.** `ExportDialog`/`SettingsView` never
displayed the picked path: `runExport` called `chooseDest()` only to feed
it straight into `run(dest, …)`. So `chooseDest` had no display purpose and
both it and `run` were removed. New surface: `export.chooseAndRun(activeOnly)`
→ `export:choose-and-run` IPC. Main owns the save dialog AND forwards the
picked path itself; the renderer never sees or names a path. Preferred by
the ticket, simpler than an opaque token (no token minting/binding/expiry),
and structurally closes the confused-deputy surface — the sandbox's only
export entry cannot carry a path. The main→utility `ExportProjectRequest`
still carries `destPath` (main is the trusted namer now), so
`packages/protocol` needed no change. Renderer `EwApi` type updates
automatically (`EwApi = typeof api`); no separate `.d.ts` to touch.

**In-project refusal** lives in main (`destInsideProject`): realpath the
project dir and the dest's PARENT (dest file may not exist yet), lexical
`resolve` fallback when the parent is a not-yet-created dir, prefix-compare
with a trailing `sep` so `…/projectfoo` can't false-match `…/project`.
Returns a typed `{ ok:false, code:'DEST_IN_PROJECT', message }` the UI toasts.

**Atomic finalization** in `project-export.ts`: stream to
`${dest}.partial-<uuid>`, `fsync` (fresh read handle — fsync is per-inode),
`verifyArchive` (re-open with yauzl, confirm every manifest inventory entry
is present and its streamed sha256 matches the sealed hash — assets are
STORED under their content-hash name so they re-confirm too; yauzl's per-
entry CRC also catches truncation), then `renameSync` into place. A
function-scoped `partialPath` is cleared only after the rename; the `finally`
removes any leftover partial, so a failure at any step preserves the prior
file and leaves no residue. Added a test-only `beforeRename` hook (mirrors
the existing `beforeStream`) to inject a promotion failure.

**Failure-path proof.** Persistence unit test injects `beforeRename` throw
over an existing good backup → asserts the prior file is byte-identical and
no `backup.ewproj.partial*` sibling remains. E2e proves the same at the seam
via a read-only destination dir (the partial can't be opened) → refused,
prior backup intact, no `.partial` residue. Both pass.

**E2e dialog seam.** The fused call moved the save dialog into main, so e2e
can no longer hand `run` a path. Tests now stub `dialog.showSaveDialog` in
the MAIN process via `app.evaluate(...)` (playwright ElectronApplication),
then drive the single `chooseAndRun`. Added a test asserting the old
`run`/`chooseDest` keys are absent from `window.ew.export` — the renderer's
only bridge — proving the path-naming channel is gone.

**Validation:** `pnpm -r build` ✓; `pnpm --filter='./packages/*' test`
persistence 539 ✓ (canvas 387, domain 58, protocol 1, shared-ui 1); desktop
`npx vitest run` 335 ✓; `pnpm lint` clean; e2e 4 shards a-d/e-i/j-r/s-z =
45/66/75/50 = 236 (matches `--list` total).

**Minor friction / follow-up.** With the fuse, `SettingsView` sets the
optimistic 0% progress bar BEFORE the call (the dialog is now inside it), so
cancelling the save dialog flashes a 0% bar for the dialog's lifetime then
clears it — a trivial cosmetic regression from the old order. Kept for the
large-export prep-gap feedback it still provides; worth a human feel pass.
