---
title: Code audit - 2026-07-10 - Codex
date: 2026-07-10
auditor: Codex
baseline_commit: 8a86f2166a510ef2f5adff1b4681a06f2929c9c4
branch: codex/audit-2026-07-10
status: complete
---

# Code audit - 2026-07-10 - Codex

## Executive assessment

This pass rotated through desktop main/preload/utility boundaries, persistence
transactions and command dispatch, portable import/export, snapshots and
backup, undo, renderer settings, and canvas resource lifecycles. It found 14
actionable defects after deduplication against the ticket index, design queue,
lifecycle inventory, and prior audits.

| Severity | Count | Assessment |
|---|---:|---|
| P1 | 5 | Data-loss, trust-boundary, local-file, or SSRF failures that should block a 1.0 release. |
| P2 | 7 | Serious correctness or resource-lifecycle failures with narrower triggers. |
| P3 | 2 | User-visible stale-state races without durable data loss. |

The release-blocking language above applies to 1.0. It does not change the
project's stated cadence for testing builds.

## Method and scope

- Reviewed `origin/main` at `8a86f216` in an isolated clone.
- Followed control paths across process and persistence boundaries rather than
  reviewing only the newest diff.
- Rotated subsystems after each finding to avoid concentrating on one family.
- Used focused Node/SQLite/filesystem probes for transaction failure, non-finite
  geometry, symlink traversal, and asynchronous theme ordering.
- Deduplicated against `RAG/INDEX.md`, `RAG/DESIGN-QUEUE.md`,
  `RAG/design/DESIGN-GAPS.md`, `RAG/design/LIFECYCLE-INVENTORY.md`, and prior
  audit and lead-review records.
- Deliberately excluded the active AI-IMP-249 Windows lock work.

Severity is based on plausible product impact, not code style: P1 is durable
data loss or a meaningful trust-boundary failure; P2 is serious correctness,
availability, or bounded data-integrity risk; P3 is a localized behavioral
defect with a practical recovery path.

## P1 findings

### C10-001 - A failed note commit is reported as a successful flush

**Evidence:** `apps/desktop/src/renderer/note/note-editor.ts:259-303`,
`apps/desktop/src/renderer/note/note-editor.ts:135-180`,
`apps/desktop/src/renderer/note/panels.ts:501-510`,
`apps/desktop/src/renderer/note/panels.ts:626-628`, and
`apps/desktop/src/preload/index.ts:128-136`.

`flushPending()` resolves normally when the command returns a typed
non-committed result. It calls `onError`, but leaves the rejected draft only in
the current editor. `open()`, `close()`, and `rename()` await that resolved
promise and continue with destructive state changes. Panel close starts a
flush and immediately deletes the panel, while the app-level flush path catches
all callback failures and sends an undifferentiated `app:flush-done` anyway.

**Impact:** a disk, utility, or SQLite failure during note save can lose the
draft when the user changes notes, closes the panel, closes the utility window,
or quits the app. The UI can show an error while still destroying the only copy
of the text.

**Repair:** make flush return or throw a mandatory success result. Destructive
callers must retain the editor and buffer after failure. Include failure in the
main-process flush acknowledgement and test switch, close, and quit under an
injected non-commit result.

### C10-002 - `restore:open` is a renderer-controlled arbitrary-directory capability

**Evidence:** `apps/desktop/src/preload/index.ts:201-206`,
`apps/desktop/src/main/index.ts:177-180`,
`apps/desktop/src/main/index.ts:818-835`, and
`apps/desktop/src/main/index.ts:873-880`.

The preload exposes `snapshot.open(dir)`, and the main handler accepts the raw
renderer string and relaunches with `--ew-open-dir`. Startup then treats that
directory as a project with `createIfMissing: true` and seeds managed files.
The path is not derived from a main-owned chooser, restore result, or opaque
capability.

**Impact:** a compromised renderer, an injection elsewhere in the renderer, or
a renderer logic bug can make the privileged process create and modify project
state in any writable directory. This reintroduces the confused-deputy class
that the fused export/import flows were designed to remove.

**Repair:** fuse restore/open selection and execution in main, or issue a
single-use opaque capability bound to the sender and a main-selected directory.
Do not expose a raw filesystem path operation to the renderer.

### C10-003 - Managed project paths follow symlinks outside the project root

**Evidence:** `apps/desktop/src/main/index.ts:343-380`,
`apps/desktop/src/main/index.ts:818-835`,
`apps/desktop/src/main/snapshot.ts:235-258`,
`packages/persistence/src/notes-tree.ts:112-151`, and
`packages/persistence/src/recovery.ts:91-100` and `:123-145`.

Project startup, snapshot maintenance, note-tree projection, asset serving, and
recovery operate on lexical paths under the project root using APIs that follow
symlinks. Neither managed roots nor final files are checked with `lstat` and
realpath containment. A focused filesystem probe confirmed both directory and
file symlinks are followed by the same read/write patterns.

**Impact:** a crafted, locally copied, or git-restored project can redirect
note writes/deletes and `.gitignore` writes outside the project. A symlinked
asset/store path can also expose an arbitrary local file through the app's
asset protocol, which grants permissive CORS. Recovery can remove content
outside the intended managed tree.

**Repair:** reject symlinked managed roots and files when opening a project;
enforce final-realpath containment before reads, writes, protocol responses,
and deletion; use no-follow handles where the platform supports them. Add
project-open and recovery tests with file and directory symlinks.

### C10-004 - The network guard permits cloud metadata through non-global IPv4 ranges

**Evidence:** `apps/desktop/src/main/net-guard.ts:18-28`,
`apps/desktop/src/main/net-guard.ts:90-101`, and
`apps/desktop/src/main/index.ts:526-581`.

The guard is a partial private/reserved denylist rather than a globally
reachable address classifier. Literal addresses not listed there bypass DNS
and are fetched. In particular, `100.64.0.0/10` is absent. Alibaba documents
its instance metadata service at `100.100.100.200`, inside that range, and
warns that image-download SSRF can disclose temporary credentials.

The IANA IPv4 Special-Purpose Address Registry marks `100.64.0.0/10` as Shared
Address Space and not globally reachable. Other omitted special ranges make
the same denylist strategy brittle. DNS rebinding is not counted here because
the current source and AI-IMP-057/124 explicitly record that accepted gap.

**Impact:** URL ingestion running on affected cloud or carrier networks can be
used to request internal metadata and return secrets or internal responses to
the renderer.

**Repair:** classify both literal and resolved addresses with a complete,
maintained special-purpose/global-reachability implementation. Deny every
non-global result by default and add literal plus DNS-result tests for the IANA
registry, including `100.100.100.200`.

References: [IANA IPv4 Special-Purpose Address Registry](https://www.iana.org/assignments/iana-ipv4-special-registry/iana-ipv4-special-registry.xhtml),
[Alibaba ECS instance metadata](https://www.alibabacloud.com/help/en/ecs/user-guide/view-instance-metadata/).

### C10-005 - Concurrent imports share and can promote the same partial tree

**Evidence:** `apps/desktop/src/main/index.ts:931-939`,
`apps/desktop/src/utility/index.ts:156-175`,
`apps/desktop/src/utility/index.ts:568-570`, and
`packages/persistence/src/export/project-import.ts:252-267` and `:286-364`.

Destination selection checks only whether the final path and fixed
`<destination>.partial` currently exist. The utility starts each import request
without serialization. After an awaited manifest read, every importer uses the
same partial path and unconditionally removes it before extraction. Entry
verification occurs as each entry is written, but another importer can remove
or overwrite that verified tree before database validation and final rename.

Two near-simultaneous imports with the same generated destination can therefore
delete each other's staging tree, fail unpredictably, or promote a tree whose
files came from different requests. Similar snapshots share project identity
and schema, so the final consistency checks do not prove request ownership.

**Impact:** importing two archives can report success for the wrong archive or
materialize a mixed/corrupt project. This is a durable integrity failure in the
portable-project trust boundary.

**Repair:** atomically reserve the final destination before the first await;
use a unique request-owned staging path; never remove a stage not created by
the current request; promote exclusively. Add a barrier-controlled concurrent
import regression.

## P2 findings

### C10-006 - Flush acknowledgements are global, uncorrelated, and success-blind

**Evidence:** `apps/desktop/src/main/index.ts:688-705`,
`apps/desktop/src/main/index.ts:775-785`, and
`apps/desktop/src/preload/index.ts:128-136`.

The main process counts a global `app:flush-done` event with no request ID,
sender identity, or success value. The window-close path similarly waits for
the next global event. A timed-out earlier flush can finish after subsequent
edits and satisfy the close wait while the newer flush is still saving. A
second window would make the same counter vulnerable to duplicate or foreign
acknowledgements.

**Impact:** the app can destroy a renderer before the flush associated with
that close has completed, producing a narrow but real note-loss race.

**Repair:** assign request IDs, bind expected senders, carry explicit success,
and wait for the exact outstanding set. Serialize or supersede flushes per
renderer and test timeout/edit/close interleavings.

### C10-007 - A failed outer `COMMIT` leaves SQLite open while transaction depth resets

**Evidence:** `packages/persistence/src/db.ts:59-82`.

The transaction helper decrements depth before `COMMIT`. If `COMMIT` throws,
the catch decrements depth a second time and attempts `ROLLBACK TO ew_tx_0`
instead of rolling back the outer transaction. Its final depth repair does not
repair SQLite state. A focused deferred-foreign-key probe reproduced the
result: the failed commit was followed by `cannot start a transaction within a
transaction` until an explicit rollback.

**Impact:** a commit-time constraint or I/O failure wedges the connection and
can make subsequent commands fail or execute inside an unintended transaction.

**Repair:** update depth only after successful commit/release. On outer commit
failure, execute `ROLLBACK`; handle nested savepoint rollback/release without
double decrement. Test that the next transaction succeeds after a deferred
constraint fails at commit.

### C10-008 - Public command payloads and inverse handlers bypass authoritative invariants

**Evidence:** `packages/persistence/src/dispatcher.ts:52-109`,
`packages/persistence/src/handlers/frames.ts:142-149` and `:211-219`,
`packages/persistence/src/handlers/placements.ts:145-188`, `:235-250`, and
`:441-478`, and `packages/persistence/src/migrations/0007-frame-membership.ts:19-30`.

The public command seam validates only the envelope shape; payload types are a
compile-time convention. Frame inverse application explicitly trusts captured
targets and writes membership without checking active placements, frame kind,
same canvas, cycles, or duplicates. Placement geometry handlers also accept
non-finite values. A focused SQLite probe confirmed `Infinity` and `-Infinity`
are stored in STRICT REAL columns.

These invariants intentionally live in handlers rather than SQLite, so every
registered handler, including an inverse, must enforce them. The preload's
generic execute surface makes malformed runtime payloads part of the threat
model, not merely a TypeScript concern.

**Impact:** malformed commands can persist cross-canvas membership, cycles, or
non-finite geometry that the scene cannot faithfully render. Cyclic frames can
also eliminate every root from hierarchical frame queries.

**Repair:** add runtime payload schemas at the command registry boundary and
apply the same domain invariants to inverse handlers. Alternatively, make
inverses opaque, server-issued capabilities that cannot be supplied as
arbitrary renderer payloads.

### C10-009 - Multi-member undo can fail after committing a destructive prefix

**Evidence:** `apps/desktop/src/renderer/undo/undo-stack.ts:219-275`.

Undo pops the action before executing its members, then commits each inverse
separately. If a middle member throws or returns non-committed, prior members
remain committed, execution stops, and the original action has already been
removed. No redo or repair description is retained for the partial result.

This is distinct from AI-IMP-231's global group identity and AI-IMP-232's
forward compound fail-stop behavior: the failure is inside the undo executor
after a prefix has already changed durable state.

**Impact:** utility death, transient persistence failure, or semantic
invalidation during a grouped undo leaves a partially undone action that the
user cannot redo or retry coherently.

**Repair:** execute inverse groups atomically in the authoritative command
service. If that cannot be done immediately, preserve an explicit repair state
for the committed prefix. Add a three-member regression that fails member two.

### C10-010 - Snapshot commits continue after a typed WAL checkpoint failure

**Evidence:** `apps/desktop/src/main/snapshot.ts:513-553` and
`apps/desktop/src/utility/index.ts:78-96`.

Before staging a snapshot, the main process awaits the utility checkpoint
response but ignores its `{ ok: false, code: 'CHECKPOINT_FAILED' }` result. It
continues to regenerate, commit, and potentially push the snapshot.

**Impact:** the git snapshot can contain an older `project.sqlite` alongside a
newer notes projection and be advertised or pushed as a valid backup. The live
WAL may retain the user's data, but restore and remote-backup state can be stale
or internally inconsistent.

**Repair:** abort or defer commit/push on checkpoint failure, surface the
condition, and retry safely. Add a failure-injection test proving no commit is
created after the typed failure.

### C10-011 - Backup settings report success without checking persistence

**Evidence:** `apps/desktop/src/preload/index.ts:95-108`,
`packages/protocol/src/index.ts:90-98`,
`apps/desktop/src/utility/index.ts:469-483`, and
`apps/desktop/src/renderer/views/SettingsView.svelte:213-215` and `:247-258`.

The utility and protocol return a typed result for project-setting writes, but
the settings UI ignores it and optimistically mutates local state. The remote
test can then report `Connected` for the unsaved draft even though the
snapshot engine will continue reading the old database value.

AI-IMP-237 fixed atomic app-settings writes but explicitly did not make these
project-setting callers result-aware, so this is not a duplicate of that fix.

**Impact:** the UI can tell a user that backups are enabled or a remote is
connected while no durable configuration changed.

**Repair:** route project settings through a result-aware helper that rolls
back optimistic state and shows the persistence error. Test no-project,
read-only, and injected write failures.

### C10-012 - Background texture replacement leaks GPU resources outside the budget

**Evidence:** `packages/canvas-engine/src/renderers/background.ts:56-104`,
`packages/canvas-engine/src/renderers/background.ts:164-199`, and
`apps/desktop/src/renderer/canvas/host.ts:313-351` and `:387-433`.

Background replacement destroys display children with `{ children: true }`,
which does not destroy their textures or texture sources. Plain and tiled
textures that finish after their generation is stale also return without
destruction. Teardown destroys the tiled source but not each generated tile
texture. BackgroundSync bypasses the placement texture budget, so there is no
other owner that can reclaim these resources.

The existing tests assert display-child removal and source destruction, not
texture ownership. Pixi's `DestroyOptions` documents texture and texture-source
destruction as separate options.

**Impact:** repeated high-resolution backdrop changes or canvas navigation can
retain GPU memory until process exit and eventually cause severe slowdown or a
renderer crash.

**Repair:** define explicit BackgroundSync ownership, destroy stale and
replaced textures plus sources, and integrate backgrounds with a budget or a
dedicated bounded cache. Test destruction counters for plain, tiled, stale,
replacement, and teardown paths.

Reference: [PixiJS DestroyOptions](https://pixijs.download/release/docs/scene.DestroyOptions.html).

## P3 findings

### C10-013 - Asynchronous theme application is not latest-wins

**Evidence:** `apps/desktop/src/renderer/theme.ts:3-15` and
`apps/desktop/src/renderer/settings/settings.ts:94-105` and `:147-168`.

`applyTheme('glass')` awaits glass enablement and, on failure, another async
disable before unconditionally stamping `dark`. Independent later calls are
not sequenced. A focused deferred-promise probe showed a newer `light` request
being visibly applied and then overwritten by the stale glass fallback.

**Impact:** rapid theme changes can settle on a theme other than the latest
selection until the user changes it again.

**Repair:** use a generation token or a serialized latest-wins queue before
applying the final DOM theme. Add a glass-failure/light interleaving test.

### C10-014 - Background settings changed during initial load are discarded

**Evidence:** `packages/canvas-engine/src/renderers/background.ts:56-104`.

When the same background hash is already loading, a newer `apply()` returns
without retaining the new settings. The original mount closes over the first
settings object and applies it after texture decode. Existing tests change
settings only after `settled()`, so they do not cover this interval.

**Impact:** opacity, transform, or presentation changes made while a large
background decodes are persisted but the renderer shows the old values until a
later refresh.

**Repair:** retain the latest settings on every apply and read them after the
await before mounting. Add a controllable slow-loader regression.

## Known or excluded items

- AI-IMP-249 Windows lock acquisition and cleanup is active work and was not
  reviewed or re-reported here.
- AI-IMP-231 already records the unresolved global undo-group identity fence.
- AI-IMP-238 fixed the recorded create-image-pin revision-skew failure. Similar
  revision gaps remain worth addressing systematically, but were not counted
  again without a separate demonstrated failure.
- DNS rebinding between resolution and fetch is explicitly accepted in the
  current net-guard source and AI-IMP-057/124; C10-004 is the separate,
  immediately reachable non-global-address omission.
- Portable archive extraction was tested conceptually for symlink creation.
  The current ZIP extraction path writes regular files, so archive entries do
  not directly create the symlink condition in C10-003.
- Deferred export-GC lease behavior, known search-panel rejection paths, and
  design-queue/lifecycle gaps were not presented as new findings.

## Validation and limits

Focused probes produced these relevant results:

```text
deferred FK commit: FOREIGN KEY constraint failed
next transaction begin: cannot start a transaction within a transaction
after explicit rollback: ok

STRICT REAL payload: Infinity and -Infinity stored; NaN rejected by NOT NULL

managed directory symlink write: external target overwritten
managed file symlink write: external target overwritten

theme ordering: latest light applied, then stale glass fallback changed it to dark
```

No package, unit, or Playwright suite was rerun in this isolated clone because
dependencies are not installed there. Findings were validated by static control
flow, focused platform probes, existing tests, and primary platform/library
documentation. The report does not rely on the owner's out-of-phase checkout
or claim the current CI union gate as independent validation.

## Recommended order

1. Stop note destruction after failed flush and correlate flush requests.
2. Remove the raw restore path capability and reject symlinked managed trees.
3. Complete the network address classifier and serialize/reserve imports.
4. Repair transaction failure state, checkpoint handling, and backup-setting
   result propagation.
5. Put runtime schemas and authoritative invariants at the public command seam,
   then make grouped undo atomic.
6. Close background texture ownership and the two renderer latest-state races.

## Exit criterion

After the final renderer and lifecycle rotation, additional candidates were
either already recorded, explicitly accepted, part of active AI-IMP-249 work,
or lacked a concrete reachable failure. The new-finding hit rate had declined
across multiple subsystem changes, so the discovery pass ended here.
