/**
 * The shrink ladder (RFC §8.2, rev 0.55 — one grammar for zoom).
 *
 * World content shrinks HONESTLY (never clamped); chrome holds screen
 * size; FURNITURE — hint charms, frame titles, sort chips — exists only
 * ABOVE a shared rendered-size threshold. The whole ladder is governed
 * by exactly TWO constants, and "any rendered-size conditional not
 * referencing them is a review failure" (§8.2): one zoom gesture reveals
 * all furniture together, the way one clock fades all chrome together.
 *
 * This module is the single home for those two constants and the two
 * tiny predicates that read them. Callers MUST express every
 * rendered-size gate through here rather than forking a local magic
 * number; the AI-IMP-133 guard (`shrink-ladder-guard.test.ts`) fails a
 * drive-by literal size gate in the renderer or engine sources.
 */

/**
 * The FURNITURE floor (px, rendered screen size). Below it, object
 * icons degrade to the plain dot and furniture vanishes. ~8 px is
 * "just barely a mark": furniture that small carries no legible
 * information, so it earns its place only above the line (§8.2).
 */
export const EW_FURNITURE_MIN_PX = 8

/**
 * The PAGE floor (px, rendered screen size). At/above it the bound
 * page renders its full rings; below it the rings degrade to a bare
 * stroke, and below the FURNITURE floor the page fades whole — the
 * §8.2 ring → stroke → fade grammar (page consumers arrive with
 * EPIC-023; this module defines the contract now). ~48 px is the
 * legibility floor a bound page's affordances need to still read.
 */
export const EW_PAGE_FLOOR_PX = 48

/**
 * Is furniture visible at this rendered screen size? Furniture (hint
 * charms, frame titles, sort chips) exists ONLY above the shared
 * FURNITURE floor. The boundary is inclusive of the floor: at exactly
 * EW_FURNITURE_MIN_PX the furniture is still shown.
 */
export function isFurnitureVisible(renderedPx: number): boolean {
  return renderedPx >= EW_FURNITURE_MIN_PX
}

/** The three legibility stages of the bound page (§8.2 ring → stroke →
 * fade), keyed on rendered screen size. */
export type PageDegradeStage = 'full' | 'degraded' | 'hidden'

/**
 * The bound page's degrade stage at a given rendered screen size:
 *  - `full`     (≥ EW_PAGE_FLOOR_PX): the page renders its full rings.
 *  - `degraded` ([EW_FURNITURE_MIN_PX, EW_PAGE_FLOOR_PX)): rings
 *    collapse to a bare stroke.
 *  - `hidden`   (< EW_FURNITURE_MIN_PX): the page fades whole.
 *
 * The two constants are the only two boundaries, so the page and the
 * furniture reveal together on one zoom gesture (§8.2).
 */
export function pageDegradeStage(renderedPx: number): PageDegradeStage {
  if (renderedPx >= EW_PAGE_FLOOR_PX) return 'full'
  if (renderedPx >= EW_FURNITURE_MIN_PX) return 'degraded'
  return 'hidden'
}
