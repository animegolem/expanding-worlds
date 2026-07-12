---
title: Code audit — 2026-07-09 — Codex 5.6
date: 2026-07-09
auditor: Codex 5.6
baseline_commit: ce9e0d4a
branch: codex/audit-2026-07-09
status: complete
---

# Code audit — 2026-07-09 — Codex 5.6

## Executive assessment

The repository is coherent, unusually well documented, and strongly tested, but it is not ready for a data-safety release in its present state. This audit found four P1 defects in the single-writer, command-result, and export trust boundaries. Each can cause either concurrent writers, a project that remains falsely locked after a failed open, a durable mutation reported as failed, or arbitrary user-writable file replacement from the renderer capability surface.

The next risk tier is concentrated rather than diffuse: application undo does not yet implement the owner-ratified “every deliberate verb” rule, overlapping asynchronous gestures can collapse into one undo action, several client-composed actions continue after a failed prerequisite, and export/import paths lack atomic-finalization or resource-limit defenses. The ordinary happy path is in good shape: build, lint, 1,338 package/desktop unit tests, and the full Electron end-to-end run are recorded under Validation.

| Severity | Count | Release posture |
| --- | ---: | --- |
| P1 | 4 | Block release |
| P2 | 8 | Fix before broad deployment |
| P3 | 3 | Schedule with the owning subsystem |
| P4 | 0 | No separate P4 defect was strong enough to report |

This count excludes already-recorded work such as AI-IMP-185, AI-IMP-186, and AI-IMP-218 through AI-IMP-225. Where a new finding touches a known ticket, the relationship is called out rather than presenting the known issue as a new discovery.

## Audit basis and method

The audit ran in an isolated worktree at `/private/tmp/expanding-worlds-audit` on branch `codex/audit-2026-07-09`, fast-forwarded to `origin/main` at `ce9e0d4a`. The owner checkout was not modified. One identical untracked lifecycle-review file blocked the initial fast-forward; it was preserved in the shared Git stash as `codex-audit-prepull-identical-lifecycle-review` before the worktree was updated.

The review covered RFC-0001 revision 0.67, the design and accepted-decision record under `RAG/`, Electron main/preload/utility flow, renderer coordination, canvas engine gesture/scene flow, commands/handlers, SQLite project/lock/recovery, import/export, snapshots, and undo. Static review was supplemented by focused failure probes. Probe tests were temporary and were removed after execution; no production code was changed by the audit.

Severity means:

- **P1:** credible data loss/corruption, security-boundary failure, split-brain writer, or a protocol lie about durable state.
- **P2:** major user-visible integrity, undo, availability, or workflow failure with a narrower trigger or recoverable blast radius.
- **P3:** localized failure, leak, stale state, or durability weakness without immediate project corruption on the normal path.
- **P4:** minor correctness/polish defect. Warnings were not promoted without a demonstrated behavior defect.

## Architecture and control-flow assessment

The intended layering is present and generally respected: a sandboxed renderer uses preload capabilities; main owns OS/window/network/path capabilities; the utility owns authoritative project services; `Dispatcher` owns transactional mutations; the canvas is a projection; snapshots and export work around the one writer.

The defects cluster at asynchronous ownership boundaries: lock replacement is not compare-and-swap, service construction has no failure guard, post-commit notification shares the transaction error path, renderer code returns an unrestricted filesystem path to main, undo grouping is global across awaits, compound actions are not fail-stop, and snapshot/export stage independently inside the project.

## New findings

### CA-001 — P1 — stale lock recovery can produce multiple live writers

**Location:** `packages/persistence/src/lock.ts:54-97`, especially `83-97`.

`ProjectLock.acquire` replaces an existing stale lock by renaming a private temporary file over `project.lock`. Rename-overwrite is atomic, but it is not compare-and-swap ownership. Every contender can replace the path. One contender can verify its token and return before a later contender replaces the file; both callers then hold live lock objects and may open writable SQLite services.

The policy also reclaims a stale heartbeat when the recorded same-host PID is still alive. An event-loop stall, process suspension, or long synchronous operation beyond 30 seconds therefore lets another instance evict a live writer. The original open database handle is not revoked.

**Reproduction:** a synchronized 32-process probe using the production `staleAfterMs: 30000` produced 2, 3, 1, 1, and 1 successful live locks across five rounds. Two rounds violated single-writer. With `staleAfterMs: 0`, the same probe produced 32, 31, 30, 29, and 27 successes.

**Impact:** split-brain services can invalidate revisions, compete over WAL/checkpoint/recovery, and corrupt or lose work.

**Remediation:** use an OS-backed exclusive lock or another primitive with one possible winner. Do not treat a one-time read-back after replacement as ownership, and do not reclaim a same-host lock merely because a live PID's JavaScript heartbeat paused.

### CA-002 — P1 — failed service construction leaks the writer lock

**Location:** `packages/persistence/src/service.ts:127-185`; related paths in `project.ts:46-101` and `133-157`.

`openProjectService` obtains a writable handle, then runs recovery, registers APIs, and enqueues derivatives without a construction-level guard. If setup throws, `handle.close()` never runs. The heartbeat timer retains the lock and keeps refreshing it. The lower-level create/open paths also release the lock without consistently closing a database already opened when later setup fails.

**Reproduction:** a temporary test introduced an unreadable recovery artifact, observed `openProjectService` throw, repaired the directory, and retried. The retry failed with `ProjectLockedError` naming the same test PID and a fresh heartbeat.

**Impact:** one recoverable startup problem wedges a project until the utility dies and may leave file handles that obstruct repair/move/delete.

**Remediation:** after acquiring a handle, close it on every construction throw. Track and close `Db` before releasing locks on all exceptional lower-level paths. Add recovery/migration/identity/derivative fault tests.

### CA-003 — P1 — subscriber failure reports an error after commit

**Location:** `packages/persistence/src/dispatcher.ts:73-168`, especially `84-140`.

The transaction commits at line 122. Subscribers then run at line 132 inside the same outer `try`. If a subscriber throws, the generic catch returns `INTERNAL` even though the mutation, revision increment, and command-log row are durable. The comment claiming rollback is therefore false for this path. Production's subscriber posts over the utility parent port, which can throw during shutdown/transport failure.

**Reproduction:** a temporary test installed a throwing subscriber and executed a valid command. The result was `INTERNAL`, while direct queries showed the row, revision, and command-log entry committed.

**Impact:** the UI can omit undo/success handling or retry an action that already happened; the change event may also be lost.

**Remediation:** retain the committed result before notification. Notify outside transaction error mapping, isolate each callback, and surface delivery failure as service-health/refresh debt rather than rewriting the command result.

### CA-004 — P1 — renderer-controlled export path permits arbitrary file overwrite

**Location:** `apps/desktop/src/preload/index.ts:215-241`, `main/index.ts:835-861`, `persistence/src/export/project-export.ts:237-277`.

Main returns the save-dialog path to the renderer. A separate `export.run(destPath, activeOnly)` accepts any renderer-supplied path and forwards it without binding it to that dialog result. The utility creates parent directories and opens the path with `createWriteStream`, truncating any existing file.

This is a confused-deputy break in the sandbox's narrow capability surface. Passing the active `project.sqlite` path replaces the live database with ZIP bytes after export has prepared its snapshot; any other user-writable file is also in scope.

**Impact:** renderer compromise, injection, or an internal renderer bug can overwrite projects, settings, or user documents.

**Remediation:** combine choose-and-export in main, or issue a single-use opaque capability bound to the exact normalized path and requesting webContents. Reject destinations inside the active project, especially managed files.

### CA-005 — P2 — new durable commands do not reliably invalidate redo

**Location:** `apps/desktop/src/renderer/undo/undo-store.ts:206-235` and `undo-stack.ts` record behavior.

RFC §10.2 requires any new durable command after undo to clear redo. The coordinator sees gateway commits but forwards only commands in `CAPTURED_COMMANDS`. Uncaptured commits return before the stack sees them, and `UndoStack.record` returns early for a null inverse without clearing redo.

**Reproduction:** a temporary test captured `CreatePlacement`, undid it to establish `redoDepth === 1`, then committed `UpdateNote`. Redo depth remained 1 instead of becoming 0.

**Impact:** redo can replay onto a world changed by note autosave, canvas creation, note attachment, relinking, project commands, or other uncaptured mutations. This is broader than AI-IMP-221's gallery-specific gateway gap.

**Remediation:** pass every committed durable command to the coordinator. Always invalidate redo for a new non-undo/non-redo commit; decide separately whether that commit creates an undo entry.

### CA-006 — P2 — overlapping asynchronous undo groups merge unrelated actions

**Location:** `undo/undo-store.ts:85` and `135-147`; long-lived caller at `canvas/import-surfaces.ts:270-319`.

`pendingGroup` is one module-global accumulator. If another `runAsUndoGroup` starts while it is non-null, the second call silently joins the existing group. Multi-file import keeps a group open across file I/O, imports, transforms, scene waits, and optional framing while the renderer remains interactive.

**Reproduction:** a temporary test held group 1 open, committed A, completed unrelated group 2 with B, then completed C in group 1. The stack reported one undo action instead of two.

**Impact:** an unrelated note/tag/bookmark/board action can be absorbed into import; one Mod+Z reverses more than the user intended.

**Remediation:** make group identity explicit and operation-scoped. Nested calls should join only with the same group token; temporal overlap must not imply semantic grouping.

### CA-007 — P2 — compound actions continue after failure and can wait forever

**Location:** `canvas/host.ts:1179-1208` and `1540-1546`, `canvas/board-tooling.ts:286-309`, `canvas/import-surfaces.ts:299-305`.

Several multi-command user acts await a result but do not inspect its status before dependent commands. Move-and-frame can capture/release/arrange after `TransformContent` failed. Frame load can arrange after capture failed. Import ignores a transform result and then awaits `whenSceneApplied()`.

That waiter is an unqualified “next refresh”: it has no try-now condition, expected revision/canvas/item target, cancellation, or timeout. If transform fails and no event follows, import and its global undo group remain pending indefinitely. An unrelated event can also resolve it falsely.

**Impact:** membership can change without its move, layout can run against the wrong set, and a hung group amplifies CA-006.

**Remediation:** make every compound flow fail-stop by inspecting each `CommandResult`. Replace generic refresh waiting with target-aware wait primitives keyed to canvas, revision, and required IDs, with try-now and bounded cancellation.

### CA-008 — P2 — undo capture still violates the accepted deliberate-verb rule

**Location:** `undo/undo-store.ts`; call sites in `note/NotePanel.svelte:557-573`, `note/AttachNotePicker.svelte`, `menus/ContextMenu.ts:525-550`, `canvas/decorations-ui.ts:78-98`, and `canvas/gestures-ui.ts:213-275`; relink inverse at `persistence/src/handlers/notes.ts:300-432`.

AI-IMP-182 records the owner ruling that every deliberate verb joins Mod+Z except node-trash. Current capture sets/call sites omit AttachNoteToNode, CreateNoteAndAttach, MakeNoteIndependent, RelinkBrokenLinks, Group/UngroupDecorations, CreateCanvas, and some keyboard multi-selection flip/reorder/lock operations. Keyboard loops also emit one command/undo entry per selected item.

Relink has a deeper inverse defect: its `create` branch inserts a note and binds links, but the inverse is always `BreakNoteLinks`. That breaks the links while leaving the created note and its project-unique title reservation.

**Impact:** deliberate actions unpredictably ignore Mod+Z, batch gestures require N undos, and capturing the current relink inverse would leave durable residue.

**Remediation:** ratify and test a command-to-undo policy matrix. Give relink-create a compound inverse that also removes/trashes the note it created when safe, and group keyboard batch gestures explicitly.

### CA-009 — P2 — export truncates the final destination before success

**Location:** `packages/persistence/src/export/project-export.ts:237-277`.

Export writes directly to the final path. Stream error, disk-full, utility death, forced quit, or crash leaves a partial `.ewproj`. If replacing a previous backup, the old good file is destroyed as soon as the stream opens. Cleanup removes only internal staging.

**Impact:** a file presented as a portable backup may be unreadable, and a failed overwrite can destroy the last good copy.

**Remediation:** stream to a unique temporary sibling, close/fsync/validate it, then atomically rename the final file. Remove only the temp on failure. Combine with CA-004.

### CA-010 — P2 — snapshot can commit export staging and destination files

**Location:** `export/project-export.ts:139-160`; `main/snapshot.ts:64-78`, `177-191`, and `265-277`.

Export freezes a database and notes tree under `<project>/.tmp-export`. Snapshot's managed `.gitignore` does not exclude it, and snapshot stages the entire working tree with `git add -A`. Export and snapshot can overlap. A snapshot may therefore commit the temporary database/notes copy, duplicating a large project inside its own backup. Removing staging after `git add` does not unstage it. Saving the final `.ewproj` inside the project has the same problem.

This relates to AI-IMP-223, but the Git index/backup-volume consequence is additional. `seedGitignore` also returns when it sees the existing marker, so adding a line to the template alone will not update existing projects.

**Impact:** backups and remote pushes can unexpectedly gain a full duplicate database/archive, causing disk exhaustion, slow shutdown, and storage/network cost.

**Remediation:** stage export outside the project or in per-request OS temp. Snapshot should stage an explicit allowlist rather than `git add -A`; migrate the managed ignore block and reject export destinations inside the project.

### CA-011 — P2 — `.ewproj` import has no uncompressed resource limits

**Location:** `export/project-import.ts:48-101` and `107-171`; `export/manifest.ts:51-97`.

Import stores the full central directory with no entry-count cap, buffers `manifest.json` without a limit, and extracts inventoried entries without per-entry or aggregate uncompressed limits. Manifest `bytes` need only have JavaScript type `number`; values are not required to be finite non-negative integers and are never compared with ZIP metadata or streamed byte counts. Compression ratio is unbounded.

**Impact:** a user-selected malicious/damaged archive can consume unbounded memory or fill disk before hash verification finishes.

**Remediation:** cap entries, manifest size, per-entry/aggregate bytes, and compression ratio before extraction. Require unique paths and finite integer sizes, bind inventory to allowed entries, count streamed bytes, and enforce exact declared/final sizes.

### CA-012 — P2 — connector anchors may cross canvases in authoritative state

**Location:** `packages/persistence/src/handlers/decorations.ts:47-73`, `83-105`, and `164-197`.

Decorations and connector anchors are canvas-local. `validateAnchor` checks only that an active placement belongs to the project; it does not require the placement's `canvas_id` to match the decoration's canvas. Create/update can persist a connector on canvas A anchored to a placement on canvas B. Normal drawing currently supplies visible-canvas items, but the authoritative renderer-input boundary does not enforce the invariant.

The mounted scene has no display object for an off-canvas anchor, so rendering falls back to stored free-point data while the database claims a live anchor.

**Impact:** malformed commands or future call-site mistakes create durable relationships the scene cannot represent, with unpredictable delete/restore behavior.

**Remediation:** pass expected canvas to anchor validation and require exact equality on create/update. Add cross-canvas endpoint and re-anchor tests.

### CA-013 — P3 — releasing a pending source-slot acquisition does nothing

**Location:** `apps/desktop/src/renderer/chrome/source-slot.ts:28-78`.

Acquire increments `slotEpoch` before awaiting open. Release increments it only after a holder is installed. If a surface closes during its first pending acquire, `holder` is null and release returns; the late open still has a current epoch, installs the closed surface as holder, and leaves its secondary handle open.

**Impact:** quick open/close leaks a source slot and stale callback; stricter file-sharing platforms may then block move/delete until replacement or exit.

**Remediation:** model pending ownership explicitly. A matching release must invalidate it even before a holder exists, and a superseded successful open must be closed safely.

### CA-014 — P3 — Gallery can mark a closed source as open

**Location:** `apps/desktop/src/renderer/views/GalleryView.svelte:315-392`.

`openLibrary` checks `scopeEpoch` after acquiring, then may await `settings.setApp` without another check. If the user returns to “this world” during that write, `leaveEverything` closes the slot and clears `sourceOpen`; the stale continuation then sets it back to true.

**Impact:** a later Everything switch may query a closed source and remain empty/stale because assigning true to an already-true flag creates no corrective edge.

**Remediation:** recheck operation epoch and desired scope after every await; explicitly refresh from a successful open rather than relying on a boolean transition.

### CA-015 — P3 — app settings are non-atomic and save failures are ignored

**Location:** `apps/desktop/src/main/index.ts:223-263`; `renderer/settings/settings.ts:135-142`.

Each setting mutates the in-memory object, then rewrites `app-settings.json` directly at its final path. Crash/disk-full can leave truncated JSON; next launch silently treats parse failure as empty settings. Renderer changes are optimistic and the persistence promise is discarded, so rejection neither rolls back nor notifies.

**Impact:** one interrupted write can reset app preferences, library designation, first-run state, and related settings without explanation.

**Remediation:** temp-write, fsync/close, and atomic rename. Mutate/broadcast only after persistence succeeds, return typed failure, and roll back or surface save failure.

## Known backlog reviewed but not counted as new

- **AI-IMP-185:** wheel/background/keyboard/pointer-cancel gesture hardening.
- **AI-IMP-186:** frame appearance and membership resurrection semantics.
- **AI-IMP-218:** external `.git/index.lock` ownership; current behavior is a separately recorded P1 audit item.
- **AI-IMP-219 / 220:** destructive GC and trash retention.
- **AI-IMP-221:** gallery commands bypassing normal undo capture. CA-005/008 are broader coordinator/policy defects.
- **AI-IMP-222:** renderer file buffering for local imports.
- **AI-IMP-223:** export staging/concurrency. CA-010 adds the snapshot Git-index consequence.
- **AI-IMP-224:** explicit End Session control.
- **AI-IMP-225:** lifecycle and fault-test closure.
- **AI-IMP-173 follow-up:** its log names `import-batch.spec.ts` as the suite's worst recurring flake and says to harden it if it recurs. It did recur in this audit: the first attempt reported `8 imported · 3 deduplicated · 1 failed`, then passed on retry. This was already recorded, so it is not counted as a new finding, but the failure is behavioral rather than a launch-only timeout and should now be ticketed/hardened.

Build output also reports Svelte reactivity/accessibility warnings in CanvasHost, TagPanel, Dock, TitleStrip, NotePanel, Gallery, Outline, SourcePanel, and Quick Look. They should be cleaned up, but this audit did not classify warnings without a demonstrated behavior defect.

## Validation

Validation ran from the isolated worktree at `ce9e0d4a`:

- `pnpm build` — passed, with the warnings noted above.
- `pnpm lint` — passed.
- Package/desktop unit and integration tests — **1,338 passed**:
  - commands 18
  - domain 58
  - shared-ui 1
  - protocol 1
  - canvas-engine 387
  - persistence 538
  - desktop 335
- `pnpm --filter @ew/desktop exec playwright test` — **233 passed, 1 flaky (passed on retry), 0 terminal failures** across 234 cases in 7.0 minutes. The flake was the known `import-batch.spec.ts` behavior described above. The suite ran outside the filesystem sandbox because Electron GUI launch is disallowed inside it; initial in-sandbox “Process failed to launch” results were environmental, not product failures.

Focused probes verified CA-001, CA-002, CA-003, CA-005, and CA-006. Every temporary probe was removed, and the worktree was checked for unintended source changes before this report was added.

## Recommended remediation order

1. Replace the lock protocol and add multi-process/suspend fault tests (CA-001).
2. Close handles on every construction failure and isolate committed results from notification failure (CA-002/003).
3. Move export path authority into main and make final output atomic (CA-004/009).
4. Fix redo invalidation and replace temporal global grouping with explicit operation identity (CA-005/006).
5. Make compound actions fail-stop, then complete the deliberate-verb matrix and relink inverse (CA-007/008).
6. Isolate export staging, constrain snapshot staging, and enforce import budgets (CA-010/011).
7. Close the remaining authoritative/UI state gaps (CA-012 through CA-015).
8. Run the resulting fault suite on Windows and Linux before declaring filesystem/lifecycle closure.

## Residual coverage gaps

- No Windows/Linux execution. File sharing, replacement, open-handle deletion, titlebar behavior, and path normalization need native runs.
- No network filesystem, cloud-sync, process-suspend, power-loss, disk-full, or abrupt-kill matrix.
- No multi-gigabyte, high-entry-count, high-compression-ratio, or malformed-ZIP corpus was executed.
- Snapshot remote push was not exercised against a real remote/credential helper.
- This was broad review, not a formal proof of all production lines. The deepest review covered writer ownership, durable commands, recovery, undo, filesystem capabilities, import/export, snapshots, gesture coordination, and source-slot state.

## Exit criterion

Release should remain blocked until CA-001 through CA-004 have regression tests and merged fixes. A data-safety candidate should also close CA-005 through CA-011 or record explicit owner acceptance with user-visible containment for each remaining P2. Passing happy-path suites alone is not sufficient for the writer, crash, and disk-failure cases identified here.
