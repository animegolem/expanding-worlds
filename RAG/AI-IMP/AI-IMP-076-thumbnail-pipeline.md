---
node_id: AI-IMP-076
tags:
  - IMP-LIST
  - Implementation
  - thumbnails
  - derivatives
kanban_status: planned
depends_on: []
parent_epic: [[AI-EPIC-014-gallery]]
confidence_score: 0.65
date_created: 2026-07-06
---

# AI-IMP-076-thumbnail-pipeline

## Summary of Issue #1

The derivative seam is complete but hollow: `derivative_jobs`
queues a thumbnail per imported asset, `processNextJob` drains with
a pluggable `DerivativeGenerator`, and §11.4 recovery expects to
rebuild missing derivatives lazily — but the only generator is the
Noop and no loop ever drains the queue. The gallery (EPIC-014) is
unusable without real thumbnails, and §4.7 notes the same codec
unlocks conversion adapters and tiles later. This ticket lands the
codec decision (written trade-off), a real generator producing
alpha-preserving thumbnails into `derivatives/thumbnails/`, a
background drain loop in the utility process that never blocks
imports, backfill for assets that predate the generator, and an
`ew-asset` protocol extension so the sandboxed renderer can load
thumbnails. Done when: importing an image yields a thumbnail file
without blocking the drop, a transparent PNG's thumbnail keeps its
alpha, backfill fills a pre-076 project on open, and the renderer
can display a thumbnail via URL.

### Out of Scope

The gallery view itself (077). Conversion adapters, PSD, tiles
(§4.7 deferred). Retry policy beyond the existing one-shot
done/failed states. Regenerating thumbnails on asset content change
(assets are content-addressed and immutable).

### Design/Approach

**The codec decision is the ticket's first checklist item and must
be written down in Issues Encountered before code.** Candidates:
(a) `sharp` (libvips): decodes all five §4.7 formats including
AVIF, runs in the utility process beside the DB, fast, but is the
project's first native dependency (prebuilds per platform,
electron-builder implications); (b) Electron-side decode
(`nativeImage` covers PNG/JPEG only — insufficient alone; an
offscreen-window decode covers everything Chromium renders but
drags thumbnailing into main). Weigh: format coverage, process
placement (§13.2 — the queue lives with the DB in the utility
process), packaging risk on the three release targets, and alpha
fidelity. Output format: alpha-capable (WebP with alpha preferred;
PNG acceptable) at a bounded box (target ≤512px long edge, no
upscaling) — the epic NFR forbids baking transparency onto a
background. Worker: an idle drain in the utility process — after
each `CommitAssetImport` and on project open, run `processNextJob`
until idle, yielding between jobs; push a `derivative-ready` notice
(assetId) through the existing project push channel so open views
repaint. Backfill: on open, enqueue thumbnail jobs for active
image assets whose derivative file is missing (idempotent — done
jobs with missing files re-enqueue; this IS §11.4's lazy rebuild).
Protocol: extend the `ew-asset://<sha256>` handler with a
`/thumb` suffix that serves the derivative when present and 404s
otherwise (renderer falls back to the original).

### Files to Touch

`packages/persistence/src/import/derivatives.ts` (+test): backfill
query (missing-file re-enqueue helper), generator export surface.
`apps/desktop/src/utility/` : real generator + drain loop +
`derivative-ready` push; generator unit-testable in isolation.
`apps/desktop/src/main/index.ts`: `/thumb` protocol branch.
`apps/desktop/package.json` (+build config) if the codec is a
native dep.
`apps/desktop/e2e/` (new or import.spec): import → thumbnail file
appears; alpha spot-check; backfill on relaunch.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and
**think**. Have you validated all aspects are **implemented** and
**tested**?
</CRITICAL_RULE>

- [ ] Codec decision written (trade-off in Issues Encountered):
      format coverage across png/jpeg/webp/gif/avif, process
      placement, packaging on mac/win/linux, alpha fidelity.
- [ ] Real DerivativeGenerator: decodes the five §4.7 formats,
      resizes to the bounded box without upscaling, writes an
      alpha-capable format under `derivatives/thumbnails/`; unit
      covers a transparent PNG (alpha channel survives) and a JPEG.
- [ ] Utility-process drain loop: triggered post-import and on
      open, yields between jobs, never blocks command execution
      (import e2e latency unchanged); failures mark the job failed
      and never wedge the loop.
- [ ] `derivative-ready` push per completed asset on the project
      push channel.
- [ ] Backfill/lazy rebuild: opening a project with queued-or-done
      jobs but missing files regenerates them (unit + relaunch e2e).
- [ ] `ew-asset://<hash>/thumb` serves the derivative; missing
      thumb 404s and the renderer helper falls back to the
      original URL.
- [ ] `pnpm -r build`, full gates green; release packaging still
      builds if a native dep landed (local `pnpm --filter
      @ew/desktop dist:mac` sanity run).

### Acceptance Criteria

**Scenario:** Thumbnails appear without being waited on.
**GIVEN** a running project and a 4000×3000 transparent PNG.
**WHEN** the user drops it on the board.
**THEN** the import completes at its normal speed, and shortly
after, a thumbnail file exists under `derivatives/thumbnails/`
whose long edge is ≤512px and whose alpha channel is intact, and a
`derivative-ready` push named the asset.
**WHEN** the derivative directory is deleted and the project
reopened.
**THEN** the thumbnails regenerate without user action.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->
