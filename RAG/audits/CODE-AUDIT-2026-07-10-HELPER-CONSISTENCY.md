# Code audit — helper consistency and repeated one-off paths

**Date:** 2026-07-10
**Baseline:** `8a86f21` (`origin/main` at audit start)
**Scope:** production TypeScript/Svelte, persistence handlers/read models,
canvas-engine primitives, desktop E2E helpers, and persistence test setup
**Mode:** read-only source review; no product or test behavior changed

## Severity used here

- **P2** — the duplicate/bypassed path already changes correctness,
  isolation, validation, or a ratified product contract. Close before 1.0.
- **P3** — concrete drift/maintenance risk with a focused consolidation
  available, but no current release-blocking behavior proved.

## Executive finding

The codebase has several strong shared seams — `CommandGateway`,
`waitForItems`/`whenSceneApplied`, the E2E helpers, `tag-assign.ts`, settings
storage helpers, and exported canvas geometry. The recurring problem is
**incomplete adoption**: a ticket extracts the right seam for its own fence,
but older or sibling call sites keep local copies.

Four families are correctness-bearing now:

1. E2E launch/command helpers are bypassed, losing app-settings isolation.
2. The RFC-mandated single anchored-surface clamp does not exist as a shared
   seam; local clamps already disagree on small-window behavior.
3. Project-setting reads/writes bypass the safe storage helpers.
4. Node-appearance encoding/validation is duplicated and has diverged.

Five more families are good consolidation work: active-record guards, tag
resolution/completion, renderer Project API plumbing, canvas math primitives,
and gallery row topology.

## Findings

### HC-001 — P2 — the E2E helper seam exists, but 12 specs still bypass its launch isolation

`apps/desktop/e2e/helpers.ts:13-17` says the helpers exist to stop hand-rolled
envelope drift. Its launcher creates a unique project and, critically, a
unique `EW_APP_CONFIG_DIR` (`helpers.ts:19-46`); its `exec`, `runQuery`, and
`revision` helpers centralize Project API behavior (`helpers.ts:49-85`).

Current main still has:

- 12 spec files calling `electron.launch` directly;
- 16 spec files calling `window.ew.project.execute` directly; and
- 5 specs defining their own revision reader.

The bypass is intermittent even inside one file: `shell.spec.ts:6` imports
`launchApp`, while ordinary shell/chrome cases still launch directly at
`shell.spec.ts:24-30` and `shell.spec.ts:117-124`. The repeated launcher in
`resize-snap.spec.ts:25-35`, `gestures.spec.ts:42-52`, and
`board-tooling.spec.ts:27-37` omits `EW_APP_CONFIG_DIR`. All 12 raw-launch
specs omit it, so they can read/write Electron's shared default app config
instead of a test-local directory.

This is related to, not a rediscovery of, `AI-IMP-057`: that ticket found the
envelope copies, created the helper, and explicitly left full migration
opportunistic (`RAG/AI-IMP/AI-IMP-057-ssrf-guard-and-e2e-helpers.md:24-34`,
`:97-104`). The current risk is sharper because later app-tier settings made
launcher isolation load-bearing.

**Repair scope:** one `AI-IMP-XXX-e2e-helper-adoption` ticket. Give the shared
launcher explicit options for specialized readiness/fault cases, migrate
ordinary UI specs mechanically, and leave raw launch/execute only in tests
whose subject is the process/protocol seam itself. Add a guard test or lint
scan so new specs cannot call `electron.launch` without an explicit exemption.
Sequence the known persistence temp-cleanup helper beside this work, but keep
it a separate helper family/ticket (see deduped baseline below).

### HC-002 — P2 — anchored-surface placement is hand-rolled despite the one-helper contract

RFC §8.8 is explicit: “Everything anchored clamps” through **one shared
clamp-and-flip helper**, including reserved chrome bands
(`RAG/RFC-0001-Core-Note-Node-and-Canvas-Model.md:2399-2407`). The present
implementation instead has independent algorithms:

- `format-bar.ts:87-103` exports a pure `clampBar` with oversize-viewport
  handling;
- `ContextMenu.ts:444-455` defines a local `clampInto`;
- `TagPanel.svelte:77-85`, `LocationChooser.svelte:14-20`, and
  `SearchPanel.svelte:91-104` each reimplement host-relative clamping;
- `MirrorAsk.svelte:15-19`, `RecognitionChip.svelte:24-28`, and
  `DropBehaviorAsk.svelte:36-40` each reimplement window-relative clamping.

The copies are not equivalent. `clampBar` explicitly handles a surface wider
than the available viewport (`format-bar.ts:95-101`). The tag/search/location
forms compute `Math.min(lowerBound, bounds.width - surfaceWidth)`; when the host
is narrower than the surface, that upper bound is negative and the result can
place chrome off-screen (`TagPanel.svelte:82-83`,
`LocationChooser.svelte:17-18`, `SearchPanel.svelte:98-102`). None accepts the
reserved bands required by §8.8 item 4.

This also corrects the record around `AI-IMP-193`: its brief says the house
clamp already existed (`AI-IMP-193-note-panel-spawn-flash.md:46-49`), but the
landed note records that “house clamp” as local `Math.min/max` in panel layout
(`:102-110`), not the RFC's shared helper.

**Repair scope:** one `AI-IMP-XXX-anchored-surface-placement` ticket. Introduce
a pure renderer helper taking anchor, measured surface, free region/bands,
preferred side(s), gap, and margin. Migrate every anchored surface, add unit
cases for all edges and undersized hosts, and add a guard scan against new
surface-local clamp functions. This is presentation infrastructure; it must
not absorb panel lifecycle or domain behavior.

### HC-003 — P2 — settings storage helpers are used intermittently, bypassing their corruption fallback

`settings.ts` already centralizes setting writes and safe single-key reads:
`setProjectSetting` owns the upsert (`packages/persistence/src/settings.ts:14-33`),
and `getProjectSetting` catches malformed persisted JSON and returns a fallback
(`settings.ts:35-50`). Its comment is correct: project files are user data, so
persisted values must not be trusted.

The trash-retention paths bypass both helpers:

- `queries-lifecycle.ts:231-239` runs its own SELECT and unguarded
  `JSON.parse`;
- `handlers/lifecycle.ts:755-774` repeats the SELECT, unguarded parse, and
  upsert; and
- the whole-map `getSettings` query parses every row without containment
  (`settings.ts:53-62`).

A malformed settings row therefore degrades inconsistently: metadata's
single-key reads fall back, while `getTrashRetention`, `SetTrashRetention`, or
the entire settings view can throw. The command's allowed-value validation
must stay in the handler (`handlers/lifecycle.ts:755-761`); the duplicated
storage/JSON machinery need not.

**Repair scope:** one `AI-IMP-XXX-project-setting-codec` ticket. Keep domain
validation in command handlers, route storage through the existing helpers,
and strengthen the read helper to accept a key-specific decoder/validator so
parseable-but-invalid values also fall back visibly. Decide and test the
whole-map policy: per-key fallback/reporting is preferable to one bad row
making every project setting unavailable.

### HC-004 — P2 — node-appearance persistence is encoded three times and validation has drifted

The appearance-to-columns mapping is repeated in:

- `CreatePin` (`packages/persistence/src/handlers/pin.ts:50-87` and the node
  insert at `:163-176`);
- `SetNodeAppearance` (`handlers/nodes.ts:429-491`) plus its reverse decoder
  (`:493-515`); and
- `UnplaceCard`'s inverse restore (`handlers/pin.ts:483-506`).

The forward paths already disagree. `CreatePin` rejects empty dot colors and
icon names (`handlers/pin.ts:60-69`), while `SetNodeAppearance` copies those
strings without checking them (`handlers/nodes.ts:449-465`). This is reachable
through malformed/runtime command input because the command registry's generic
payload type is compile-time only: the resolved upcast returns `unknown`
unchanged and the handler owns runtime validation
(`packages/commands/src/registry.ts:73-83`). Existing node tests cover unknown
kinds and image asset presence, but not the empty dot/icon cases
(`handlers/nodes.test.ts:268-285`, `:320-325`).

This is exactly the growing-domain case where validation must remain in command
handlers; centralizing it does **not** mean moving it into a SQLite `CHECK`.

**Repair scope:** one `AI-IMP-XXX-node-appearance-codec` ticket. Add a
handler-side codec that validates and encodes a `NodeAppearance` into fixed
columns and decodes fixed columns for inverses. Callers may pass an explicit
allowed-kind set where command semantics differ (for example CreatePin's
creation vocabulary). Pin malformed payloads, round-trip every kind, and prove
all three command paths use the codec.

### HC-005 — P3 — active-record guards are partial, file-local abstractions over 24 repeated queries

Persistence handlers contain 24 occurrences of the exact project-scoped,
active-record predicate:

```sql
WHERE id = ? AND project_id = ? AND lifecycle_state = 'active'
```

There are good local helpers — exported `requireCanvas`
(`handlers/canvases.ts:17-31`), `requireDecoration`
(`handlers/decorations.ts:33-44`), and file-private `requireNode`/
`requirePlacement` (`handlers/nodes.ts:33-46`,
`handlers/placements.ts:49-60`) — but sibling handlers bypass them.
`CreatePin` repeats the canvas guard at `handlers/pin.ts:42-48` and
`PlaceAsCard` repeats it at `:373-379`; placement creation repeats both canvas
and node guards (`handlers/placements.ts:145-161`); decoration creation and
grouping repeat the canvas guard (`handlers/decorations.ts:95-105`, `:251-261`).

Some non-active lookups are intentional for undo/Trash and must remain
distinct. The finding is the repeated **identical active** case, not a proposal
for a dynamic “query any table” function.

**Repair scope:** one `AI-IMP-XXX-handler-record-guards` ticket. Move fixed,
typed `requireActiveCanvas/Node/Placement/Decoration/Asset/Tag` functions into
one handler-side module, preserving each structured error code and requested
column shape. Do not accept dynamic table names, and do not move growing-domain
validation into schema constraints.

### HC-006 — P3 — the tag helper exists, while sibling tag surfaces copy its core anyway

`tag-assign.ts` correctly centralizes `filterTagCompletions`, name-key lookup,
conflict recovery, and find-or-create/assign (`renderer/tags/tag-assign.ts:38-97`).
Its own header limits reuse to the charm and note add-field and says Gallery's
bulk accounting differs (`:1-19`). The accounting differs; the resolver and
completion filter do not:

- `GalleryActionBar.svelte:110-133` copies the completion and name-key/conflict
  resolver nearly verbatim before its genuinely bulk-specific loop;
- `TagPanel.svelte:130-145`, `GalleryFacets.svelte:116-137`, and
  `OutlineView.svelte:78-81` each carry another lowercase prefix/exact-match
  variant.

The variants already differ on trimming, exact-match normalization, and caps.
Backend `name_key` enforcement prevents duplicate durable tags, but UI
completion and selection behavior is inconsistent at whitespace/case edges.

**Repair scope:** one `AI-IMP-XXX-tag-resolution-surfaces` ticket. Export the
resolver separately from single-node assignment, retain bulk accounting in
Gallery, and make completion/exact-match helpers accept exclusion IDs and
limits. Use `nameKey` for identity and keep display labels untouched.

### HC-007 — P3 — renderer Project API adapters and command-failure wording are copied per surface

Seven production surfaces define a local generic `runQuery<T>` wrapper. The
same three-line adapter appears in the canvas host
(`renderer/canvas/host.ts:306-310`), Outline (`views/OutlineView.svelte:90-94`),
Search (`chrome/SearchPanel.svelte:108-112`), Tag Panel
(`tags/TagPanel.svelte:87-91`), and the note ProjectPort
(`note/project-port.ts:16-20`). Gallery adds a useful primary/secondary
transport choice (`views/GalleryView.svelte:248-257`), but repeats the result
unwrapping.

The copies disagree on diagnostics: Settings drops the service message
(`views/SettingsView.svelte:58-61`), several surfaces keep only the message,
and host/note include name and code. Command-result wording is similarly
duplicated: `describeFailure` has equivalent copies in Context Menu
(`menus/ContextMenu.ts:76-80`), import surfaces
(`canvas/import-surfaces.ts:56-60`), board tooling
(`canvas/board-tooling.ts:103-107`), and place mode
(`canvas/place-mode.ts:47-51`), with more inline variants elsewhere.

**Repair scope:** one `AI-IMP-XXX-renderer-project-port` ticket. Introduce a
small renderer-side query unwrapping adapter over an injected transport and a
single `commandFailureMessage(result, context?)` formatter. Keep surface toast
policy local; centralize only protocol unwrapping and canonical detail.

### HC-008 — P3 — canvas-engine exports math primitives but redefines them nearby

`interaction-beats.ts` exports `clamp01` and `easeOutCubic`
(`packages/canvas-engine/src/interaction-beats.ts:21-29`), yet:

- camera flight defines another `easeOutCubic` even while the exported helper
  says it matches camera flight (`camera-flight.ts:14-19`);
- background grid and stage extent each define identical `clamp01` and `lerp`
  pairs (`background-grid.ts:68-71`, `stage-extent.ts:49-52`); and
- culling and hit testing define the same rectangle-intersection predicate
  under different names (`culling.ts:44-46`, `hit-test.ts:241-243`).

These are small, pure, same-package primitives — a good mechanical
consolidation. Do **not** blindly fold in crop's `clamp01`: it deliberately maps
`NaN` to zero (`renderer/canvas/crop-rect.ts:40-43`), a different contract.

**Repair scope:** one `AI-IMP-XXX-canvas-math-primitives` ticket with internal
`math.ts`/`rect.ts`, focused unit tests, and no behavior changes.

### HC-009 — P3 — gallery keyboard row topology is extracted, but layout still maintains a second source

`gallery-keys.ts` says `cellRows` represents the visual row structure and must
mirror Gallery layout exactly (`renderer/views/gallery-keys.ts:24-45`).
Gallery uses it for keyboard navigation (`GalleryView.svelte:527-535`) but
rebuilds the same per-bucket/flat chunk loops for virtualization at
`GalleryView.svelte:541-561`.

The comments correctly warn that Up/Down and layout must stay identical, but
the code does not enforce that relationship. A future header, gap, or bucket
layout change can make keyboard navigation target a different row than the
one drawn.

**Repair scope:** fold row topology into one pure row-plan function that emits
header/cell index ranges; let the Svelte layer add pixel tops/sizes. Keep
virtualization presentation out of keyboard arithmetic, but make both consume
the same ranges.

## Known baseline verified and deduplicated

These were supplied by the lead/current review push or already owned in the
record. They are not counted above as new findings:

1. **Direct command-envelope views.** Settings, GalleryActionBar, and Trash
   still build envelopes directly (`SettingsView.svelte:69-76`,
   `GalleryActionBar.svelte:72-91`, `TrashView.svelte:80-91`). Gallery is owned
   by planned `AI-IMP-221`; the broader undo/redo effects are already recorded.
2. **Import→command revision skew.** `AI-IMP-238` fixed the shared import path
   with `checkRevision:false` and explicitly flagged background-file and
   appearance-image siblings (`AI-IMP-238-import-batch-flake.md:119-136`). The
   current sites remain at `board-tooling.ts:411-471` and
   `charms-ui.ts:348-374`. One follow-up should cover both; do not mint two
   tickets.
3. **Persistence temp cleanup.** The current tree has 58 identical
   `rmSync(..., { recursive:true, force:true, maxRetries:10,
   retryDelay:100 })` calls across 45 persistence test files. This is the known
   Windows-work duplication and should become one
   `AI-IMP-XXX-persistence-test-temp-cleanup` ticket with one `rmTempDir`
   helper.
4. **Scene waits are a good precedent.** The canonical host seam is documented
   at `canvas/host.ts:155-177` and consumed by Workspace, import, board tooling,
   and panels. No new hand-rolled try-now/subscribe/timeout wrapper was found.
5. **Other good precedents.** New-board palette verbs are injected/reused; the
   scene-wait seam was extended in place; bounded safety timeouts remain at the
   owning async boundary. These are the consolidation shape to copy.

## Recommended consolidation order

1. **Test harness wave:** HC-001 and the known 45-file `rmTempDir` cleanup as
   two helper-family tickets. Both are mechanical, high-coverage work; HC-001
   immediately removes shared-config risk.
2. **Anchored chrome:** HC-002. It is a ratified one-helper contract and local
   copies already differ behaviorally.
3. **Persistence codecs:** HC-003 and HC-004 as separate tickets; each owns a
   durable representation and needs focused malformed-input tests.
4. **Persistence guards:** HC-005, after the codecs, preserving handler-local
   validation and structured errors.
5. **Renderer adapters:** HC-006 and HC-007 as separate helper families.
6. **Pure mechanical tail:** HC-008 and HC-009.

Per repository ticket discipline, proposed tickets are intentionally named
`AI-IMP-XXX-<slug>` here; the lead assigns numbers after checking current
reservations and parallel work.

## Review limits

- This was a source audit, not a full clone detector or formal semantic proof.
- No Windows/Linux execution was performed.
- Specialized raw process/protocol tests need case-by-case exemptions; the
  finding is not “every direct call is wrong.”
- Some superficially similar helpers were intentionally excluded: crop's NaN
  clamp, undo/Trash lookups that must include inactive rows, and handler-owned
  growing-domain validation.
