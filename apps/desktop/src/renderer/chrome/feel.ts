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

/** Lifetime of a non-sticky toast before it dissolves (§8.6). */
export const TOAST_DURATION_MS = 6000

/** Length of the perch's single arrival pulse (§8.6). */
export const PERCH_PULSE_MS = 700
