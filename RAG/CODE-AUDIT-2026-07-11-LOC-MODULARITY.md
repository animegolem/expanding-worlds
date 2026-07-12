# Code audit — high-LOC modularity review

**Date:** 2026-07-11
**Baseline:** `3f22392a` (`origin/main` at final review; source files unchanged
from the `5471c966` review start)
**Scope:** production files surfaced by the generated `RAG/INDEX.md` LOC census;
large tests, generated/vendor artifacts, and spikes were classified separately
**Mode:** read-only source review; no product or test behavior changed

## Question and standard

This audit asks whether a large file contains **independently owned behavior with
a stable extraction seam**. LOC alone is not a defect and reducing LOC is not an
objective. A split is recommended only when it improves one or more of:

- ownership and review locality;
- direct unit-testability of behavior now trapped in a closure or component;
- dependency direction (leaf helpers below composition roots);
- the ability to change one product subsystem without reopening another; or
- preservation of a safety protocol by making its ordering explicit.

Priority in this document is refactor priority, not bug severity:

- **R1 — prepare a ticket:** clear multi-owner accretion and a credible boundary.
- **R2 — split with adjacent feature work:** useful seam, but coordinate with
  current design or behavior work.
- **R3 — keep cohesive / optional carve-out:** size is presently justified.

## Executive recommendation

The LOC list does reveal real accretion, but not everywhere. The strongest
module candidates are:

1. desktop `main/index.ts` and utility `index.ts` request-family routing;
2. canvas `host.ts` frame/stage/scene/input/debug controllers;
3. `NotePanel.svelte`, `GalleryView.svelte`, `ContextMenu.ts`, and `panels.ts`;
4. persistence `queries-structure.ts`, `handlers/lifecycle.ts`, and
   `handlers/placements.ts`; and
5. the label/body subdomains inside canvas-engine `placement.ts`.

Conversely, snapshot, import/export, gesture, pin, menu-inventory, service, and
protocol files are large mostly because they express one ordered pipeline,
state machine, declarative inventory, or public barrel. Splitting those merely
to satisfy a line budget would make the important ordering harder to audit.

The recommended program is **boundary-first and incremental**: extract pure
helpers and already-exported subdomains before moving closure-heavy state. Keep
the old public entry point as a facade/barrel until parity tests prove that
registration, inverse payloads, request errors, focus order, and scene waits did
not drift.

## R1 — prepare focused extraction tickets

### 1. Canvas host: split the controllers, retain the composition root

`apps/desktop/src/renderer/canvas/host.ts` is genuine accretion around a valid
mount point. `mountCanvasHost` begins at `host.ts:368` and owns almost the entire
remaining file. Its internal regions already expose viable controllers:

- frame membership, hover/make-room, sort-on-drop, and commit composition at
  `host.ts:977-1306` → `frame-interactions.ts`;
- stage/background/LOD rendering at `host.ts:1309-1571` →
  `stage-render-loop.ts`;
- revision refresh and scene-apply waits at `host.ts:1587-1748` →
  `scene-coordinator.ts`;
- native input wiring at `host.ts:1750-1895` → `host-input.ts`; and
- performance/E2E diagnostics at `host.ts:1897-2114` → `debug-surface.ts`.

Keep Pixi planes/resources, controller construction, mount, and teardown in the
host facade. Preserve `whenSceneApplied` and `waitForItems` exactly
(`host.ts:1604-1648`); the helper-consistency audit already records this as the
canonical async seam. Input extraction must also preserve the host/gesture
cursor-listener order (`host.ts:1780-1797`, `gestures-ui.ts:404-407`). Start
with frame interactions or diagnostics; move the refresh coordinator only with
focused ordering tests.

### 2. Electron main: restore the file's stated narrow responsibility

`apps/desktop/src/main/index.ts:27-31` describes window lifecycle and narrow IPC
routing, but the file also implements utility supervision (`:34-176`), path and
settings storage (`:178-337`), the asset protocol (`:339-410`), guarded URL
download (`:412-625`), window policy (`:627-718`), snapshot/flush wiring
(`:724-778`), and IPC registration (`:844-1216`). Extract, in this order:

1. `url-import.ts` (`:412-625`) — already a bounded, independently testable
   security seam;
2. `asset-protocol.ts` (`:339-410`);
3. `utility-client.ts` (`:34-176`); and
4. `ipc-routes.ts` (`:844-1216`).

Keep bootstrap, window assembly, and quit sequencing in `index.ts`. Scheme
registration must remain before Electron readiness (`:351-356`), and utility,
snapshot, and quit ordering must remain explicit. The Rust seam report already
identifies main's asset-layout knowledge as a port boundary; this recommendation
organizes that known boundary rather than claiming a new defect.

### 3. Utility dispatcher: route by request family behind one exhaustive door

`apps/desktop/src/utility/index.ts` has only a few top-level functions because
`handle` (`utility/index.ts:90-704`) is a 600-line switch. It mixes primary
lifecycle/snapshot/export (`:90-257`), secondary/library/tag sync (`:265-447`),
cross-project transfer (`:453-580`), and ordinary command/query/import work
(`:590-704`). Extract request-family handlers—primary, secondary, transfer, and
project—behind one exhaustive dispatcher. Pass an explicit state object for the
primary service and secondary slots now held at `:23-30`.

Keep the single protocol entry point and its failure envelopes. The main risks
are losing discriminated-union exhaustiveness, trust checks, or exact typed
failures; a compile-time exhaustive switch and per-family response parity tests
should gate this refactor.

### 4. Note panel: extract behavior controllers, not arbitrary markup

`apps/desktop/src/renderer/note/NotePanel.svelte` contains several controllers:
ancillary/place/tag reads (`NotePanel.svelte:104-257`), three materialization
flows (`:259-472`), rename/broken-link/trash recovery (`:475-630`), geometry and
pointer behavior (`:694-1072`), orchestration (`:1074-1207`), template states
(`:1209-1597`), and CSS (`:1598-2161`). Recommended boundaries:

- `note-panel-materialization.ts` for phantom/canvas/pin creation (`:274-472`);
- `note-panel-geometry.ts` for pure layout/drag/resize calculations
  (`:694-1072`); and
- a lifecycle/title-recovery coordinator (`:475-630`).

Keep editor ownership and the final Svelte shell together: one live editor
buffer and flush-on-close are load-bearing. Move state machines whole rather
than exporting small helpers that still mutate the component and panel store.
The lifecycle inventory's sticky-trash and wiki-link limitations are known
behavior gaps, not new findings from this audit.

### 5. Gallery: separate source scope, row topology, and selection transport

`GalleryView.svelte` has three strong seams: source/library scope
(`GalleryView.svelte:319-505`), row plan/virtualization/keyboard navigation
(`:527-820`), and selection/pull/drag (`:929-1140`). First create one pure row
plan consumed by layout, range selection, and keyboard navigation. The current
topology is rebuilt at `:541-561` while navigation consumes a separate model at
`:527-535`; this is already finding HC-009 in the helper-consistency audit and
should be implemented under that existing record, not as a duplicate ticket.

Then extract the scope/library controller as one generation-owned unit. Do not
split its epoch and secondary-slot ownership across components. Loading/error
gaps and superseded messages are already recorded in the lifecycle inventory.

### 6. Context menu: separate the menu surface from product actions

`apps/desktop/src/renderer/menus/ContextMenu.ts` nests a general DOM renderer,
focus model, submenu, prompt, and positioning engine (`ContextMenu.ts:86-470`)
with product actions (`:473-838`) and target/menu assembly (`:839-963`). Extract
the first region as a stateful `menu-surface.ts` object. Keep board/frame action
factories and event targeting in the existing facade initially.

Move close/open/focus state together (`:92-176`, `:439-470`); piecemeal helper
extraction would retain the coupling while hiding its ownership. Shared anchored
clamping and command-envelope consistency are already covered by HC-002/HC-007.

### 7. Panel store: split stores and navigation below one host attachment

`apps/desktop/src/renderer/note/panels.ts` combines panel records/open-close-pin
mechanics (`panels.ts:168-525`), big-editor state (`:527-583`), overlay portal
(`:585-610`), flush/rename registries (`:612-642`), reveal/navigation
(`:644-761`), and host subscriptions (`:763-880`). Extract:

- `panel-store.ts`,
- `big-editor-store.ts`,
- `overlay-portal.ts`, and
- `note-reveal.ts`.

Retain `attachPanels` as composition root. The safest first steps are the portal
and big-editor store. Panel singleton ownership and teardown order require tests
before moving the central record store.

### 8. Structure queries: one registration facade, four query families

`packages/persistence/src/queries-structure.ts` now contains canvas scene/content
queries (`queries-structure.ts:248-429`), node library/tag/location queries
(`:434-662`), bookmark/navigation queries (`:685-732`), and outline/preview/
facet/filmstrip/loose-note queries (`:741-1138`). Split those into
`queries-canvas-scene.ts`, `queries-library.ts`, `queries-navigation.ts`, and
`queries-outline.ts`; retain `registerStructureQueries` as a facade so query
names and service registration at `service.ts:171-180` do not change.

If more than one extracted family still needs them, move only
`NodeAppearanceColumns` (`queries-structure.ts:59-65`),
`NODE_APPEARANCE_SELECT` (`:206-210`), and `usableCanvasOwnerJoin` (`:223-243`)
to a dependency-leaf projection helper; the outline/tag DTOs and card-size
constants should move with their owning query families. Keep visibility and
label SQL mechanically identical and use the current query tests as parity
coverage. AI-IMP-273 has already landed on this baseline, so its new outline
family is now a particularly clean extraction target rather than an active
conflict.

### 9. Persistence lifecycle and placements: expose existing layers

`handlers/lifecycle.ts` has placement capture/restore (`lifecycle.ts:120-315`),
aggregate purge (`:316-484`), and public registration (`:487-783`). Extract
`lifecycle-placement.ts` and `lifecycle-purge.ts`, leaving simple guards and
registration in the facade. Shared placement lifecycle primitives must live in
a leaf to avoid a reverse import through `handlers/placements.ts`. Aggregate
purge remains one ordered destructive protocol: preserve transaction ownership,
dependent-row deletion order, and `AffectedRecord` order byte-for-byte across
`purgeCanvasAggregate`, `purgeNodeAggregate`, and `purgeNoteAggregate`
(`lifecycle.ts:361-484`) and the public dispatch (`:737-759`); do not turn the
three aggregates into independent registrations.

`handlers/placements.ts` similarly contains payload validation
(`placements.ts:52-187`), connector primitives (`:189-282`), CRUD/appearance
commands (`:284-515`), ordering (`:516-608`), and transform (`:610-704`). Extract
`placement-validation.ts`, `placement-connectors.ts`, and then
`placement-transform.ts`. Registration completeness, connector release, and
inverse payload parity are the gates. The repeated active-record guards remain
the already-recorded HC-005 family, not a new finding.

### 10. Placement renderer: extract labels first, preserve renderer ABI

`packages/canvas-engine/src/renderers/placement.ts` contains body/texture work
(`placement.ts:193-665`) and label layout/LOD (`:671-990`), joined by the
renderer lifecycle (`:1067-1103`). The label region already exports pure layout,
resolution, bounds, and LOD helpers, making `placement-label.ts` the safest
first extraction. Keep `syncPlacementIconLod` (`:992-1037`) with the body side;
it depends on body child labels/text styling, and `resizeImageBody` begins at
`:1039`. `placement-image.ts` can follow later; keep transform and the
`placementRenderer` create/update dispatch local.

Preserve implicit child ordering (`placement.ts:283-288`), async texture identity
and residency (`:574-665`), and the existing white-box tests. This is structural
work, not a renderer behavior change.

## R2 — split with adjacent feature or design work

### Outliner

`OutlineView.svelte` has separable orchestration (`OutlineView.svelte:112-330`),
cursor/tree navigation (`:365-460`), and row rendering (`:503-704`). An
`OutlineRow.svelte` plus a controller extension to the existing
`outline-model.ts` are credible. EPIC-028's rebuild and AI-IMP-277's deliberate-
cursor correction have just landed on this baseline, while the design queue is
already recording field feedback. Let that surface stabilize before a
standalone structural ticket; when it does, extend the shipped model boundary
rather than inventing a competing controller. Keyboard topology and flattened
row keys must remain owned by one model.

### Settings

`SettingsView.svelte` is an inventory page of independent side effects rather
than one feature. Split backup/export/import/snapshot/remote
(`SettingsView.svelte:126-287`, markup `:525-680`), notes metadata (`:99-124`,
`:790-832`), keyboard (`:325-337`, `:834-857`), and appearance/navigation
sections. Keep settings loading and the serialized project-setting writer in the
parent (`:41-77`) and pass narrow callbacks/snapshots to children.

### Dock

`Dock.svelte` renders tool options (`Dock.svelte:349-384`), selected style
(`:385-444`), text style (`:445-505`), selection verbs (`:506-609`), frame
actions (`:610-640`), and shape/tool/zoom controls (`:641-724`). Presentational
components would help, but `RAG/DESIGN-QUEUE.md:614-638` already rules a larger
dock species split. Implement modularization with that kit pass: keep selection
derivation in the parent (`Dock.svelte:146-234`) and avoid child subscriptions.

### Charms, tags, and panel overlays

- `charms-ui.ts`: extract style/DOM builders, then appearance and tag popover
  controllers from `charms-ui.ts:190-799`; leave anchor/visibility scheduling
  (`:800-1210`) in the facade until dismissal/focus tests exist.
- `TagPanel.svelte`: extract the delete workflow (`TagPanel.svelte:246-345`)
  and carrier rows (`:574-620`); keep rename, switcher, and lens together.
- `NotePanels.svelte`: extract big-editor overlay (`NotePanels.svelte:82-139`,
  markup `:332-380`) and landmark/indicator projections (`:153-250`, markup
  `:277-330`) while sharing one projection subscription/RAF owner.

### Smaller persistence families

- `handlers/tags.ts`: separate basic records (`tags.ts:35-351`), sync
  suppression (`:352-429`), and merge/unmerge (`:430-525`). AI-IMP-271 has
  landed on this baseline, so preserve its system-write and captured-assignment
  semantics in parity tests.
- `handlers/notes.ts`: extract link repair/inverse commands
  (`notes.ts:300-489`) from ordinary create/update/rename (`:100-299`).
- `handlers/nodes.ts`: extract node-note relationship commands
  (`nodes.ts:121-434`) from node CRUD and appearance. AI-IMP-270 is still
  planned on this baseline and directly targets the CreateNoteAndAttach inverse;
  defer this split until that repair lands, then preserve its regression tests.

### Board tooling and import surfaces

`board-tooling.ts` contains arrange/frame/navigation (`board-tooling.ts:200-401`)
and background lifecycle (`:143-199`, `:403-620`); extract a stateful
`background-tooling.ts` with its stale-canvas and Escape/wheel ownership intact.

`import-surfaces.ts` separates naturally into the import/landing pipeline
(`import-surfaces.ts:95-347`) and DOM drag/drop/paste adapter (`:367-565`). Move
the former to `import-pipeline.ts`, preserving gesture-time canvas binding,
sequential pumping, undo grouping, and revision-qualified scene waits.

## R3 — keep cohesive for now

### Ordered safety protocols and state machines

- `main/snapshot.ts` is one serialized snapshot/push/restore engine
  (`snapshot.ts:196-790`). Optional pure carve-outs are managed-gitignore helpers
  (`:76-139`, `:240-267`) and restore destination validation (`:669-706`), but
  do not split its queue, push, scheduler, or commit ordering.
- `export/project-import.ts` is a hostile-input pipeline: reservation
  (`project-import.ts:58-117`), archive scan/extraction (`:119-273`), manifest
  read (`:275-320`), then orchestration (`:322+`). Budgets must remain enforced
  during scan and streamed reads.
- `export/project-export.ts` is a staging→freeze→plan/hash→stream/fsync→verify→
  atomic-rename protocol (`project-export.ts:252-456`). Only its verification
  helper (`:135-207`) is an optional extraction.
- `gestures-ui.ts` is one pointer/keyboard interaction state machine
  (`gestures-ui.ts:59-548`). Pure cursor/zone geometry (`:110-158`) may move;
  pointer and keyboard command paths should remain together.
- `handlers/pin.ts` contains tightly inverse-coupled pin/card transitions
  (`pin.ts:47-488`). Existing codec extraction removed its clearest duplicate;
  further splitting currently adds more cross-module state than clarity.

### Declarative barrels and inventories

- `menus/inventory.ts` is a declarative schema/builders/validator unit
  (`inventory.ts:37-726`). Family splitting would obscure parity; extract the
  validator only if another consumer appears.
- `packages/protocol/src/index.ts` is the canonical zero-runtime cross-process
  contract. A future protocol-focused change may split internal type files
  behind unchanged `index.ts` re-exports, but LOC alone does not justify it.
- `packages/persistence/src/service.ts` is an explicit composition root
  (`service.ts:158-180`, `:205-307`); registration/import weight is useful
  documentation.

### Svelte files inflated by markup and CSS

`SourcePanel.svelte`, `SearchPanel.svelte`, and `TrashView.svelte` each retain a
coherent controller despite crossing 500 LOC. Source's script ends around
`SourcePanel.svelte:265`, Search's state machine runs through
`SearchPanel.svelte:356`, and Trash's lifecycle controller is
`TrashView.svelte:80-312`; the rest is principally markup/style. Row components
are optional reuse work, not justified LOC work.

### Spikes, generated/vendor files, and tests

- `spike/src/adapters/konva/index.ts` and `spike/src/adapters/pixi/index.ts` are
  self-contained comparative adapters in explicitly throwaway spike code. Do
  not spend product refactor budget on them.
- Cargo lockfiles, design HTML/bundles, generated indexes, and documentation
  are not module candidates.
- Large tests are evidence and navigation surfaces, not production modules.
  `queries-structure.test.ts` and `placement.test.ts` already divide behavior
  with named suites; move suites alongside production extraction rather than
  splitting only for line count. E2E files should split when runtime/sharding or
  fixture ownership warrants it, not because a scenario file crosses 600 LOC.

## Suggested sequence

1. **Low-coupling proof:** placement labels; menu surface; gallery row plan
   under existing HC-009.
2. **Composition cleanup:** URL importer, asset protocol, settings sections,
   board background controller, import pipeline.
3. **Persistence families:** structure queries, placement validation/connectors,
   lifecycle purge/capture, then smaller tag/note/node families.
4. **Stateful UI:** gallery scope, panel sub-stores, NotePanel materialization and
   geometry, charms popovers.
5. **Process/router boundaries:** utility request families and IPC routes.
6. **Canvas host last:** frame interactions → diagnostics/input → stage/scene
   coordinators, with full scene-wait and teardown coverage at each step.

This order deliberately learns from pure/facade-preserving extractions before
touching the closure-heavy hosts where initialization and teardown order are
part of correctness.

## Ticket-cutting guidance

Do not create one “reduce large files” epic with LOC targets. Cut tickets around
one behavior boundary and require:

1. an unchanged public facade or explicit import migration;
2. before/after registration or inventory parity where applicable;
3. focused tests for inverse payloads, failure envelopes, generation guards,
   focus/teardown, or scene waits owned by that boundary; and
4. no mixed feature work unless the extraction is part of the already-approved
   feature/design change.

Several observations above deliberately point to existing records (HC-002,
HC-005, HC-007, HC-009, the lifecycle inventory, Rust seam report, and dock/
outliner design queue). Those should be extended, not rediscovered under new
ticket numbers.

## Review limits

This was a static source-structure review. No behavior change was proposed or
tested, and no runtime/profile data was collected. Line ranges identify current
cohesion boundaries; implementation tickets must still perform their standard
pre-implementation verification against then-current main. Svelte LOC is
especially noisy because script, template, and component-local CSS share one
file, so recommendations were based on behavior ownership rather than totals.
