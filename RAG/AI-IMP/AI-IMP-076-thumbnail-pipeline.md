---
node_id: AI-IMP-076
tags:
  - IMP-LIST
  - Implementation
  - thumbnails
  - derivatives
kanban_status: completed
depends_on: []
parent_epic: [[AI-EPIC-014-gallery]]
confidence_score: 0.65
date_created: 2026-07-06
date_completed: 2026-07-06
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

- [x] Codec decision written (trade-off in Issues Encountered):
      format coverage across png/jpeg/webp/gif/avif, process
      placement, packaging on mac/win/linux, alpha fidelity.
      *(Decision: Chromium codecs in the RENDERER — zero native
      deps; see Issues.)*
- [x] Real generation: decodes the five §4.7 formats via Chromium
      (the same decode path the board uses), resizes to the 512
      box without upscaling, writes WebP-with-alpha under
      `derivatives/thumbnails/<hash>.webp`. *(Alpha proven by e2e
      pixel sampling of the served thumbnail — node can't decode
      WebP without a dep; JPEG rides the identical decode path the
      board exercises daily. The DerivativeGenerator class seam
      stays for tests; production generation is the renderer
      module `assets/thumbnails.ts`.)*
- [x] Drain loop: RENDERER-driven pull (claim → generate → submit),
      triggered on service-ready, boot, and every CommitAssetImport
      event; commands never block (import e2e latency unchanged, 67
      suite green); a failed decode submits null → job marked
      failed, loop continues. *(Deviation from the ticket's
      utility-loop wording — the utility owns queue + files, the
      renderer owns pixels; claiming does not lock, so a dead
      window leaves jobs queued and the next drive self-heals.)*
- [x] Push per completed asset: utility `thumbnail-ready` → main
      broadcasts `asset:thumbnail-ready` to all windows
      (preload `ew.derivatives.onThumbnailReady`).
- [x] Backfill/lazy rebuild: `enqueueMissingThumbnails` runs on
      every service open, per content hash, suppressed by existing
      files and queued jobs (units incl. shared-hash dedupe;
      relaunch e2e deletes derivatives/ and watches it regrow).
- [x] `ew-asset://<hash>/thumb` serves the derivative (webp,
      max-age 3600 — regenerable, so not immutable); missing thumb
      404s. *(The original-URL fallback is the consumer's one-line
      contract — 077's grid does `onerror` → `ew-asset://<hash>` —
      no helper needed before a consumer exists.)*
- [x] `pnpm -r build`, full gates green: 67 desktop e2e (+2), 395
      persistence units (+5), lint, desktop units. *(No native dep
      landed, so no packaging re-verification was required — that
      was the point of the decision.)*

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

**The codec decision (the ticket's mandate).** Chosen: Chromium
codecs in the renderer via `createImageBitmap` + `OffscreenCanvas.
convertToBlob('image/webp')`. Rejected: (a) `sharp` — full format
coverage and utility-process placement, but it would be the
project's FIRST native dependency (AI-IMP-009 deliberately chose
`node:sqlite` to keep the tree native-free), on a release pipeline
that has never been re-verified, across three targets; (b)
`nativeImage` — PNG/JPEG only, insufficient; (c) wasm codec packs —
several deps, patchy GIF support. The clincher beyond zero deps:
the renderer's Chromium IS the app's de-facto format envelope —
anything the board can display thumbnails by construction, and the
two can never drift. Costs accepted: generation requires a live
window (fine for a desktop app whose gallery is a window surface;
recorded in §14.4 rev 0.27), and future conversion adapters (PSD)
still need their own codec — §4.7's "one codec unlocks all three"
hope is amended, since neither sharp nor Chromium decodes PSD
anyway.

**Architecture that fell out**: renderer pulls (claim → generate →
submit), utility owns queue + files + atomic tmp/rename writes,
claiming never locks — a dead renderer leaves the job queued and
the next drive heals it; double-generation across windows is
possible and harmless (same bytes, last write wins).

**Backfill dedupe bug caught by its own unit**: queued-job
suppression was per-asset while thumbnails are per-hash — a second
asset sharing bytes re-enqueued on every open. The suppression
subquery now joins on content_hash.

**Deviations**: the alpha-survival proof is e2e pixel sampling of
the served /thumb (node cannot decode WebP without adding the very
dep this ticket avoided); no dedicated JPEG unit (identical decode
path). The ticket's "utility-process drain loop" wording became
the renderer-driven pull above. Animated GIF thumbnails are the
first frame (a thumbnail is a still).