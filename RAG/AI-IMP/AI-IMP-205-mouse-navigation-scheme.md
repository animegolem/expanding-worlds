---
node_id: AI-IMP-205
tags:
  - IMP-LIST
  - Implementation
  - canvas
  - input
  - feel
kanban_status: completed
depends_on: []
parent_epic:
confidence_score: 0.7
date_created: 2026-07-08
date_completed: 2026-07-08
---


# AI-IMP-205-mouse-navigation-scheme

## Summary of Issue #1

Alph field report (2026-07-08, Discord — "this is a big thing
imo"): on a MOUSE he expects **hold middle button to pan** and
**plain scroll wheel to zoom**. Neither exists: middle-drag does
nothing, and plain wheel PANS (correct for trackpad two-finger
scroll, which arrives as the same wheel events — the owner built
on a trackpad, "that's on me"). The two devices are
indistinguishable at the event level in Chromium, so this is the
classic Figma/Miro input-scheme problem. Done means: (1)
middle-button drag pans, unconditionally — it collides with
nothing on any device; (2) a **navigation scheme setting**
(trackpad / mouse) governs plain wheel: trackpad scheme keeps
wheel=pan (today's behavior, default), mouse scheme makes
wheel=zoom-at-cursor via the existing chase path; pinch
(ctrl-wheel) and Cmd+wheel zoom in BOTH schemes. Alph on a Windows
mouse flips one setting and gets the PureRef-style scheme he
expects.

### Out of Scope

- Auto-detecting the device per-event (deltaMode/notch heuristics
  are unreliable; a deliberate setting is honest — note any cheap
  "suggest the switch" heuristic as a future line, don't build).
- Wheel-over-panel rules (AI-IMP-201 — but its rule table gains a
  scheme column; coordinate, same wave or sequenced).
- Zoom feel constants (AI-IMP-206 dial).

### Design/Approach

Middle-drag pan: pointerdown with `button === 1` on the canvas
starts a pan gesture (same camera path as space-drag/two-finger
pan), capture the pointer, suppress the default auxclick/autoscroll
behavior, cursor to grabbing. Check the gestures-ui capture-phase
pointerdown seam and the pre-render pointerdown watcher (AI-IMP-184)
for interactions. Scheme setting: a `navigation.scheme` value in
the settings store (`'trackpad' | 'mouse'`, default trackpad),
surfaced in the settings surface next to zoom behavior; onWheel
consults it — mouse scheme routes plain wheel into the zoom chase
(reusing Cmd+wheel's path and speed), trackpad scheme unchanged.
Settings-broadcast refresh per AI-IMP-177's idiom. RFC: §8/§3
input grammar gains the scheme table; keep §5/§18 consistent.

### Files to Touch

`canvas/host.ts` (onWheel scheme branch, middle-drag pan),
`canvas/gestures-ui.ts` if the pointer seam lives there, settings
store + settings UI row, RFC input-grammar section. E2e: middle-drag
pans in both schemes; wheel zooms in mouse scheme / pans in
trackpad scheme; pinch zooms in both.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [x] Middle-button drag pans; no autoscroll/auxclick leakage.
- [x] Scheme setting exists, persists, defaults to trackpad;
      wheel obeys it; pinch/Cmd+wheel zoom in both schemes.
- [x] RFC input grammar updated; 201's rule table cross-checked.
      (Lead, at merge: §6.9 camera-input gains the scheme × gesture
      table, open question 18 resolved, §20 summary updated, rev
      0.67. 201 note: its wheel-over-panel rule table gains a
      scheme column — recorded in that ticket's wave brief.)
- [x] Gates: `pnpm -r build && pnpm -r test && pnpm lint` + hidden
      e2e. (build ✓, test ✓ full suite 216 passed, lint ✓, e2e ✓
      four foreground shards 41/59/66/49 + 1 perf-flaky-on-retry.)
- [x] HUMAN-TESTING entry appended at merge by the lead (alph
      first pass — it's his scheme).

### Acceptance Criteria

**GIVEN** the mouse scheme selected
**WHEN** the user rolls the wheel over the board
**THEN** the board zooms at the cursor — and holding the middle
button and dragging pans, in either scheme, on any device.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->

**Middle-drag was already wired at the engine layer.** Both
`ToolManager.pointerDown` (`pan = modifiers.space || modifiers.button
=== 1`) and `CanvasController.pointerDown` (`if (modifiers.space ||
modifiers.button === 1)` → `'panning'`) already route button 1 into the
same camera pan as space-drag, and host's `modifiers()` already forwards
`event.button`. So the pan itself needed NO new gesture wiring — the
`grabbing` cursor already falls out of `cursorFor`'s `panning` case. The
ONLY thing breaking it in practice is Chromium's native middle-click
autoscroll, which captures the pointer so the app never sees the
pointermove. Fix is one line: `if (event.button === 1)
event.preventDefault()` in `onPointerDown` (preventDefault on pointerdown
also suppresses the compatibility mousedown that arms the autoscroll),
plus a belt-and-suspenders `auxclick` preventDefault. The e2e drives a
REAL Playwright middle drag (`mouse.down({ button: 'middle' })`), so the
suppression is genuinely exercised, not stubbed.

**Seam interactions checked (per brief):** (1) gestures-ui's
capture-phase `onPointerDownCapture` returns early on `event.button !==
0`, so middle-button never reaches the zone/marquee path — no conflict.
(2) The AI-IMP-184 "pre-render pointerdown watcher" is
`ContextMenu.ts`'s `onPreRenderPointer` — it only sets a `clickedAway`
flag (no preventDefault/stopPropagation), so a middle press during a
frame-menu await merely cancels that menu paint (as any pointerdown
would); it does not touch the pan.

**Scheme setting.** `navigationScheme: 'trackpad' | 'mouse'` (default
trackpad) added to the renderer settings store — interface, defaults,
and per-key `sanitize` guard — reusing the existing app-tier
persistence path (main's app-settings.json is schema-less key/value, so
NO main-side change was needed). `onWheel` reads `appSettings()
.navigationScheme` LIVE at event time: mouse scheme routes the plain
wheel into the exact same `zoomChase.zoomBy(local(event), exp(-dy *
wheelZoomSpeed))` path Cmd+wheel uses (same path, same speed). Because
the read is live, there is no cached copy to invalidate, so no
AI-IMP-177 settings-broadcast subscription is required (documented in a
code comment). Pinch (`ctrlKey`) and Cmd+wheel (`metaKey`) branch first
and zoom in BOTH schemes, unchanged.

**Settings UI.** A "Navigation" segmented row (Trackpad/Mouse) plus an
explanatory note added to the Behavior section of SettingsView, using
the existing `segmented` snippet — commit-on-click, no new styles.

**RFC not edited (deliberate, per brief).** The exact input-grammar
rows are handed to the lead in the agent report.

**Out-of-scope finding (reported, not fixed):** the `deltaMode`
line/page normalization in `onWheel` uses `event.deltaX/deltaY * unit`
but the mouse-scheme zoom uses only `dy`; a discrete mouse wheel reports
`deltaMode === 1` (lines) so a single notch is `dy = ±16 * 3` on many
Windows mice — the zoom-per-notch will feel different from a trackpad
pixel wheel. This is exactly what the AI-IMP-206 feel-dial exists to
tune, so no constant is guessed here; flagged for the tuning session.

**Validation:** `pnpm -r build` ✓, `pnpm -r test` ✓ (full suite, 216
passed), `pnpm lint` ✓, hidden-window e2e ✓ in four foreground shards
(41 / 59 / 66 / 49; perf.spec flaky-then-green on retry, unrelated).
New spec `e2e/navigation-scheme.spec.ts` (middle-drag pan; trackpad-pan
vs mouse-zoom; pinch/Cmd zoom in both) — 2 tests, green.
