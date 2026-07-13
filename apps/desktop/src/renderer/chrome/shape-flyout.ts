/** Interaction state for the dock's one-slot shape family (AI-IMP-290). */
export type ShapeToolKind = 'rect' | 'ellipse' | 'triangle' | 'diamond' | 'shape-arrow'

export interface ShapeOption {
  kind: ShapeToolKind
  label: string
  glyph: string
}

export const SHAPE_OPTIONS: readonly ShapeOption[] = [
  { kind: 'rect', label: 'Rectangle', glyph: '▭' },
  { kind: 'ellipse', label: 'Ellipse', glyph: '◯' },
  { kind: 'triangle', label: 'Triangle', glyph: '△' },
  { kind: 'diamond', label: 'Diamond', glyph: '◇' },
  { kind: 'shape-arrow', label: 'Arrow shape', glyph: '➤' },
]

export const SHAPE_HOLD_MS = 300

// Renderer-module lifetime is the app session. Shape choice is a tool
// preference, not project state, so it deliberately never crosses IPC.
let rememberedShape: ShapeToolKind = 'rect'

export function currentShape(): ShapeToolKind {
  return rememberedShape
}

export function rememberShape(kind: ShapeToolKind): void {
  rememberedShape = kind
}

/** Small timer primitive kept outside Svelte so its boundary is deterministic. */
export class ShapeHoldGesture {
  #timer: ReturnType<typeof setTimeout> | null = null
  #held = false
  readonly #onHold: () => void

  constructor(onHold: () => void) {
    this.#onHold = onHold
  }

  press(): void {
    this.cancel()
    this.#timer = setTimeout(() => {
      this.#timer = null
      this.#held = true
      this.#onHold()
    }, SHAPE_HOLD_MS)
  }

  release(): 'quick' | 'held' {
    if (this.#timer !== null) clearTimeout(this.#timer)
    this.#timer = null
    const outcome = this.#held ? 'held' : 'quick'
    this.#held = false
    return outcome
  }

  cancel(): void {
    if (this.#timer !== null) clearTimeout(this.#timer)
    this.#timer = null
    this.#held = false
  }
}

/** Keep the nub inside rounded panel corners while aiming at the real opener. */
export function tailOffset(anchorCenter: number, placedX: number, panelWidth: number): number {
  const inset = Math.min(12, Math.max(0, panelWidth / 2))
  return Math.min(Math.max(inset, anchorCenter - placedX), Math.max(inset, panelWidth - inset))
}
