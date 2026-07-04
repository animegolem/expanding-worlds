---
node_id:
tags:
  - AI-log
  - development-summary
  - decorations
  - canvas
  - tools
closed_tickets: [AI-IMP-021]
created_date: 2026-07-04
related_files:
  - packages/canvas-engine/src/decoration-data.ts
  - packages/canvas-engine/src/renderers/decorations/text.ts
  - packages/canvas-engine/src/renderers/decorations/shape.ts
  - packages/canvas-engine/src/renderers/decorations/path.ts
  - packages/canvas-engine/src/renderers/decorations/line.ts
  - packages/canvas-engine/src/renderers/decorations/connector.ts
  - packages/canvas-engine/src/tools/tool-mode.ts
  - packages/canvas-engine/src/tools/draw-tools.ts
  - packages/canvas-engine/src/index.ts
  - apps/desktop/src/renderer/canvas/host.ts
  - apps/desktop/src/renderer/canvas/text-entry.ts
  - apps/desktop/src/renderer/canvas/decorations-ui.ts
  - apps/desktop/src/renderer/DecorationToolbar.svelte
  - apps/desktop/src/renderer/CanvasHost.svelte
  - apps/desktop/e2e/decorations.spec.ts
  - packages/persistence/src/canvas-text-data.test.ts
confidence_score: 0.92
---

# 2026-07-04-LOG-AI-decorations-tooling

## Work Completed

AI-IMP-021 implemented end to end in a delegated agent worktree.
Normative per-kind decoration data schemas (§4.9, world-space units)
now live in `decoration-data.ts` with runtime validators and style
defaults, including `legibleFontSize(zoom)` for the rev-0.8 canvas
text rule. Graphics-based renderers for text, shape
(rect/ellipse/triangle inside `data.shape`), path, line, arrow, and
connector are registered under `decoration:<kind>` in
`createDefaultRegistry()`. The connector renderer resolves anchored
endpoints from the placement's live display object via
`resources.resolveObject` inside a Pixi `container.onRender` callback
(follows committed moves AND ephemeral drags), with freed-anchor
fallbacks (`data.start`/`data.end`) taking precedence over stored
x1..y2. A `ToolManager` sits in front of the CanvasController:
select-mode events pass through unchanged; draw tools turn one drag
into exactly one CreateDecoration, Escape cancels with zero commands,
freehand thins samples at ≥2 world units, and the connector tool
highlights and anchors placements under its endpoints on the
CreateDecoration itself. Desktop side: a DOM contenteditable
text-entry overlay (create + double-click edit, one command each), a
`DecorationToolbar.svelte` with tool/style pickers and §6.8
group/ungroup/lock/hide controls plus hidden-items list, and
`decorations-ui.ts` implementing group-selection expansion so group
drags flow through one TransformContent. All validation gates green,
including a comprehensive `decorations.spec.ts` e2e.

## Session Commits

One commit on the agent branch `worktree-agent-a05fe316f64ed50ac`
covering the full ticket: engine schemas/renderers/tools + tests,
desktop toolbar/overlay/ui wiring, persistence FTS contract test, e2e
spec, and the ticket/log updates. The lead merges after review; the
ticket is checked complete but kanban closure is the lead's call per
the delegation model.

## Issues Encountered

Two test/type-only files outside the agent's fence needed edits and
are flagged for review: `scene-sync.test.ts` (asserted the fallback
stub label for `decoration:shape`, which this ticket necessarily
replaces with a real renderer) and `canvas.spec.ts` (duplicate global
`window.__ewDebug` declaration must stay identical to host.ts —
TS2717 — after the allowed additive debug hooks). The AI-IMP-019 move
driver has not merged into this branch, so the e2e validates the
group move by executing one TransformContent directly; member-click
group expansion is e2e-verified, so the gesture path composes once
019 lands — re-verify manually after merge. The agent worktree's
electron package was missing its binary (`install.js` no-ops
silently); copied `dist/` + `path.txt` from the parent repo's
identical version. A focus race made the text-edit e2e flaky once;
fixed by selecting existing text on open (type-to-replace) and
waiting for `document.activeElement` in the spec. Friction: no
"scene applied" event exists on the host handle, so the toolbar
refreshes hidden/selection state via `project.onChanged` plus a
120 ms trailing timeout.

## Tests Added

- `decoration-data.test.ts`: accept/reject per kind + legible font
  math (7 tests).
- `renderers/decorations/decorations.test.ts`: all five renderer
  modules, incl. connector anchor-follow via onRender, missing-anchor
  fallback, and domain-released `data.start/end` pickup (14 tests).
- `tools/tools.test.ts`: pass-through routing, one-command-per-drag,
  Escape/tool-switch cancellation, degenerate-click suppression,
  freehand thinning, connector anchor targeting + highlight, text
  hook (15 tests).
- `packages/persistence/src/canvas-text-data.test.ts`: canvas_text_fts
  finds the normative text shape; UpdateDecoration keeps FTS current
  (2 tests).
- `apps/desktop/e2e/decorations.spec.ts`: draws every kind asserting
  revision +1 each, connector anchor + follow after TransformContent,
  group/expand/move/ungroup, lock ⇒ marquee skip, hide/show
  round-trip, text overlay create/edit + searchProject hit.

## Next Steps

Lead review + merge alongside AI-IMP-018/019 siblings: watch
host.ts/CanvasHost.svelte (shared hotspots), re-run all gates on
master, and manually verify a real group drag once the move driver is
present. Consider adding a `SceneSync.onApplied` event to remove the
toolbar's timing-based refresh, and unifying the `__ewDebug` global
declaration into an exported type both e2e specs import. Snapping
(AI-IMP-022) can now target decoration AABBs via the existing
hit-test helpers.
