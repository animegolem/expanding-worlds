---
node_id: AI-IMP-206
tags:
  - IMP-LIST
  - Implementation
  - canvas
  - feel
  - devtool
kanban_status: planned
depends_on: []
parent_epic:
confidence_score: 0.8
date_created: 2026-07-08
---


# AI-IMP-206-live-feel-dial

## Summary of Issue #1

Alph field report (2026-07-08): canvas interaction has "a tad bit
much 'weight'" — zoom feels heavy. The owner's ask: "wire us a
live temp tool to adjust the scaling factor real time" so he and
alph can dial the feel over Discord instead of describing it in
words. Half exists already: `host.zoomTuning({tau, wheelSpeed,
pinchSpeed})` (AI-IMP-098) live-adjusts the zoom chase at runtime
— but only from a devtools console, unusable for alph. Done means
a **dev feel-dial panel** in the app: a hidden toggle (dev menu
item and/or keyboard chord) opens a small floating panel of
sliders bound to the live tunables — zoom tau, wheel speed, pinch
speed, plus whichever pan/glide friction constants the audit of
host.ts turns up as feel-relevant — with live numeric readouts, a
"copy values" button (so alph can paste results into Discord), and
a reset-to-shipped-defaults. Values are session-only; shipping new
defaults stays a code change made from the pasted numbers.

### Out of Scope

- Changing any shipped constant (that's the OUTPUT of the tuning
  session, its own one-line change).
- Persisting dial values across restarts.
- Beat-timing dials (AI-IMP-202 may want the same idiom later —
  build the panel so adding a slider is one registration line).

### Design/Approach

Inventory host.ts for live-adjustable feel scalars (zoomTuning's
three, pan glide/friction if present, anything the chase exposes).
Panel: a small always-on-top DOM overlay (not canvas-rendered),
kit-styled but explicitly dev furniture, draggable, one slider row
per tunable with min/max chosen around the shipped value (~×0.25
to ×4 log range), live apply on input via the existing host hooks
(add sibling hooks only where a scalar is currently module-local).
Toggle: Develop/dev menu entry + chord; hidden in normal use, but
PRESENT in release builds (alph tunes on his Windows build — that
is the entire point). "Copy values" writes a compact JSON blob to
the clipboard.

### Files to Touch

`canvas/host.ts` (expose any un-exposed scalars via the zoomTuning
pattern), a new small `dev/feel-dial.ts|svelte` overlay, menu
wiring for the toggle. E2e: open panel, move a slider, assert the
host tunable changed; copy-values produces parseable JSON.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [x] Tunable inventory documented in Issues Encountered (what's
      exposed, what was newly seamed).
- [x] Panel opens via menu/chord in a release-style build; sliders
      live-apply; readouts, copy-values, reset all work.
- [x] Gates: `pnpm -r build && pnpm -r test && pnpm lint` + hidden
      e2e. (build ✓, test ✓ 216 passed, lint ✓, e2e ✓ four foreground
      shards.)
- [ ] HUMAN-TESTING entry appended at merge by the lead (this one
      IS the testing tool — include the open chord ⌥⇧⌘F /
      Ctrl+Shift+Alt+F in the entry).

### Acceptance Criteria

**GIVEN** the feel-dial panel open on a running board
**WHEN** the user drags the zoom-tau slider
**THEN** the very next pinch/wheel zoom reflects the new value —
and "copy values" yields the full current set for pasting back to
the team.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->

**Tunable inventory (the audit).** host.ts's live-adjustable feel
scalars, all on the zoom chase, all already exposed by the AI-IMP-098
`zoomTuning` hook (nothing new had to be seamed):

| tunable | host.ts source | shipped default | meaning |
|---|---|---|---|
| `tau` | `zoomChase.tau` ← `ZOOM_CHASE_TAU_MS` (engine) | 70 ms | zoom-ease time constant (the "weight" alph felt) |
| `wheelSpeed` | `let wheelZoomSpeed` | 0.0015 | Cmd+wheel AND mouse-scheme plain-wheel zoom rate |
| `pinchSpeed` | `let pinchZoomSpeed` | 0.01 | ctrl-flagged pinch zoom rate |

Scalars deliberately NOT exposed, with reasons:
- **Plain pan** — `controller.camera.panByScreen(-dx, -dy)` is a 1:1
  passthrough with NO scalar (Apple's deltas are the tuned curve). There
  is no pan glide/friction/inertia anywhere in the engine or host to
  dial, so nothing to seam. (The ticket's "pan glide/friction etc." has
  no counterpart in the current code.)
- **CameraFlight `FLIGHT_DURATION_MS` (250 ms)** — the fit/frame flight
  duration. A real feel scalar, but a distinct interaction (framing
  jumps, not the wheel/pinch weight alph reported), it lives on the
  `CameraFlight` engine object with no host-local `let`, and exposing it
  would be scope creep on a bug report about zoom weight. Left as a
  future one-line registration (the panel supports it).
- `ZOOM_CHASE_HEADSTART_MS`, `ZOOM_CHASE_SNAP_LOG_EPSILON` — correctness
  constants (first-frame latency, bit-exact rest), not feel dials.

So the exposed set is the `zoomTuning` trio; the ONLY new host seam is
`__ewDebug.zoomTuningDefaults()`, which returns the shipped values
snapshotted at mount (before any dial) so **reset** restores CODE
values, never a prior session's numbers.

**The panel.** New `renderer/dev/feel-dial.ts` — a plain-DOM (NOT
canvas-rendered) draggable overlay, kit-styled from theme tokens (no raw
hex; no `<datalist>`), mounted once from `App.svelte`'s `onMount`
(disposer returned). It talks to the host ONLY through the window
`__ewDebug` hooks, so it holds no host reference and can't break its
build. It is registration-driven: `const TUNABLES: Tunable[]` — adding a
slider is one row. Each slider is LOG-scaled ×0.25–×4 around its shipped
value with a live numeric + ×factor readout, live-apply on `input`.
"Copy values" writes compact JSON of the current set to the clipboard
(and exposes the same string via `__ewFeelDial.serialize()` for e2e,
since headless clipboard reads are unreliable). Reset writes
`zoomTuning(defaults)`. Session-only, no persistence.

**Present in release builds by design.** `window.__ewDebug` is set
unconditionally in `mountCanvasHost` (not dev-gated), and the feel-dial
mounts from `App.svelte` in every build — so alph's Windows release
build carries it, hidden until the chord.

**Open chord: ⌥⇧⌘F (macOS) / Ctrl+Shift+Alt+F (Windows/Linux).**
Matched by `code: 'KeyF'` (not `key`) because macOS ⌥F emits a dead-key
glyph; `Mod` = ⌘-or-Ctrl via the shared `matchesCombo`. DELIBERATELY not
declared in `keys/bindings.ts` — dev furniture must stay out of the
Settings › Keyboard map an artist reads — so it uses a private window
keydown listener. z-index rides `Z.tooltip` from the named ladder (the
z-guard forbids literals; referenced, not hard-coded).

**No menu entry added.** The app currently has NO application/dev menu
wiring in main (`grep` for `Menu` in `src/main` is empty; the ☰ charm
rail is the only menu surface and it is user-facing). Adding a dev entry
there would surface the tool to artists — against the "hidden in normal
use" intent — so the toggle is the keyboard chord only, as the ticket
allows ("menu entry AND/OR chord"). If a Develop menu is ever wired,
`window.__ewFeelDial.toggle()` is the one-line hook.

**Validation:** `pnpm -r build` ✓, `pnpm -r test` ✓ (216 passed),
`pnpm lint` ✓, hidden-window e2e ✓ (four foreground shards). New spec
`e2e/feel-dial.spec.ts`: chord opens the overlay, τ slider live-applies
to `__ewDebug.zoomTuning().tau` (×4 at the top of range), copy-values
serializes to parseable JSON, reset restores the shipped default, chord
toggles closed — 1 test, green.
