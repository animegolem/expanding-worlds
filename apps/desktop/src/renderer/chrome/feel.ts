/**
 * Chrome feel constants (RFC §8.2 rev 0.17). Provisional numbers, not
 * model state — expressly not settings until the settings takeover
 * ships (EPIC-013), and tuned by hand until then.
 */

/** Idle time with a still cursor before the chrome layer fades. */
export const CHROME_FADE_DELAY_MS = 4000

/** Opacity transition length for the shared fade clock. */
export const CHROME_FADE_MS = 240

/** Rest opacity of chrome controls while engaged; hover lights to 1. */
export const CHROME_REST_OPACITY = 0.92

/** Delay before a control's tooltip chip appears. */
export const TOOLTIP_DELAY_MS = 500

/** Pointer band at the top edge that reveals the title strip. */
export const TITLE_STRIP_REVEAL_PX = 10

/** §8.4: node hint charms hide when the node's rendered screen size
 * drops below this — screen pixels, never zoom percentage. */
export const CHARM_MIN_SCREEN_PX = 48

/** §8.4: hint charms rest as a glanceable census; hover lights the
 * hovered charm alone to full opacity. */
export const HINT_CHARM_REST_OPACITY = 0.7

/** Lifetime of a non-sticky toast before it dissolves (§8.6). */
export const TOAST_DURATION_MS = 6000

/** Length of the perch's single arrival pulse (§8.6). */
export const PERCH_PULSE_MS = 700

// ---- §8.5 rev 0.47: tethered panels scale WITH the world ----
// A TETHERED note panel belongs to its node, so it scales with the
// camera and stays glued to its image at every zoom — instead of a
// full-size card looming over a tiny board when you zoom out. A PINNED
// panel ignores all of this (screen-fixed sticky note on the glass).
// These are hand-tuned feel numbers, not model state (like the rest of
// this module): dial FLOOR/FADE until the fade feels right.

/** Upper bound on the tethered scale: the panel is at most its
 * "full-size" default card (the RFC's own ceiling word). It shrinks
 * below that as you zoom out and never balloons past it when you zoom
 * in — a zoomed-in card that filled the screen would be worse than the
 * bug we are fixing, and capping here keeps the AI-IMP-100 reservation
 * (which reserves the scale-1 footprint) a safe superset at every
 * resulting zoom. */
export const PANEL_TETHER_MAX_SCALE = 1

/** Effective scale at/above which the tethered panel is fully opaque.
 * Below it, type is on its way to unreadable mush, so the panel fades
 * (the §8.4 charm screen-size rule) rather than shrinking into
 * confetti. */
export const PANEL_LEGIBILITY_FLOOR = 0.4

/** Scale span of the fade: opacity ramps 1 → 0 across FADE below the
 * floor, so the panel dissolves smoothly (no pop) and is fully gone by
 * scale = FLOOR − FADE, where its text would be illegible anyway. */
export const PANEL_LEGIBILITY_FADE = 0.2

/** The world-proportional scale a tethered panel renders at for a
 * given camera zoom, capped at the full-size default. */
export function tetheredPanelScale(zoom: number): number {
  return Math.min(PANEL_TETHER_MAX_SCALE, Math.max(0, zoom))
}

/** The legibility-floor opacity for a tethered panel at `scale`: full
 * above the floor, a smooth 1 → 0 ramp across FADE below it, gone at
 * FLOOR − FADE. */
export function tetheredPanelOpacity(scale: number): number {
  const gone = PANEL_LEGIBILITY_FLOOR - PANEL_LEGIBILITY_FADE
  if (scale >= PANEL_LEGIBILITY_FLOOR) return 1
  if (scale <= gone) return 0
  return (scale - gone) / PANEL_LEGIBILITY_FADE
}
