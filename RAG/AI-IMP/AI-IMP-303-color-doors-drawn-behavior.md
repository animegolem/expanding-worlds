---
node_id: AI-IMP-303
tags:
  - IMP-LIST
  - Implementation
  - chrome
  - kit-primitives
  - feel-pass
kanban_status: planned
depends_on:
parent_epic: [[AI-EPIC-030-the-ratified-law-wave]]
confidence_score: 0.75
date_created: 2026-07-16
date_completed:
---

# AI-IMP-303-color-doors-drawn-behavior

## Summary of Issue #1

The feel pass convicted the ColorPicker as a skeleton: every drawn
part present, none of the drawn behavior — no SV thumb, no drag
tracking. The dock promise ledger's driver's-seat pass
(ui-observability-pilot r3, lead-verified) convicted two more
gaps against the kit: there is NO 6-color eyedropper recents menu
(the dock invokes the native sampler directly,
Dock.svelte:493–507), and the full picker renders its 9-recents
grid PLUS a duplicate nested 3-swatch row
(ui/ColorPicker.svelte:26–27). The kit's law (ledger DOCK-ROW-01,
kit UI Kit §178–211/§466–475): the THREE DOORS show exactly
3/6/9 entries from ONE deduped MRU ordering — defaults-row
swatches 3 · eyedropper recents menu 6 · full picker 9 — no
duplicate or partial swatch. Done means: the picker behaves as
drawn (draggable SV thumb + hue slider with live tracking, hex
field round-trip), the 6-door exists, the duplication is gone,
and all three doors read one MRU.

### Out of Scope

Native EyeDropper availability handling (shipped, DOCK-STATE-01
verified inert-with-why); Stepper/PickerList behavior audit beyond
what their shared drag helper requires; theme work.

### Design/Approach

Round-1 review verifies the component inventory (ColorPicker /
SwatchRow / color-picker-state in `renderer/ui/`) and the shipped
MRU (`recentColors`). Approach: pointer-capture drag on the SV
square and hue strip (pure math already exists —
`svFromPoint`/`hueFromPoint`; wire `setPointerCapture` + move/up,
live-update `value` during drag, commit on release per the kit's
commit semantics); remove the nested SwatchRow from the picker
body; add the eyedropper recents surface — press opens the
6-entry menu (kit anatomy, no invented header) while retaining the
native sampling gesture, anchored per one-physics. All three doors slice one
MRU: 3 = defaults row, 6 = eyedropper menu, 9 = picker grid.
No native controls (the guard stays EMPTY).

### Files to Touch

`apps/desktop/src/renderer/ui/ColorPicker.svelte`: thumb, drag,
remove duplicate row.
`apps/desktop/src/renderer/ui/color-picker-state.ts`: drag math
already pure — extend only if review finds gaps.
`apps/desktop/src/renderer/ui/SwatchRow.svelte`: verify 3-slice.
`apps/desktop/src/renderer/chrome/Dock.svelte`: eyedropper door →
6-menu with native-sample header verb.
`apps/desktop/test/**`: unit drag math + e2e three-door census.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and
**think**. Have you validated all aspects are **implemented** and
**tested**?
</CRITICAL_RULE>

- [x] Round-1 review: verify component inventory, MRU shape, and
      the kit's 6-menu anatomy; record corrections here first.
- [x] SV square: draggable thumb with pointer capture; live value
      tracking; keyboard arrows retained as the accepted accessibility extension.
- [x] Hue strip: same drag semantics; hex field round-trips.
- [x] Duplicate 3-row removed from the picker; picker shows the
      9-grid only.
- [x] Eyedropper press opens the 6-entry recents menu (native
      sample retained on the invoking press; no header verb; menu absent only when MRU empty AND
      sampler unavailable — review confirms kit's empty state).
- [x] All three doors provably slice ONE deduped MRU (unit).
- [x] e2e: seed ≥12 colors → open each door → census 3/6/9, same
      ordering, no duplicates (DOCK-ROW-01 recipe).
- [x] Evidence bundle: per-door screenshots keyed to DOCK-ROW-01 +
      picker drag mid-gesture.

### Acceptance Criteria

**Scenario:** An artist drags across the SV square.
**GIVEN** the full picker is open.
**WHEN** pointer-down lands on the SV square and moves.
**THEN** the thumb tracks the pointer continuously and the
preview updates live.
**AND** release commits once (one undoable value change).

**Scenario:** Three doors, one MRU.
**GIVEN** a deduped MRU with 12+ colors.
**WHEN** the defaults row, the eyedropper menu, and the picker
are each opened.
**THEN** they show exactly 3, 6, and 9 entries respectively, in
the same order, with no duplicate or partial swatch.

### Issues Encountered

<!--
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->

#### Round-1 source verification (2026-07-16)

- The component defects and MRU counts are source-convicted. `ColorPicker`
  has pointerdown-only SV/hue handlers, renders no thumbs, shows the 9-grid,
  then nests a second 3-swatch `SwatchRow`
  (`renderer/ui/ColorPicker.svelte:13-27`). The existing pure helpers already
  clamp SV/hue and the MRU dedupes/caps at 12
  (`renderer/ui/color-picker-state.ts:34-45`); `SwatchRow` is the correct
  3-window (`renderer/ui/SwatchRow.svelte:24-31`). Dock invokes the native
  EyeDropper directly and has no 6-window
  (`renderer/chrome/Dock.svelte:227-235,493-508`).
- The proposed eyedropper header verb is not in the kit. The exact kit menu
  is six swatches only (`Home Canvas UI Kit.dc.html:178-187`); pressing the
  eyedropper toggles/arms sampling and opens that menu
  (`Home Canvas UI Kit.dc.html:681-697`). **Ruling requested:** follow that
  exact anatomy (six swatches, no invented header), with the existing native
  sampler remaining the armed sampling implementation and the shipped
  unavailable-with-why state preserved.
- “Drag/keyboard per kit” overstates the artifact. The kit draws both thumbs
  but its reference script handles click coordinates only
  (`Home Canvas UI Kit.dc.html:189-200,639-650`); it contains no arrow-key
  contract. The ticket/feel-pass can independently require pointer-capture
  drag, but keyboard stepping needs an explicit ruling rather than being
  attributed to the kit. **Ruling requested:** either add arrow stepping as
  an accessibility requirement or remove that checklist clause from this
  kit-adoption wave.
- Commit semantics also need separation. `ColorPicker` currently calls
  `oncommit` for every pick (`renderer/ui/ColorPicker.svelte:13-16`), and its
  Restyle consumer turns every callback into a durable restyle patch
  (`renderer/canvas/RestylePanel.svelte:34-37,59-61`). Calling that callback
  on every pointermove would create many undoable changes. Focused repair:
  drag updates the component's draft/thumb/hex preview continuously and calls
  `oncommit` exactly once on release; if “preview” means mutating the canvas
  live, a separate ephemeral `onpreview` contract must be explicitly
  authorized rather than smuggled through the durable command callback.
- The one-MRU claim is true inside Dock: one session-local `recentColors`
  array feeds both defaults rows and picker
  (`renderer/chrome/Dock.svelte:90-110,207-218,367-390`). The new 6-menu must
  consume that same array and
  the e2e must census a seeded 12-entry queue through the public surface.

#### Implementation and validation (2026-07-16)

- The review's MRU statement hid a second cap: the shared `recentColors`
  helper defaulted to 12, but Dock's actual `rememberToolColor` seam truncated
  the queue to 9. It now retains 12, and `recentColorWindows` is the single
  normalization/deduplication boundary exposing the kit's 3/6/9 windows
  (`renderer/canvas/tool-defaults.ts:16-19`,
  `renderer/ui/color-picker-state.ts:40-57`).
- Pointer capture now keeps SV/hue movement component-local and commits only
  on release; pointer cancellation restores the durable value. Arrow keys are
  retained as the accepted accessibility extension, and hex input normalizes
  on Enter/blur (`renderer/ui/ColorPicker.svelte:61-183,243-267`). The desktop
  regression asserts revision stability during movement and exactly one
  revision on release (`e2e/color-doors.spec.ts:48-88`).
- The six-swatch surface is the kit anatomy exactly: no header. Its invoking
  press still starts native sampling when available; when unavailable it
  remains an honest recent-color door with a reason-bearing tooltip, and is
  disabled only when neither operation is possible
  (`renderer/chrome/Dock.svelte:252-272,596-616,700-734`).
- Two evidence-driven integration defects were not in the ticket. First,
  `ColorPicker` inherited `pointer-events:none` from `.dock-stack`, so its close
  click fell through to the board. Second, a fixed-position picker nested under
  the transformed stack used that stack as its containing block and appeared
  detached at the lower-right. The picker now owns pointer events and renders
  alongside the stack, using the shared anchored-placement physics and a
  measured tail (`renderer/ui/ColorPicker.svelte:43-59,197-207,272-275`,
  `renderer/chrome/Dock.svelte:650-659`).
- Validation: `pnpm -r build` passed; focused Vitest passed 12/12; focused
  hidden-window Playwright passed 2/2. The e2e seeds 12 colors exclusively
  through the public hex field and proves exact ordered, unique 3/6/9 windows
  (`e2e/color-doors.spec.ts:90-119`).
- Evidence manifest for DOCK-ROW-01: `law-wave-303-defaults-three.png`,
  `law-wave-303-eyedropper-six.png`, and
  `law-wave-303-picker-nine-final.png`. The promise passes. The local-draft /
  one-release-commit behavior is covered by `law-wave-303-picker-mid-drag.png`
  plus the revision regression, but is classified **missing promise** because
  the draft dock ledger has no card for picker interaction semantics.
