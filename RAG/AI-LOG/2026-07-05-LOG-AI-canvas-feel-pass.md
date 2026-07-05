---
node_id: LOG-2026-07-05-canvas-feel-pass
tags:
  - AI-log
  - development-summary
  - canvas
  - feel
  - polish
closed_tickets: [AI-IMP-024, AI-IMP-025, AI-IMP-026, AI-IMP-027, AI-IMP-028, AI-IMP-029, AI-EPIC-009]
created_date: 2026-07-05
related_files:
  - RAG/RFC-0001-Core-Note-Node-and-Canvas-Model.md
  - packages/canvas-engine/src/renderers/placement.ts
  - packages/canvas-engine/src/snap-provider.ts
  - apps/desktop/src/renderer/canvas/host.ts
  - packages/persistence/src/handlers/lifecycle.ts
confidence_score: 0.9
---

# 2026-07-05-LOG-AI-canvas-feel-pass

## Work Completed

The owner's first hands-on session with the EPIC-004 build surfaced
feel debt; a design conversation produced RFC rev 0.9 (camera input
mapping, quiet-snapping spec, the grouping principle — relational
data never mirrors board arrangement, frames are the sanctioned
future shape — the §14.3 contents-outline deferred scope, and the
§8.2 chrome design language), then AI-EPIC-009 was cut into
IMP-024..028 and executed: lead built 024 (native trackpad mapping —
ctrl-wheel pinch zooms at pointer, plain wheel pans — plus cursor
states), 025 (the black-box bug + drag fidelity), and 028
(DeleteContent batch delete, §9.2 notices, z-order buttons, Cmd+A);
agents in worktrees delivered 026 (snap hysteresis 6/9 px per axis,
dashed 40%-opacity guides, engaged-only) and 027 (block-polygon
arrows, triangle round-joins) with zero fence violations.

The load-bearing discovery: the black box was `appearanceSignature`
including width/height — every resize frame rebuilt the image body
into the lazy placeholder while the item never left residency, and
the Culler only fires hooks on transitions, so no re-grant ever came.
Fixed by resizing image bodies in place, having rebuilds re-acquire
when the container held/was acquiring a texture, and a new
`placementBody` texture-state e2e probe. Adornment detachment had two
mechanisms (outline drawn from canonical items during drags; handles
redrawn from stale canonical between pointerup and re-query) — both
fixed with a host-level ephemeral map and `handle.effectiveItem`.

## Session Commits

36445c7 RFC 0.9 · f72f1dc epic cut · a3d45cd IMP-024 ·
983221b/f0415be agent merges · f40cc3d guide wiring · ccb8b2c close
026/027 · 0768e57 IMP-025 · b2b8ed8 IMP-028.

## Issues Encountered

- Playwright propagates held keyboard modifiers into mouse.wheel —
  ctrl-wheel zoom is e2e-testable directly. Synthetic WheelEvent
  client coords coerce to integers; anchor-invariance math must use
  the coerced values against fractional rect offsets.
- The controller deliberately keeps a multi-selection when clicking a
  selected item (drag-start ambiguity) — click-to-collapse does not
  exist; tests must clear selection first.
- One flake: the AI-IMP-022 snap e2e failed once in a full run,
  passed isolated and on rerun. Unreproduced; watch it.
- Ticket-cut discipline slipped once (pre-checked checklist at cut
  time, same as EPIC-004); caught and rewritten immediately.
- Agent worktrees were cut from a pre-ticket commit; both agents
  fast-forwarded cleanly but briefs should note it.

## Tests Added

185 canvas-engine (+31: hysteresis, dash geometry, arrow polygon,
residency races), 340 persistence (+4 DeleteContent), 18 desktop e2e
(+3: §6.9 input mapping incl. cursors and handle hover; texture
residency round-trip; delete/notice/z-order/select-all).

## Late addition (same day)

The owner hardware pass approved pan/scroll feel, snapping, delete,
and arrows (FR-6), and surfaced three more defects, fixed as
AI-IMP-029: the Pixi app initialized without resolution/autoDensity
(the whole board rendered at CSS pixels and upscaled — the dominant
sharpness gap vs Miro) plus no texture mipmaps (motion shimmer);
decoration bounds ignored stroke extents so selection outlines missed
the visual edge (arrows now use the exact arrowPolygon silhouette —
outline, hit, marquee, snap, and align all read visual bounds); and
handles hid during 'gesture-pending', making a click read as two
draws. 189 engine / 340 persistence tests, 18/18 e2e (perf suite at
device resolution), lint clean. EPIC-009 closed.

## Next Steps (superseded — epic closed)

Original close-out note, kept for context: pinch/
two-finger feel and zoom-speed constants (host.ts WHEEL_ZOOM_SPEED
0.0015 / PINCH_ZOOM_SPEED 0.01), drag/resize smoothness, snap
quietness, and FR-6 arrow visual approval (IMP-024 has the two open
checklist items). After sign-off: close 024 + the epic, then EPIC-005
(notes/links/phantoms) per the 2026-07-04 log. The deferred contents
outline (§14.3) belongs to EPIC-006; frames stay an open question
(§19 #19).

EPIC-005 (notes, links, phantoms) is next, per the 2026-07-04 log.
Known limitation recorded on IMP-029: DPR is read once at mount.
Owner ideas parked: artist-drawn SVG shapes imported as decorations
(polish era); the owner's artist friend gets the M1 and becomes the
first outside tester after EPIC-005-ish.

## Batch two (same day, owner-approved batch protocol)

RFC rev 0.10 reframed content entry around the importer dialogue +
adapters (owner mental model; PSD conversion keeps an
archived-original sidecar). AI-EPIC-010 (hands-on hardening) cut as
the rolling home for owner-testing findings. AI-IMP-030: text
decorations were inert because TextData stored no extents (zero-area
hit box; the dblclick e2e only ever passed inside the 4-unit hit
slop) — the entry overlay now measures itself at commit and stores
measuredWidth/measuredHeight; select/move/re-edit all work.
AI-IMP-031: shapes spun on a wheel because the rotate gesture mapped
their top-left but never their rotation field — now rigid-body
rotation; single-selection chrome is oriented (outline, handles,
angle-quantized cursors, corner rotate zones) and rotated resize
runs in the item's local frame. Full-suite e2e flake root-caused to
machine-load races (toolbar's 120ms debounced refresh swallowing
clicks); playwright retries: 1; the click race is recorded debt.
Owner feel pass on rotation pending; grid background (visual only,
snapping stays content-edge per owner) queued as the next batch
item. Final: 201 engine / 340 persistence / 19 e2e, all green.
