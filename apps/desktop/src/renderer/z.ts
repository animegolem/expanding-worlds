/**
 * The named z-ladder (Style Guide §7, RFC §8.8).
 *
 * Stacking order, low → high: world content → canvas affordances → note
 * panels → takeover → chrome/source panel → anchored popovers → modal →
 * notices → tooltip. The NAMES are normative; a guard (AI-IMP-143) will
 * fail any literal z-index in app code once existing literals are ported
 * to these rungs. Modals mount at the root host; everything anchored
 * clamps via one shared helper; chrome never occludes what it annotates.
 *
 * Landed by AI-IMP-130 as the single source of truth, exported but
 * UNCONSUMED — AI-IMP-143 owns the refactor of existing z-index literals
 * onto these rungs. No existing literal changes here.
 */
export const Z = {
  world: 0,
  affordance: 100,
  panel: 200,
  takeover: 300,
  chrome: 400,
  popover: 500,
  modal: 600,
  notice: 700,
  tooltip: 800,
} as const

export type ZRung = keyof typeof Z
