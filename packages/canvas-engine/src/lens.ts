/**
 * Lens view state (§4.8 tag lens / §7.5 highlight mode — one shared
 * implementation): dim-to-hits. A lens is a VIEW STATE, not a
 * selection and not scene data — it dims every placement outside the
 * match set to a fraction of full strength WITHOUT hiding anything,
 * keeps members at full color plus an accent ring, and survives pan,
 * zoom, and scene reapplication. It drops on Escape (before selection
 * — see CanvasController.escape) or an explicit clear; clicking
 * neutral canvas space does NOT drop it in Phase 1.
 */

/** Draw-time alpha multiplier for items outside the lens set. */
export const LENS_DIM_ALPHA = 0.25
/** Accent treatment for members — deliberately NOT the selection
 * blue: the ring marks "matches your lens", not "selected". */
export const LENS_RING_COLOR = 0xf0b429
export const LENS_RING_WIDTH_PX = 2
/** Screen-px breathing room outside the item AABB (selection sits at
 * 2; the lens ring rides outside it so both can show at once). */
export const LENS_RING_OFFSET_PX = 5

export class Lens {
  #ids: ReadonlySet<string> | null = null
  #changed = new Set<(ids: readonly string[] | null) => void>()

  /** True while a lens is applied (even mid pan/zoom/edit). */
  get active(): boolean {
    return this.#ids !== null
  }

  /** Member ids, or null when no lens is applied. */
  ids(): string[] | null {
    return this.#ids ? [...this.#ids] : null
  }

  has(id: string): boolean {
    return this.#ids?.has(id) ?? false
  }

  /** Apply a lens. An empty set is meaningless (§4.8: the lens exists
   * to keep SOME placements at full strength) and clears instead. */
  set(ids: readonly string[]): void {
    if (ids.length === 0) {
      this.clear()
      return
    }
    this.#ids = new Set(ids)
    this.#notify()
  }

  clear(): void {
    if (this.#ids === null) return
    this.#ids = null
    this.#notify()
  }

  /** Scene reapply hook: keep only members that survived the new
   * scene. An unchanged intersection stays silent (pan/zoom and
   * unrelated edits must not churn listeners); an empty one clears —
   * a lens with zero matches is indistinguishable from a dead board.
   */
  intersect(liveIds: ReadonlySet<string>): void {
    if (this.#ids === null) return
    const kept = new Set([...this.#ids].filter((id) => liveIds.has(id)))
    if (kept.size === this.#ids.size) return
    this.#ids = kept.size > 0 ? kept : null
    this.#notify()
  }

  onChanged(listener: (ids: readonly string[] | null) => void): () => void {
    this.#changed.add(listener)
    return () => this.#changed.delete(listener)
  }

  #notify(): void {
    const ids = this.ids()
    for (const listener of this.#changed) listener(ids)
  }
}

/** Draw-time alpha for an item under the given lens: members (and
 * everything, when no lens is applied) render at full strength;
 * non-members dim uniformly — images, pins, and decorations alike
 * (alpha multiplies down the item's display container). */
export function lensAlpha(lens: Lens, id: string): number {
  return lens.active && !lens.has(id) ? LENS_DIM_ALPHA : 1
}
