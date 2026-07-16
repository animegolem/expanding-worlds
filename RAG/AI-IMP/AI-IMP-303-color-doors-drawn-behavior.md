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
6-entry menu (kit anatomy) with the native-sample verb as its
header row, anchored per one-physics. All three doors slice one
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

- [ ] Round-1 review: verify component inventory, MRU shape, and
      the kit's 6-menu anatomy; record corrections here first.
- [ ] SV square: draggable thumb with pointer capture; live value
      tracking; keyboard arrows step per kit.
- [ ] Hue strip: same drag semantics; hex field round-trips.
- [ ] Duplicate 3-row removed from the picker; picker shows the
      9-grid only.
- [ ] Eyedropper press opens the 6-entry recents menu (native
      sample = header verb; menu absent only when MRU empty AND
      sampler unavailable — review confirms kit's empty state).
- [ ] All three doors provably slice ONE deduped MRU (unit).
- [ ] e2e: seed ≥12 colors → open each door → census 3/6/9, same
      ordering, no duplicates (DOCK-ROW-01 recipe).
- [ ] Evidence bundle: per-door screenshots keyed to DOCK-ROW-01 +
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
