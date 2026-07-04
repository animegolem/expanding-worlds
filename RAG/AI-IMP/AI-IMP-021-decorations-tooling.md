---
node_id: AI-IMP-021
tags:
  - IMP-LIST
  - Implementation
  - decorations
  - canvas
kanban_status: completed
depends_on: [AI-IMP-018]
parent_epic: [[AI-EPIC-004-canvas-board-loop]]
confidence_score: 0.75
date_created: 2026-07-04
date_completed: 2026-07-04
---

# AI-IMP-021-decorations-tooling

## Summary of Issue #1

Decoration commands exist (CreateDecoration, UpdateDecoration,
DeleteDecoration, Group/Ungroup) but nothing renders or creates
decorations: §4.9/§6.8 canvas text, shapes, freehand, lines, arrows,
and anchored connectors have no tools, no renderers, and no normative
`data` shapes. Define the per-kind data schemas, build the decoration
renderers behind AI-IMP-017's registry seam, and ship the creation
tools plus group/lock/hide controls. Done means: §17 item 18 passes
(draw every kind incl. a placement-anchored connector) and group/
lock/hide behave per §6.8 with tests.

### Out of Scope

Reorder UI (AI-IMP-019 owns it; decorations participate for free via
the shared plane). Snapping (AI-IMP-022). Undo-stack UI (EPIC-007).
Guides/highlights/spacers decoration kinds and clouds/polygons
(deferred; renderer stub covers unknown kinds). Do NOT touch:
scene-sync core, controller/camera/selection/hit-test modules,
placement renderer, persistence handlers (all needed commands exist),
`service.ts`.

### Design/Approach

Normative `data` schemas (world-space units; `kind` column carries the
type; FTS extracts `$.text`, so text decorations MUST store their
string at `data.text`):
- text: {x, y, text, fontSize, color, width?}
- rect|ellipse|triangle: {x, y, width, height, rotation?, stroke, strokeWidth, fill?}
- freehand: {points: [[x,y],…], stroke, strokeWidth}
- line|arrow: {x1, y1, x2, y2, stroke, strokeWidth}
- connector: {x1, y1, x2, y2, stroke, strokeWidth} — endpoint columns
  anchor_start/end_placement_id override the stored point while
  anchored; the stored point is the free/last-rendered fallback.
Renderers register per kind; connectors resolve anchored endpoints
against placement display objects each sync and re-render when
placements move (subscribe to content-plane transform updates from the
scene-sync seam). Text entry uses a DOM overlay (§12.2): a
world-positioned contenteditable synced to camera; on commit,
CreateDecoration with fontSize defaulting to legible-at-current-zoom
(rev 0.8: fixed world size thereafter, never rescaled). Creation tools
are controller interaction modes (toolbar selects mode; drag defines
geometry; Escape cancels); freehand captures pointer samples with
light distance thinning. Each completed creation = one
CreateDecoration (§10.2). Group/Ungroup call the existing commands on
the selection; a grouped member's selection expands to the group, and
group move goes through the normal 018/019 gesture path (relative
render order untouched by transforms, satisfying §6.8). Lock/hide
toggles call UpdateDecoration {set:{locked/hidden}}; hit testing
already skips them (018), and hidden decorations don't render.

### Files to Touch

`packages/canvas-engine/src/decoration-data.ts` (+ test): schema types, validators, default styles.
`packages/canvas-engine/src/renderers/decorations/{text,shape,freehand,line,connector}.ts` (+ tests): renderer modules registered by kind.
`packages/canvas-engine/src/tools/{tool-mode.ts,draw-tools.ts,text-entry.ts}` (+ tests): creation modes and DOM text overlay contract.
`apps/desktop/src/renderer/canvas/host.ts`: toolbar mode wiring, text overlay mount, group/lock/hide controls on selection.
`apps/desktop/src/renderer/DecorationToolbar.svelte`: tool + style pickers.
`apps/desktop/e2e/decorations.spec.ts`: §17 item 18/19-subset e2e.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [x] decoration-data.ts: types + runtime validators for all kinds above; unit tests for accept/reject; exported defaults (stroke, strokeWidth, fontSize ratio for legible-at-zoom).
- [x] Shape/line/arrow/freehand renderers: Graphics-based, world-space geometry from data, hidden ⇒ not rendered, selected bounds reported for hit-test/handles; unit tests per kind.
- [x] Text renderer: world-space Pixi text at data.fontSize; text stored at data.text (FTS contract preserved — add a persistence-side test asserting a canvas_text_fts hit for a decoration created with the new shape).
- [x] Connector renderer: free endpoints from data; anchored endpoints track placement centers live during placement transforms; deleting an anchored placement leaves the connector free at last position (domain already releases anchors — assert the renderer picks up the released point).
- [x] Tool modes: toolbar-selected create modes for text/rect/ellipse/triangle/line/arrow/connector/freehand; drag defines geometry; Escape cancels with zero commands; each completion issues exactly one CreateDecoration (fake-gateway tests).
- [x] Text entry overlay: click-to-place contenteditable positioned/scaled with camera; commit on blur/Enter creates decoration with legible-at-current-zoom fontSize; empty text creates nothing; editing an existing text decoration re-opens the overlay and commits one UpdateDecoration.
- [x] Connector anchor targeting: dragging an endpoint over a placement highlights it and sets anchor on commit (UpdateDecoration set anchors on create-follow-up is NOT allowed — CreateDecoration carries anchors); dropping on empty space leaves a free point.
- [x] Group/Ungroup on selection via existing commands; selecting a member selects the group; group drag moves members through one TransformContent; ungroup restores individual selection; tests.
- [x] Lock/hide/show controls issuing UpdateDecoration; locked items unselectable by click/marquee (verify against 018 hit-test skip), hidden items invisible but restorable via a simple hidden-items list in the toolbar.
- [x] e2e decorations.spec.ts: draw one of each kind (asserting one command each in the log), anchor a connector to a placement, drag the placement → connector follows, group two shapes and move them as one command, lock one and verify marquee skips it, hide/show round-trip.
- [x] Full gates green: `pnpm -r build && pnpm -r --filter '!@ew/desktop' test && pnpm lint` and desktop e2e.

### Acceptance Criteria

**Scenario:** §17 item 18 plus §6.8 semantics.
**GIVEN** a canvas with two image placements.
**WHEN** the user draws text, a rectangle, an ellipse, a freehand path, a line, an arrow, and a connector anchored to a placement.
**THEN** each tool completion adds exactly one CreateDecoration to the command log and renders in the shared content plane.
**WHEN** the anchored placement is dragged.
**THEN** the connector endpoint follows it live and after commit.
**WHEN** the shapes are grouped, moved, locked, hidden, shown, and ungrouped.
**THEN** the group moves as one durable command preserving relative order, locked items resist selection, and hidden items reappear intact.
**AND** the text decoration is findable via full-text search (canvas_text_fts).

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->

- **File-plan deviations from "Files to Touch".** The freehand
  renderer is `renderers/decorations/path.ts` (the kind column value
  is `path`, not `freehand`). The text-entry overlay lives in
  `apps/desktop/src/renderer/canvas/text-entry.ts`, not in
  `packages/canvas-engine/src/tools/` — it is a DOM contenteditable
  (§12.2) and the engine package stays DOM-free; the engine side only
  exposes the `ToolManager.onPlaceText` hook. Selection controls
  (group/lock/hide + hidden list) live in a new
  `apps/desktop/src/renderer/canvas/decorations-ui.ts` +
  `DecorationToolbar.svelte` rather than inside `host.ts`, keeping
  host edits minimal.
- **Two out-of-fence test/type-only edits** (no fenced source
  changed): (1) `packages/canvas-engine/src/scene-sync.test.ts`
  asserted the fallback-stub label `stub:decoration:shape`; once a
  real `decoration:shape` renderer is registered in
  `createDefaultRegistry()` (this ticket's job) the label is
  `decoration:<id>` — updated the two assertions. (2)
  `apps/desktop/e2e/canvas.spec.ts` re-declares the global
  `window.__ewDebug` type; TS2717 requires duplicate declarations to
  be identical, so the (allowed) additive debug hooks in `host.ts`
  forced the mirrored declaration update. No test logic changed in
  either file.
- **019 move driver not merged into this branch.** Group drag through
  the normal gesture pipeline could not be exercised end-to-end here
  (no move driver is registered on this branch); the e2e issues the
  single TransformContent for both group members directly and asserts
  revision +1 plus data movement. Group-member selection expansion
  (click one member → whole group selected) IS e2e-verified, so once
  019's driver merges, a group drag flows through one GestureSession
  → one TransformContent by construction. Recommend the lead re-runs
  a manual group drag after merging 018/019/021.
- **Anchor-release renderer pickup is unit-tested, not e2e.** The
  domain writes freed endpoints to `data.start`/`data.end` (see
  `releaseConnectorAnchors`), NOT into x1/y1/x2/y2; the connector
  renderer resolves live anchor > freed fallback > x1..y2, and the
  fallback path is asserted in
  `renderers/decorations/decorations.test.ts`.
- **Text-edit focus race in e2e (fixed).** The overlay focuses itself
  in a `setTimeout(0)` after the placing pointer event; typing could
  start before focus landed. The edit overlay now opens with the
  existing text selected (type-to-replace) and the spec waits for
  `document.activeElement` to be the overlay before typing.
- **Electron binary missing in the agent worktree.** `pnpm install`
  left `node_modules/.pnpm/electron@39.8.10/.../dist` without the
  app bundle and `install.js` no-oped silently; copied `dist/` +
  `path.txt` from the parent repo's identical electron version to run
  the e2e suite. Environment issue only, no source impact.
- **Toolbar refresh seam friction.** The scene handle exposes no
  "scene applied" event, so the toolbar refreshes its hidden-items /
  selection state from `project.onChanged` plus a 120 ms trailing
  timeout (the host's re-query is async). Works, but a
  `sync.onApplied`-style hook would remove the timing coupling —
  noted for the lead's integration pass.
