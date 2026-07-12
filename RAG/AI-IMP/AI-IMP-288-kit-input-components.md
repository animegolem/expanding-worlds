---
node_id: AI-IMP-288
tags:
  - IMP-LIST
  - Implementation
  - ui-components
  - design-adoption
kanban_status: completed
depends_on: []
parent_epic: [[AI-EPIC-029-the-kit-adoption-push]]
confidence_score: 0.85
date_created: 2026-07-12
date_completed: 2026-07-12
---

# AI-IMP-288-kit-input-components

## Summary of Issue #1

Retiring the renderer's native controls (11 in the dock alone, plus
the board menu's color input; settings has no prohibited natives) needs kit
components that don't exist yet in `renderer/ui/`. The kit push
drew them: the COLOR PICKER (anchored popover with pointer tail —
SV square, hue bar, hex entry, last-12 grid), the SWATCH ROW
(last-3 + picker block), the PICKER-LIST (curated entries first,
long tail on demand — the font picker's shape), and the STEPPER
(number entry). All wear one-voice geometry: 5px radius, uniform
2px focus ring, disabled .4. Done means: four components + tests in
ui/, an extended no-native guard, and NO call-site migration yet
(consumers migrate in B/C/D tickets).

### Out of Scope

- Migrating the dock/board-menu/settings call sites (AI-IMP-289,
  292, 300).
- The eyedropper tool (AI-IMP-289) — the picker only hosts its
  affordance slot.
- New color model work: reuse the appearance charm's swatch
  popover conventions where they exist.

### Design/Approach

Follow `renderer/ui/`'s existing component conventions (Button
et al. per kit 1.2). ColorPicker composes SwatchRow + the anchored
popover (uses anchored-placement; pointer tail per the kit's
one-physics rule). PickerList virtualizes only if the existing
system-fonts lazy-load pattern demands it — reuse
`canvas/system-fonts.ts` for the font case's data, but the
component itself is data-agnostic (items + groups in, selection
out). Stepper is a styled input with ± affordances at 44px touch
targets under the density token. Guard: extend the existing
kit-geometry/no-native guard test (round-1 locates it — kit 1.2
notes a guard allowlist meant to shrink to zero) so `select`,
`input[type=color]`, `input[type=number]`, and `datalist` in
renderer chrome fail CI outside an explicit allowlist that this
epic drains.

### Files to Touch

`apps/desktop/src/renderer/ui/ColorPicker.svelte`: new + tests.
`apps/desktop/src/renderer/ui/SwatchRow.svelte`: new + tests.
`apps/desktop/src/renderer/ui/PickerList.svelte`: new + tests.
`apps/desktop/src/renderer/ui/Stepper.svelte`: new + tests.
Guard test location (round-1 finds the kit-geometry guard; extend
  or add `no-native-inputs.test.ts`).

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [x] Round-1: verify ui/ conventions, the existing guard's shape
      and allowlist, and the appearance-charm swatch popover
      precedent; record findings here.
- [x] ColorPicker: SV square + hue bar + hex + last-12 grid,
      anchored with pointer tail, esc/✕/click-away exits, focus
      ring; unit tests (hex round-trip, recent-colors ring buffer,
      keyboard reachability).
- [x] SwatchRow: last-3 + picker block opener; tests.
- [x] PickerList: grouped items, curated-first + on-demand long
      tail, keyboard nav, type-to-filter; tests with a fake data
      source (font wiring lands in 289).
- [x] Stepper: min/max/step, wheel + arrows, 44px targets at
      comfortable density; tests.
- [x] No-native guard extended; current natives enter the explicit
      allowlist with their retiring ticket numbers.
- [x] Full local gate green with counts read.

### Acceptance Criteria

**Scenario:** a consumer opens the color picker.
**GIVEN** a control anchored at the dock band
**WHEN** the picker opens and the user picks via SV square, then
types a hex value
**THEN** both routes produce the same committed color and the
last-12 grid records it once
**AND** esc, ✕, and click-away all close it with the anchor
restored focus
**AND** the guard test fails a PR that adds `<select>` to chrome
outside the allowlist.

### Issues Encountered

#### Round-1 source verification (2026-07-12)

- `renderer/ui/` has Button, TextInput, and FindingState conventions but
  no Svelte component-render harness. This wave therefore tests pure
  behavior/state helpers plus source contracts and does not add a new
  render dependency.
- There is no existing no-native-input guard. Add a filesystem scanner
  with an exact file + type + testid allowlist so a new native control in
  an already allowed file still fails.
- The current prohibited-native inventory is 12: Dock has 6 color, 4
  number, and 1 select control (AI-IMP-289); TitleStrip has 1 color
  control (AI-IMP-292). Settings contains range controls but none of the
  prohibited select/color/number/datalist set.
- Appearance-charm swatches are the visual/behavioral precedent. The
  four components remain unadopted primitives in this ticket; call-site
  migration belongs to the named follow-ups.
