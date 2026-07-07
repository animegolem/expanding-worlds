---
node_id: AI-IMP-140
tags:
  - IMP-LIST
  - Implementation
  - design-pass
  - canvas
  - renderer
kanban_status: planned
depends_on: [AI-IMP-130]
parent_epic:
confidence_score: 0.6
date_created: 2026-07-07
date_completed:
---


# AI-IMP-140-image-body-treatment

## Summary of Issue #1

The kit's NodeCard gives placed images a 3px corner radius
(`--ew-node-radius`) and a soft drop shadow (`--ew-node-shadow`);
the shipped renderer draws raw flat sprites. This is WebGL work:
rounding needs a mask/shader path and the shadow a cheap pass that
holds §12.1 at 150+ visible images. Done means placed images
render with the designed radius + shadow on the board, exports/
crops stay untouched pixels (treatment is board presentation,
never baked), and the perf suite stays green.

### Out of Scope

- Selection visuals (shipped outline stands; color-token swap is
  AI-IMP-141).
- Card-appearance bodies (their look is 135/139 territory).
- Any doctrine question — ratified; this is execution.

### Design/Approach

Radius: rounded-rect mask (Pixi Graphics mask or a rounded-quad
shader) sized per placement; verify batch-friendliness — a mask
per sprite can kill batching, so prefer a shared shader/mesh
approach; MEASURE before choosing (the CLAUDE.md benchmark
discipline; the perf suite is the gate). Shadow: NOT a blur filter
per image (fill-rate death) — a shared 9-slice shadow texture
under each sprite (one texture, batched) sized to the placement,
alpha from the token. Both derive from 130's tokens via the
existing resources bridge. Treatment applies to the image body
only (crop previews/exports read original pixels — assert).

### Files to Touch

`packages/canvas-engine/src/renderers/placement.ts` (+ shared
shadow/mask resource, + tests where logic).
`packages/canvas-engine/src/resources.ts`: tokens.
`apps/desktop/e2e/perf.spec.ts` must stay green UNMODIFIED (the
hard gate); a small visual e2e asserts the treatment exists (e.g.
corner pixel sample via debug seam) if practical, else unit-level.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [ ] Radius + shadow on image bodies from tokens; approach chosen
      by measurement (numbers in Issues).
- [ ] Batching preserved: perf suite green locally, p95 within
      §12.1 (before/after numbers recorded).
- [ ] Exports/crop previews pixel-untouched (test).
- [ ] Gates: `pnpm -r build`, `pnpm -r test`, `pnpm lint`, desktop
      e2e hidden.
- [ ] HUMAN-TESTING entry appended at merge by the lead (does the
      treatment read as intended over dense boards).

### Acceptance Criteria

**GIVEN** a board of 150 visible images
**THEN** each renders with the 3px radius and soft shadow, and the
§12.1 perf targets hold.
**GIVEN** an export or crop preview
**THEN** pixels are the untreated original.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->
