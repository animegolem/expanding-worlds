/**
 * Selection model (§13.1): a set of content-plane item ids. Click
 * replaces, shift-click toggles, marquee replaces (or unions with
 * shift), empty click clears.
 */
export class Selection {
  #ids = new Set<string>()
  #changed = new Set<(ids: string[]) => void>()

  ids(): string[] {
    return [...this.#ids]
  }

  has(id: string): boolean {
    return this.#ids.has(id)
  }

  get size(): number {
    return this.#ids.size
  }

  click(id: string, opts: { shift?: boolean } = {}): void {
    if (opts.shift) {
      if (this.#ids.has(id)) this.#ids.delete(id)
      else this.#ids.add(id)
    } else {
      this.#ids.clear()
      this.#ids.add(id)
    }
    this.#notify()
  }

  marquee(ids: readonly string[], opts: { shift?: boolean } = {}): void {
    if (!opts.shift) this.#ids.clear()
    for (const id of ids) this.#ids.add(id)
    this.#notify()
  }

  /** Replace wholesale (e.g. group expansion, AI-IMP-021). */
  set(ids: readonly string[]): void {
    this.#ids = new Set(ids)
    this.#notify()
  }

  clear(): void {
    if (this.#ids.size === 0) return
    this.#ids.clear()
    this.#notify()
  }

  onChanged(listener: (ids: string[]) => void): () => void {
    this.#changed.add(listener)
    return () => this.#changed.delete(listener)
  }

  #notify(): void {
    const ids = this.ids()
    for (const listener of this.#changed) listener(ids)
  }
}
