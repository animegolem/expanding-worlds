---
node_id: AI-IMP-307
tags:
  - IMP-LIST
  - Implementation
  - undo
  - appearance
  - tester-feedback
kanban_status: completed
depends_on:
parent_epic:
confidence_score: 0.6
date_created: 2026-07-17
date_completed: 2026-07-18
---

# AI-IMP-307-appearance-undo-integrity

## Summary of Issue #1

First tester field doc (2026-07-17, item 9): choosing the dot
appearance on an image placement replaces it with the dot (by
design, §4.6 appearance kinds) — but **Ctrl+Z returns a BLANK
image**, and further undo never restores the original; the asset
remains intact in the gallery. Undo is the one system that must
never lie (§10.2). This is DIAGNOSIS-FIRST: reproduce the exact
sequence, convict the mechanism in this ticket with citations
BEFORE any fix (candidate space to CHECK, not assume: the
SetAppearance inverse captures the wrong prior state; the undo
applies but the renderer fails to rehydrate the image texture;
command coalescing eats the prior appearance). Done means: the
sequence appearance-change → undo restores the exact prior visual
state, pinned by unit + e2e, and the conviction is recorded.

### Out of Scope

The "what is the dot FOR" communication question (design-side);
appearance picker UI changes; any §4.6 semantics change.

### Design/Approach

Reproduce with `__ewDebug` scene census at each step (before /
after appearance change / after undo). Convict at the command or
renderer seam with cited code. Fix at the convicted seam only.
Sweep the OTHER appearance kinds for the same class once
convicted — one mechanism likely covers all.

#### Pre-implementation review — 2026-07-17 (`2be2ea09`)

The command and ledger candidates are exonerated. `SetNodeAppearance`
reads all five prior columns, decodes them through the shared codec,
and returns that exact appearance as its inverse
(`packages/persistence/src/handlers/nodes.ts:485-513`;
`handlers/node-appearance.ts:118-169`). The appearance charm issues
the command inside one undo group
(`apps/desktop/src/renderer/canvas/charms-ui.ts:277-290`), matching its
group-only policy (`renderer/undo/undo-store.ts:94-103`).

The renderer is convicted. `buildBody` inferred spatial residency from
`__acquiredHash` / `__acquiring`, then image -> dot correctly released
and cleared those texture fields
(`packages/canvas-engine/src/renderers/placement.ts:317-331`). On undo,
the image row and asset hash returned, but `wasEngaged` was false, so
the rebuilt body stopped at `image-placeholder` and never acquired
(`:333-360`). The Culler keys residency by placement id and emits its
enter hook only on an out -> in transition (`culling.ts:67-84`); the
same visible placement never left residency across the two appearance
updates, so no later cull could heal it. The first undo therefore
restored the MODEL exactly; the reported "blank image" was a permanent
renderer placeholder, not missing asset state. A genuine residency
transition or canvas reopen could heal it; further undo could not.

This is a missed interaction in AI-IMP-025's residency repair, whose
close record already established that an identity rebuild while
resident must reacquire because the Culler will not re-grant. Existing
coverage tested resident image A -> image B
(`renderers/placement.test.ts:209-226`) but not image -> non-image ->
image. The persistence test also created an image but applied the
earlier icon inverse, never an inverse whose prior state was image
(`handlers/nodes.test.ts:232-265`).

### Files to Touch

- `packages/canvas-engine/src/renderers/placement.ts`: keep spatial
  residency independently of the current body/texture fields.
- `packages/canvas-engine/src/renderers/placement.test.ts`: resident
  and offscreen appearance round-trip regressions.
- `packages/persistence/src/handlers/nodes.test.ts`: exact image asset
  + crop inverse pin (handler behavior is unchanged).
- `apps/desktop/e2e/undo.spec.ts`: real charm + Mod+Z/redo texture and
  asset-liveness regression.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and
**think**. Have you validated all aspects are **implemented** and
**tested**?
</CRITICAL_RULE>

- [x] Reproduce: exact recipe + scene-census evidence recorded
      here.
- [x] Convict with cited code BEFORE fixing; record here.
- [x] Fix at the convicted seam; undo restores the exact prior
      visual state.
- [x] Sweep all appearance kinds for the same defect class;
      record findings.
- [x] Unit: SetAppearance inverse round-trips every kind.
- [x] e2e: image → dot → Ctrl+Z → image renders (texture visible,
      not blank), gallery untouched throughout.

### Acceptance Criteria

**Scenario:** Undoing an appearance change.
**GIVEN** an image placement rendered normally.
**WHEN** the user sets the dot appearance, then presses Ctrl+Z.
**THEN** the placement renders the original image exactly as
before,
**AND** redo returns the dot, and the gallery is untouched
throughout.

### Issues Encountered

<!--
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->

- Repair: `PlacementObject.__textureResident` now records the Culler's
  spatial grant independently of whether the current appearance owns a
  texture. `setPlacementTextureResident` stamps it before the non-image
  guard, so leaving the viewport as a dot clears it; `buildBody`
  reacquires a restored image only when that stamp is true. Texture
  refcounts, generation invalidation, and offscreen lazy placeholders
  are otherwise unchanged.
- Exact hidden-window census: before = `appearanceKind:image`, the
  imported `appearanceAssetId`, non-null `assetContentHash`, and
  `placementBody:image`; after choosing red dot = `appearanceKind:dot`
  and `placementBody:dot`, while the original `ew-asset://<hash>` still
  decoded and Gallery node ids were identical; Mod+Z restored the whole
  before-state object and `placementBody:image`; Shift+Mod+Z returned
  dot while the same asset URL still decoded and Gallery ids remained
  identical.
- Sweep: resident image round-trips through null, dot, icon, card, and
  frame all reacquire. A placement that leaves residency while wearing
  a dot restores to an offscreen placeholder and acquires only after
  re-entry, preserving §12.2 lazy loading.
- Evidence: persistence focused 23/23; canvas-engine placement focused
  68/68; full persistence 665/665 and canvas-engine 414/414 at the
  shared wave tip; hidden-window AI-IMP-307 e2e 1/1; `pnpm -r build`
  green; all four 307-owned files pass ESLint. The workspace-wide lint
  command was temporarily red on an unrelated parallel edit:
  `apps/desktop/src/renderer/canvas/gestures-ui.ts` imported unused
  `hitTest`; this ticket did not touch that file.
