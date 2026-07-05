---
node_id: LOG-2026-07-05-canvas-feel-pass
tags:
  - AI-log
  - development-summary
  - canvas
  - feel
  - polish
closed_tickets: [AI-IMP-024..040 (see epics), AI-EPIC-009]
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

## Batch three (same day): grid + background-as-stage

RFC rev 0.11: a background image defines the canvas's STAGE — the
design answer to "what does background even mean on an infinite
canvas". AI-IMP-032 shipped it: adaptive multi-scale grid on
backgroundless canvases (subdivides forever, hidden under a stage),
void treatment beyond the extent, zoom-to-fit targets the extent,
set-from-file normalizes to STAGE_WIDTH 2048 (proportions, not
pixels), set-from-selection preserves the placed rect, replace fits
the prior extent (RFC Q7 closed), reset returns to the normalized
default, and a CameraFlight eases all fit/frame actions (user input
auto-cancels via the camera onChanged hook). getCanvasScene
background now carries asset dims. 209 engine / 340 persistence /
20 e2e. Owner feel pass pending on grid density, void color, flight
duration; text/rotation feel pass also still pending from batch two.

## Batch four (same day): orientation snap, text styling, tidy drawing

RFC rev 0.12 + IMP-033/034/035. Rotation now snaps by resulting
ORIENTATION (cardinal magnetism, absolute 15-degree Shift steps, Alt
bypass — the old Shift snapped the delta, so 7-degree items could
never reach upright); sub-1024px backgrounds raise a non-blocking
softness notice. Text became scalable art text (resize scales
fontSize uniformly — previously silently dead) with whole-object
type controls (size/family/bold/italic/color; rich spans explicitly
deferred, never HTML). Shift constrains drawing (squares, circles,
equilateral triangles, 45-degree segments); arrow thickness is
length-clamped form (min(strokeWidth, length/3)) that scales with
resize while lines keep pen weight. Bonus root-cause: the recurring
align "flake" was the IMP-032 eased camera racing synchronous
post-click reads — zoom assertions now poll and revision reads
settle past the camera-persist debounce. Final: 222 engine / 340
persistence / 21 e2e. Owner feel pass pending across batches two,
three, and four.

## Batch five (same day): two arrows, system fonts, dev hardening

An alignment pause (owner) resolved the arrow model: one kind was
straddling two mental models. RFC rev 0.13 + IMP-036/037/038. The
annotation arrow reverted to pure pen semantics (constant weight
under resize, head-from-thickness, clamp kept, proportion constants
exported for tuning); a new 'arrow' ShapeKind renders a block
silhouette that inherits box scaling, rotation, oriented chrome, and
Shift 2:1 canonical drawing from the existing shape machinery — the
owner's "Expanding Worlds — Baseline UI Vision" artifact (added to
RAG/, unpacked from its bundled HTML) anchors §8.2 and already
separates the two tools on its rail. The type row enumerates
installed fonts via Local Font Access (lazy, user-gesture, stack
fallbacks stored with selections; Electron's TS permission union
lags Chromium — compare as strings). Dev mode now serves @ew/* live
(vite optimizeDeps exclusion — validated over CDP: a dist marker
executed after a plain reload) with a predev port preflight; this
closes the stale-prebundle foot-gun that burned three sessions.
Probe lesson recorded: always launch validation instances with an
isolated EW_PROJECT_DIR (the §11.4 lock rejects a second app on the
default project) and clean up by PID, never pkill by pattern.
Final: 226 engine / 340 persistence / 21 e2e (clean run, no
retries). Owner feel pass pending across batches two through five.

## Batch six (same day): legible strokes and render fidelity

Owner refinement generalized IMP-039 mid-cut (RFC rev 0.14): every
stroke is born legible at the creating viewport, and the toolbar
width control became a WEIGHT MULTIPLIER on a screen-pixel baseline
(2px; pen arrows 4px) — stored data stays absolute world units, so
zoom-1 × weight-1 is byte-identical. IMP-040: strokes never RENDER
below one device pixel (the owner's "dotted diagonal" was sub-pixel
rasterization; render-only clamp with a 20% drift gate in the cull
pass, e2e-probed via renderedStroke), and draw previews became
WYSIWYG (shapes preview their fill; the pen arrow previews its true
silhouette). Also diagnosed for the owner: the "lost grid" was a
background set on the long-lived dev project (stage hides the grid
by design) — a stage you can't see reads as a broken canvas, parked
as a chrome-era affordance alongside pre-creation text styling.
Owner signal: canvas layer nearing hand-off point; EPIC-005 (notes)
is next after the current feel items settle. Final: 230 engine /
340 persistence / 22 e2e.

## Phase hand-off

IMP-041/042 completed the Shift vocabulary (draw proportions,
orientation snap, resize aspect lock, axis-constrained move). Owner
called the canvas layer done for this phase — "a good place in
likely the biggest single phase." Next session: EPIC-005 (notes,
links, phantoms) — re-read the epic and RFC §7 before cutting;
EPIC-010 remains the rolling home for hands-on findings. Final
canvas-phase state: 234 engine / 340 persistence / 22 e2e, RFC rev
0.14, IMP-024..042 closed.
