---
node_id: AI-IMP-025
tags:
  - IMP-LIST
  - Implementation
  - canvas
  - renderer
  - bug
kanban_status: in-progress
depends_on: [AI-IMP-023]
parent_epic: [[AI-EPIC-009-canvas-feel-pass]]
confidence_score: 0.75
date_created: 2026-07-04
date_completed:
---

# AI-IMP-025-texture-correctness-and-drag-fidelity

## Summary of Issue #1

Two defects the EPIC-004 test suite is structurally blind to (it
asserts scene/command state, never rendered texture state). First: an
image imported and then moved rendered as a black box permanently —
a texture released or never re-acquired by the residency system
(AI-IMP-023) while the sprite stayed renderable. Suspect area: cull
passes are scheduled from camera changes and scene refreshes, not
from ephemeral gesture movement or commit-time identity-preserving
updates, so renderable/resident state can go stale against actual
positions; the `__textureGeneration`/`__acquiring` guards may also
drop a grant on the floor when an update lands mid-load. Second:
during drags the object and its adornments (selection outline,
handles, label) visibly separate for a frame, and gesture commit can
flash. Done means: a deterministic repro of the black box exists,
the root cause is fixed with a texture-state-level regression test,
and object + adornments provably update in the same frame with no
commit flash.

### Out of Scope

Camera input and cursors (AI-IMP-024); snapping visuals (AI-IMP-026);
tiled-background changes (the tile path only if the root cause turns
out to live there); perf-budget retuning beyond what the fix needs.

### Design/Approach

Diagnose before touching code: instrument `__ewDebug.textureStats`
plus a per-placement resident/renderable dump, script the black-box
repro (import → drag → commit → optionally pan away and back) in a
scratch e2e, and bisect the residency path. Candidate fixes, applied
only as evidence dictates: schedule a cull pass after ephemeral
updates (rAF-coalesced, same scheduleCull), re-run residency on
`onItemUpdated` commits, and harden `setPlacementTextureResident`
so a generation bump during load re-requests instead of abandoning.
Add a unit-level race test in texture-budget/culling suites and one
e2e that asserts `textureStats` residency for a moved placement —
pixel-adjacent, not scene-state. For adornment lag: gestures-ui
currently redraws selection chrome from its own listeners; move
adornment redraw into the same code path that applies ephemeral
updates (host `applyEphemeral` → notify adornment layer) or into one
shared rAF tick ordered after ephemeral application, so object and
chrome commit to the same frame. Commit flash: verify SceneSync
`onItemUpdated` preserves sprite identity and does not re-set an
identical texture (guard on hash equality) and that the ephemeral →
canonical handoff happens in one frame.

### Files to Touch

`apps/desktop/src/renderer/canvas/host.ts`: scheduleCull after
ephemeral application; adornment-sync ordering; commit handoff.
`packages/canvas-engine/src/renderers/placement.ts`: residency race
hardening (re-request on generation change; hash-equality guard).
`packages/canvas-engine/src/culling.ts` / `texture-budget.ts`: only
as the diagnosis dictates.
`packages/canvas-engine/src/{culling,texture-budget}.test.ts`: race
regression tests.
`apps/desktop/src/renderer/canvas/gestures-ui.ts`: adornment redraw
driven from the ephemeral-update path.
`apps/desktop/e2e/canvas.spec.ts` (or perf.spec.ts): moved-placement
texture-residency regression e2e.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and
**think**. Have you validated all aspects are **implemented** and
**tested**?
</CRITICAL_RULE>

- [x] Script the black-box repro (import image → move → commit → pan
      away/back) against __ewDebug texture/residency dumps; record
      the exact failing sequence in Issues Encountered.
- [x] Root-cause and fix; the fix must name the mechanism (stale cull
      after ephemeral/commit, dropped grant mid-load, or other) in
      the commit message.
- [x] Unit regression: texture-budget/culling race test covering the
      identified sequence (and the revoke-while-loading neighbors).
- [x] e2e regression: place image, drag it, commit, assert its hash
      is resident and sprite texture non-empty via __ewDebug; include
      the pan-away/pan-back cycle.
- [x] Adornments: drive selection outline/handles/label updates from
      the same tick as ephemeral application; verify no one-frame
      separation (manual on hardware + ordering unit test if the
      seam allows).
- [x] Commit handoff: no texture re-set when hash unchanged; no
      visible flash at gesture end (manual verification on hardware,
      plus assertion that the display object identity survives the
      commit re-query).
- [x] Run gates: `pnpm -r build`, all unit suites, 15+ desktop e2e,
      §12.1 perf suite on hardware GL, lint.

### Acceptance Criteria

**Scenario:** Artist imports an image and rearranges it.
**GIVEN** a canvas with a freshly imported image placement
**WHEN** the user drags it to a new position and releases
**THEN** the image renders correctly during and after the drag (no
black box), its texture hash reports resident, and exactly one
TransformContent command committed.
**WHEN** the user pans far away and back
**THEN** the image re-renders correctly after residency eviction and
re-acquisition.
**WHEN** the user watches the selection chrome during a drag
**THEN** outline, handles, and label track the object with no visible
separation and no flash on release.

### Issues Encountered

<!-- Filled out post-work. -->
Root cause of the black box was sharper than the ticket's suspects:
`appearanceSignature` included width/height, so ANY resize — every
ephemeral frame of a resize gesture, and its commit — rebuilt the
body into the lazy placeholder while the item never left residency;
the Culler only fires hooks on transitions, so the "re-grant" the
rebuild comment counted on never came. Grey box forever ("post move"
in the owner's report was a corner-handle resize). Three fixes:
(1) size left the signature — image bodies resize in place
(sprite/placeholder dimensions), vector bodies redraw; (2) buildBody
now records whether the container held or was acquiring a texture
and re-acquires itself after a genuine identity rebuild;
(3) `__acquiring` clears on rebuild so the re-acquire isn't blocked.
Four unit tests cover resize-keeps-texture, rebuild-reacquires,
rebuild-mid-flight, and lazy-stays-lazy; the e2e drives
import→move→resize→pan-away→pan-back against a new
`__ewDebug.placementBody` probe (texture state, not scene state).
Adornment separation had a second mechanism beyond outline lag: on
pointerup, handles redrew from canonical items before the re-query
landed, flashing at the pre-gesture position. Host now keeps an
ephemeral-values map (cleared when a fresh scene lands); the
selection outline and gestures-ui handles both draw through
`handle.effectiveItem`. Final visual confirmation of drag feel folds
into the owner's epic-close hardware pass alongside AI-IMP-024's
open items.
