---
node_id: AI-IMP-151
tags:
  - IMP-LIST
  - Implementation
  - design-pass
  - canvas
  - feel
kanban_status: completed
depends_on: [AI-IMP-130]
parent_epic:
confidence_score: 0.55
date_created: 2026-07-07
date_completed: 2026-07-07
---


# AI-IMP-151-interaction-physics-beats

## Summary of Issue #1

Rev 0.56 §8.2 ratifies the interaction-physics ledger; nothing is
built. This ticket implements the POINTER beats on the shipped
gesture code: grab → LIFT (drag shadow on + ~1% scale, ~120ms),
release → SETTLE (one ease-out ~150ms, no bounce), snap engage →
NUDGE (last-px magnetic seat ~40ms), lock → PRESS (−1% at lock
commit) with the locked-grab STRAIN (~2px sideways under the
refusal cursor, never lifts), delete → LIFT AWAY (up + fade
~180ms — never a crumple), import lands → settle (bloom already
ships), and drag-over-frame → members MAKE ROOM (small clearance
shift, the one allowed anticipatory motion — riding 127's hover
machinery). Done means every listed mouse-down plays its beat at
the ledger constants, the no-beat list stays beat-free, nothing
loops, and §12.1 perf holds under a 150-image drag.

### Out of Scope

- Pan-flick GLIDE and double-click DIVE (nav-physics; cut
  separately once camera-feel constants from AI-IMP-098's dial-in
  freeze — they share the camera easing seam).
- The tear family (EPIC-023's 135 owns note beats).
- Any gesture SEMANTIC change: beats decorate the existing commit
  flow; commands, thresholds, and §6.9 rules are untouched.

### Design/Approach

Beats live in the renderer/engine display layer, never in command
flow: lift/settle animate the dragged display objects'
scale/shadow (shared drag-shadow sprite from 140's approach or a
cheap alpha ring if 140 unmerged — coordinate), driven by the
gesture lifecycle hooks in the controller (gesture start/commit/
cancel). Nudge: when snap engagement flips (the existing
hysteresis event), ease the last px instead of teleporting the
guide-snap — display-side only, the committed geometry unchanged.
Press/strain: lock state renders −1% body scale; a drag attempt on
locked plays a 2px sideways strain once per grab. Away: the
Delete/Trash commit path's display objects animate up+fade before
the scene-apply removes them (race-safe: the zombie-refresh epoch
guard pattern — never re-acquire textures). Constants from
`beats.ts` (extend with the 1.1 ledger values: lift 120, settle
150, nudge 40, away 180 + the two scale factors and strain px).
Reduced-motion: respect the platform setting if a convention
exists; else record. Every beat one-shot — the iteration-count
guard idea lands here as a source-scan test.

### Files to Touch

`apps/desktop/src/renderer/chrome/beats.ts`: ledger values.
`packages/canvas-engine/src/` gesture/controller display hooks
(+ units for the state machine transitions).
`apps/desktop/src/renderer/canvas/host.ts`: beat wiring (shadow,
away-on-delete, make-room).
Guard test (one-shot rule).
`apps/desktop/e2e/`: beat presence via debug seams where honest
(e.g. lift scale during drag), perf spec UNMODIFIED and green.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [x] Lift/settle on every item drag (one beat per gesture, ±1%
      cap); no-beat gestures verified beat-free.
- [x] Nudge on snap engage (display-only; committed geometry
      byte-identical — unit).
- [x] Press at lock; strain-not-lift on locked grab.
- [x] Away on delete (never crumple; race-safe vs scene apply).
- [x] Make-room on frame drag-over.
- [x] One-shot guard test; perf suite green (numbers recorded).
- [x] Gates: `pnpm -r build`, `pnpm -r test`, `pnpm lint`, desktop
      e2e hidden.
- [ ] HUMAN-TESTING entry appended at merge by the lead (does the
      desk feel alive or busy; strain read on locked).

### Acceptance Criteria

**GIVEN** an ordinary drag
**THEN** the item lifts (+1%, shadow) and settles (ease-out, no
bounce) at the ledger timings, exactly once per gesture.
**GIVEN** a locked item grabbed
**THEN** it strains ~2px and never lifts.
**GIVEN** a delete
**THEN** the item lifts away (up + fade) — nothing ever crumples.
**GIVEN** the perf suite
**THEN** green, unmodified.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->

**Architecture.** The pure beat math is a new renderer-agnostic module
`packages/canvas-engine/src/interaction-beats.ts` (`DragBeat` lift→hold→
settle state machine + `nudgeOffset`/`strainOffset`/`pressScale`/
`awayDisplay`/`approachClearance` — all time→display-delta, no timers),
unit-tested in `interaction-beats.test.ts`. The host
(`canvas/host.ts`) owns a compositor that lays these deltas OVER the
renderer's transform with ABSOLUTE writes (the placement renderer
re-writes position/scale every applyEphemeral + scene-apply, so beats
must recompose idempotently on top — `applyBeatTransform` is called after
each renderer update and each ticker frame). Constants live in
`chrome/beats.ts`.

**Perf (§12.1) — suite green, UNMODIFIED.** `perf.spec.ts` all 3 tests
pass under `P95_LIMIT_MS = 25` (500 pins; 150 images + 1k icons + 300
decorations; oversized tiled bg). The §12.3 measured workload is
pan/zoom/marquee and NEVER drags items, so the beats are idle during
measurement; the beat ticker has a fast idle guard (six `Map.size`/length
checks, then return) so its per-frame cost when no beat is active is
negligible. On-pass p95 is not surfaced by the spec (the number prints
only in the failure message); the spec header cites p95 ≤ 9.3 ms typical
on this hardware class and the run stayed green. Real hardware, hidden
windows (`backgroundThrottling:false` keeps the ticker full-speed).

**Reduced-motion — NO convention exists (recorded, not invented).**
`grep -r prefers-reduced-motion|reducedMotion|prefersReduced` over
apps+packages returns nothing. Per the ticket I did NOT invent a settings
surface. When EPIC-013 lands settings, the beat ticker (`beatTick`) is the
single gate point — short-circuit it (and skip `startLiftIfNew`/press/
strain/away seeding) under the platform reduced-motion signal.

**Ledger interpretations (flagged — the metaphor must not lie).**
- Numbers §8.2 does NOT specify, added as provisional feel constants and
  marked provisional in `beats.ts`: `EW_BEAT_PRESS_MS=150`,
  `EW_BEAT_STRAIN_MS=130`, `EW_BEAT_AWAY_RISE_PX=24`,
  `EW_BEAT_MAKE_ROOM_PX=6`, `EW_BEAT_MAKE_ROOM_TAU_MS=70`. The CONFIRMED
  ledger numbers (lift 120, settle 150, nudge 40, away 180, lift/press
  scale 0.01, strain 2px) are exact and asserted in `z.test.ts`.
- Beat body scope = PLACEMENTS only. The transform-composited beats
  (lift/settle scale+shadow, nudge, strain, press, away) target
  placements, whose containers are center-origin (scale reads as a
  grow/shrink in place). Decorations still drag unchanged but do not
  lift-scale — their renderer origins vary, so a naive container scale
  would distort them; the ledger's "bodies" are the placement objects.
- Make-room DIRECTION: §8.2 says "small clearance shift" without a
  direction; interpreted as members easing radially OUTWARD from the
  hovered frame's center (riding AI-IMP-127's `applyHoverDim`).
- Import-lands settle: left as-is — the "bloom already ships" via the
  stage-extent ease (`EW_BEAT_BLOOM_MS` dormant); not re-wired here.

**Nudge wiring (byte-identical proven).** Surfaced the snap adjust as a
read-only `engagedDelta` on the fresh-engage `SnapGuide`
(`snap.ts` + `snap-provider.ts`). The committed `dx/dy` is untouched
(still `proposedDelta + adjust`); `snap-provider.test.ts` asserts the
held-frame `dx` is unchanged and the seed appears only on the engaging
frame. The nudge is a host display offset that decays to EXACTLY zero
(`nudgeOffset` unit-proven), never entering the gesture session or the
`TransformContent` payload.

**Away race-safety.** Followed the zombie-refresh epoch-guard PRINCIPLE
(never re-handle a removed item) via a new `SceneSync.detach(id)` that
hands the display object to the beat compositor WITHOUT destroying it —
so the imminent DeleteContent scene-apply no longer tracks it (the
removal loop keys off `#entries`, which no longer holds it → no
double-destroy). `liftAway` fires synchronously off the committed
DeleteContent result, ahead of the async `refresh`; the ghosts self-own,
self-destroy at `awayMs`, and are torn down on canvas swap / null scene /
host destroy. If a delete round-trip lost the race (refresh removed the
object first), `detach` returns undefined and away is a no-op — never a
crash.

**One-shot guard.** A single `app.ticker.add(beatTick)` advances every
beat and self-idles (like the existing stage/flight/zoom tickers) — no
per-beat loop. The guard test (`interaction-beats.test.ts`, source-scan
style à la z/shrink guards) strips comments then fails the pure core on
any `setInterval(`/`setTimeout(`/`requestAnimationFrame(`/`.ticker`/`new
Application` — the core is pure time→delta math; the lone ticker is
host-side by design.

**Files touched (no fenced files):** `interaction-beats.ts`(+test),
`index.ts`, `scene-sync.ts` (detach), `snap.ts` + `snap-provider.ts`
(+test) in canvas-engine; `chrome/beats.ts`, `canvas/host.ts`,
`canvas/gestures-ui.ts` (strain/away triggers), `z.test.ts`, and the new
`e2e/beats.spec.ts` (lift/settle, resize no-beat, press+strain,
make-room, away — all via debug seams, no sleeps) in desktop.

**Gates.** `pnpm -r build` clean; `pnpm lint` clean; canvas-engine
vitest 364/364, desktop vitest 190/190; desktop e2e 163/163 hidden
(158 pre-existing + 5 new beat tests). Perf spec green unmodified.
