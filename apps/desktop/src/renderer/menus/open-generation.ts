/**
 * Monotonic open-generation gate for the context menu (AI-IMP-155).
 *
 * The frame menu's open awaits an async settings read
 * (`frameSortOnDrop`) before it can render. If a newer menu opens — or
 * the menu closes — during that await, the resolved frame open is STALE
 * and must not paint over the newer surface. Every render and every
 * close advances the generation; an async open captures the generation
 * with {@link OpenGeneration.current} before awaiting and, after
 * resolution, bails when {@link OpenGeneration.isStale} reports a bump
 * happened underneath it.
 *
 * Extracted from ContextMenu.ts so the staleness logic is unit-testable
 * without a DOM.
 */
export interface OpenGeneration {
  /** Advance the generation. Called on every render and every close. */
  bump(): void
  /** The current generation — capture this BEFORE an await. */
  current(): number
  /** True if a bump happened since `captured`; the caller is stale. */
  isStale(captured: number): boolean
}

export function createOpenGeneration(): OpenGeneration {
  let gen = 0
  return {
    bump() {
      gen++
    },
    current() {
      return gen
    },
    isStale(captured) {
      return captured !== gen
    },
  }
}
