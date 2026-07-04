---
node_id: AI-IMP-017
tags:
  - IMP-LIST
  - Implementation
  - renderer
  - pixijs
  - canvas
kanban_status: planned
depends_on: [AI-IMP-016]
parent_epic: [[AI-EPIC-004-canvas-board-loop]]
confidence_score: 0.8
date_created: 2026-07-04
date_completed:
---

# AI-IMP-017-renderer-host-and-scene-projection

## Summary of Issue #1

Nothing draws a canvas: `@ew/canvas-engine` is an empty stub and the
renderer has no way to read image bytes (RFC §11.1 forbids it touching
persistence). Build the PixiJS 8 scene projection: the three render
planes of §4.4, an incremental sync from a scene query to display
objects, dot/icon/image placement rendering, and a custom
`ew-asset://` protocol in the main process that streams managed blobs
to the sandboxed renderer by content hash. Done means: the desktop app
mounts the root canvas on open, placements created through
`window.ew.project.execute` appear (and disappear) via project-changed
re-query without reload, and an e2e test asserts it.

### Out of Scope

Camera, selection, hit testing, gestures (AI-IMP-018). Labels
(AI-IMP-019). Decoration renderers beyond the registry seam
(AI-IMP-021). Background image rendering beyond a solid color +
untiled image sprite (tiling: AI-IMP-023). Culling/eviction
(AI-IMP-023). Import surfaces (AI-IMP-020).

### Design/Approach

Per §13.1 the renderer stays framework-independent: all Pixi code
lives in `@ew/canvas-engine`; Svelte only hosts it. The engine builds
three planes (background, shared content, overlay) as Pixi containers.
`getCanvasContents` lacks appearance, note title, and asset info, so
add a `getCanvasScene` query (persistence) returning: canvas
background (asset content hash + mime + settings JSON + color),
camera, and the render-ordered item list where placements carry
appearance columns, note title, and — for image appearances — asset
`contentHash`/`mimeType`. SceneSync diffs a snapshot against the
current display map keyed by item id (create/update/remove/reorder)
so re-query is cheap and Pixi objects persist across syncs. A renderer
registry maps item kinds to renderer modules (`placement`,
`decoration:<type>`) so 019/021 add renderers without touching the
sync core; unknown decoration kinds render as a neutral outline stub.
Textures load through `ew-asset://<contentHash>` — a protocol handler
registered in main (stream from the managed blob store, immutable
cache headers, 404 on unknown hash); the utility process is not
involved in serving bytes. Sync logic is testable headless: Pixi
containers construct without a GPU context; vitest covers diffing.

### Files to Touch

`packages/canvas-engine/package.json`: add pixi.js ^8 dependency.
`packages/canvas-engine/src/{planes.ts,scene-sync.ts,types.ts}`: planes, diff/apply core, snapshot types.
`packages/canvas-engine/src/renderers/{registry.ts,placement.ts}`: renderer seam + dot/icon/image placement renderer.
`packages/canvas-engine/src/*.test.ts`: sync diff + renderer tests.
`packages/persistence/src/queries-structure.ts`: `getCanvasScene` query.
`packages/persistence/src/queries-structure.test.ts` (or sibling): query tests.
`apps/desktop/src/main/index.ts`: register `ew-asset://` protocol scoped to the open project's blob store.
`apps/desktop/src/renderer/CanvasHost.svelte` + `apps/desktop/src/renderer/canvas/host.ts`: mount Pixi app, initial query, `onChanged` re-query, resize handling, `window.__ewDebug` scene stats for e2e.
`apps/desktop/src/renderer/Workspace.svelte`: embed CanvasHost.
`apps/desktop/e2e/canvas.spec.ts`: new e2e.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [ ] Add `getCanvasScene` query in queries-structure.ts: background {assetContentHash, assetMimeType, settings, color}, camera, ordered items with placement appearance columns + note title + image-asset contentHash/mimeType; trashed canvas returns null scene; tests cover appearance join, title join, trashed exclusion, deterministic order.
- [ ] Add pixi.js to canvas-engine; export ScenePlanes creating background/content/overlay containers in fixed order.
- [ ] Implement SceneSync: apply(snapshot) creates/updates/removes/reorders content-plane children keyed by id; unit tests for each transition incl. render-order move and no-op stability (same object identity preserved).
- [ ] Implement renderer registry (kind → {create, update, destroy}) and the placement renderer: dot (circle + color), icon (placeholder glyph), image (sprite from `ew-asset://<hash>`, natural aspect, width/height/scale/rotation/flip applied); unit tests with a fake texture loader.
- [ ] Render canvas background color and untiled background image sprite (settings JSON transform applied) in the background plane.
- [ ] Register `ew-asset://` in main: resolve content hash → blob path under the open project dir, stream with `Content-Type` + long-lived immutable cache header, reject traversal/unknown hashes; deny when no project open.
- [ ] CanvasHost.svelte + host.ts: create Pixi Application, mount planes, initial `getCanvasScene` for the root canvas, re-query on `window.ew.project.onChanged`, window-resize handling, dispose on unmount; expose `window.__ewDebug.sceneStats()`.
- [ ] e2e canvas.spec.ts: open app with EW_PROJECT_DIR; execute CreateNode+SetNodeAppearance(dot)+CreatePlacement via the page; assert sceneStats shows the placement without reload; trash the node (TrashNode) and assert removal.
- [ ] Full gates green: `pnpm -r build && pnpm -r --filter '!@ew/desktop' test && pnpm lint` and desktop e2e.

### Acceptance Criteria

**Scenario:** Root canvas renders and stays in sync.
**GIVEN** a fresh project opened in the desktop app.
**WHEN** the renderer executes CreateNode + SetNodeAppearance(image asset) + CreatePlacement.
**THEN** the placement's sprite appears in the content plane at its transform, textured via `ew-asset://`.
**AND** `getCanvasScene` returned appearance, note title, and asset hash in one round trip.
**WHEN** the node is trashed.
**THEN** the display object is removed on the next project-changed re-query without reload.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->
